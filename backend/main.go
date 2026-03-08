package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	ID   string
	Room *Room
	Conn *websocket.Conn
	Send chan []byte
}

type Room struct {
	Code          string
	Clients       map[string]*Client
	State         GameState
	InternalState InternalState
	Mutex         sync.Mutex
	Broadcast     chan []byte
	Stop          chan struct{}
}

var (
	rooms         = make(map[string]*Room)
	roomsMutex    sync.Mutex
	globalClients = make(map[string]*Client)
	clientsMutex  sync.Mutex
)

func NewRoom(code string) *Room {
	return &Room{
		Code:      code,
		Clients:   make(map[string]*Client),
		Broadcast: make(chan []byte),
		Stop:      make(chan struct{}),
		State: GameState{
			Status:   StatusLobby,
			RoomCode: code,
			Players:  []Player{},
		},
	}
}

func (r *Room) Run() {
	for {
		select {
		case msg := <-r.Broadcast:
			r.Mutex.Lock()
			for _, client := range r.Clients {
				select {
				case client.Send <- msg:
				default:
				}
			}
			r.Mutex.Unlock()
		case <-r.Stop:
			return
		}
	}
}

func (r *Room) UpdateState() {
	r.Mutex.Lock()
	r.updateStateLocked()
	r.Mutex.Unlock()
}

func (r *Room) updateStateLocked() {
	type StatePayload struct {
		State GameState `json:"state"`
	}
	
	payload, err := json.Marshal(StatePayload{State: r.State})
	if err != nil {
		return
	}
	
	fullMsg, _ := json.Marshal(Message{
		Type:    "UPDATE_STATE",
		Payload: payload,
	})
	
	select {
	case r.Broadcast <- fullMsg:
	case <-time.After(50 * time.Millisecond):
	}
}

func (r *Room) cleanupIfAbandoned() {
	roomsMutex.Lock()
	defer roomsMutex.Unlock()
	
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	hasHuman := false
	for _, p := range r.State.Players {
		if p.IsLocal {
			hasHuman = true
			break
		}
	}

	if !hasHuman || len(r.Clients) == 0 {
		if _, exists := rooms[r.Code]; exists {
			r.State.Status = StatusEnded
			r.updateStateLocked()
			delete(rooms, r.Code)
			select {
			case <-r.Stop:
			default:
				close(r.Stop)
			}
		}
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := &Client{
		ID:   NewID(),
		Conn: conn,
		Send: make(chan []byte, 512),
	}

	clientsMutex.Lock()
	globalClients[client.ID] = client
	clientsMutex.Unlock()

	go client.writePump()
	go client.readPump()
	
	initInfo, _ := json.Marshal(map[string]string{"id": client.ID})
	initMsg, _ := json.Marshal(Message{Type: "INIT", Payload: initInfo})
	client.Send <- initMsg
}

func (c *Client) readPump() {
	defer func() {
		if c.Room != nil {
			c.Room.Mutex.Lock()
			c.Room.RemovePlayer(c.ID)
			delete(c.Room.Clients, c.ID)
			c.Room.Mutex.Unlock()
			c.Room.UpdateState()
			c.Room.cleanupIfAbandoned()
		}
		
		clientsMutex.Lock()
		delete(globalClients, c.ID)
		clientsMutex.Unlock()

		c.Conn.Close()
	}()

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		c.handleMessage(msg)
	}
}

func (c *Client) writePump() {
	defer c.Conn.Close()
	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)
			if err := w.Close(); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleMessage(msg Message) {
	switch msg.Type {
	case "CREATE_ROOM":
		var payload struct {
			PlayerName string `json:"playerName"`
		}
		json.Unmarshal(msg.Payload, &payload)
		
		code := GenerateRoomCode()
		room := NewRoom(code)
		
		roomsMutex.Lock()
		rooms[code] = room
		roomsMutex.Unlock()
		
		go room.Run()
		
		c.Room = room
		room.Mutex.Lock()
		room.Clients[c.ID] = c
		room.State.Players = append(room.State.Players, Player{
			ID:         c.ID,
			Name:       payload.PlayerName,
			Department: DeptDev, // Default
			Employees:  []Employee{},
			Hand:       []SkillCard{},
			IsLocal:    true,
		})
		room.Mutex.Unlock()
		room.UpdateState()

	case "JOIN_ROOM":
		var payload struct {
			PlayerName string `json:"playerName"`
			RoomCode   string `json:"roomCode"`
		}
		json.Unmarshal(msg.Payload, &payload)
		
		roomCode := strings.ToUpper(strings.TrimSpace(payload.RoomCode))
		roomsMutex.Lock()
		room, exists := rooms[roomCode]
		roomsMutex.Unlock()
		
		if !exists {
			errorMsg, _ := json.Marshal(Message{Type: "ERROR", Payload: []byte(`{"message":"找不到房间"}`)})
			c.Send <- errorMsg
			return
		}
		
		room.Mutex.Lock()
		if len(room.State.Players) >= 2 {
			room.Mutex.Unlock()
			errorMsg, _ := json.Marshal(Message{Type: "ERROR", Payload: []byte(`{"message":"房间已满"}`)})
			c.Send <- errorMsg
			return
		}
		
		c.Room = room
		room.Clients[c.ID] = c
		room.State.Players = append(room.State.Players, Player{
			ID:         c.ID,
			Name:       payload.PlayerName,
			Department: DeptBusiness, // Default for P2
			Employees:  []Employee{},
			Hand:       []SkillCard{},
			IsLocal:    true,
		})
		room.Mutex.Unlock()
		room.UpdateState()

	case "SELECT_DEPT":
		var payload struct {
			Department Department `json:"department"`
		}
		json.Unmarshal(msg.Payload, &payload)
		
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		for i, p := range c.Room.State.Players {
			if p.ID == c.ID {
				c.Room.State.Players[i].Department = payload.Department
				break
			}
		}
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()

	case "TOGGLE_READY":
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		for i, p := range c.Room.State.Players {
			if p.ID == c.ID {
				c.Room.State.Players[i].IsReady = !c.Room.State.Players[i].IsReady
				break
			}
		}
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()

	case "START_GAME":
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		if len(c.Room.State.Players) == 2 {
			c.Room.StartGame()
		}
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()
		
	case "PLAY_CARD":
		var payload struct {
			CardID       string `json:"cardId"`
			TargetEmpID  string `json:"targetEmpId"`
		}
		json.Unmarshal(msg.Payload, &payload)
		
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		c.Room.PlayCard(c.ID, payload.CardID, payload.TargetEmpID)
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()

	case "END_TURN":
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		c.Room.EndTurn(c.ID)
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()

	case "LEAVE_ROOM":
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		c.Room.RemovePlayer(c.ID)
		delete(c.Room.Clients, c.ID)
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()
		c.Room.cleanupIfAbandoned()
		c.Room = nil
	}
}

func main() {
	host := flag.String("host", "0.0.0.0", "host to bind to")
	port := flag.Int("port", 8080, "port to bind to")
	flag.Parse()

	rand.Seed(time.Now().UnixNano())
	
	http.HandleFunc("/ws", handleWebSocket)
	
	addr := fmt.Sprintf("%s:%d", *host, *port)
	log.Printf("Server starting on %s\n", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
}
