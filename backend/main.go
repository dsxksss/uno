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
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // For development purposes
	},
}

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type Client struct {
	ID   string
	Room *Room
	Conn *websocket.Conn
	Send chan []byte
}

type Room struct {
	Code      string
	Clients   map[string]*Client
	State     GameState
	Mutex     sync.Mutex
	Broadcast chan []byte
}

var (
	rooms      = make(map[string]*Room)
	roomsMutex sync.Mutex
)

func NewRoom(code string) *Room {
	return &Room{
		Code:      code,
		Clients:   make(map[string]*Client),
		Broadcast: make(chan []byte),
		State: GameState{
			Status: Lobby,
			RoomCode: code,
			Direction: 1,
			CurrentPlayerIndex: 0,
			TimeLeft: 30,
			Players: []Player{},
			Deck: []CardData{},
			DiscardPile: []CardData{},
		},
	}
}

func (r *Room) Run() {
	for {
		select {
		case msg := <-r.Broadcast:
			for id, client := range r.Clients {
				select {
				case client.Send <- msg:
				default:
					close(client.Send)
					delete(r.Clients, id)
				}
			}
		}
	}
}

func (r *Room) UpdateState() {
	// Create actual state message
	type StatePayload struct {
		State GameState `json:"state"`
	}
	
	payload, _ := json.Marshal(StatePayload{State: r.State})
	fullMsg, _ := json.Marshal(Message{
		Type:    "UPDATE_STATE",
		Payload: payload,
	})
	
	r.Broadcast <- fullMsg
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	client := &Client{
		ID:   NewID(),
		Conn: conn,
		Send: make(chan []byte, 256),
	}

	go client.writePump()
	go client.readPump()
	
	// Send client ID
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
		}
		c.Conn.Close()
	}()

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("unmarshal error: %v", err)
			continue
		}

		c.handleMessage(msg)
	}
}

func (c *Client) writePump() {
	defer func() {
		c.Conn.Close()
	}()
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
			ID:      c.ID,
			Name:    payload.PlayerName,
			Hand:    []CardData{},
			IsLocal: true,
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
			errorPayload, _ := json.Marshal(map[string]string{
				"message": "找不到该房间，请检查代码是否正确",
			})
			errorMsg, _ := json.Marshal(Message{
				Type:    "ERROR",
				Payload: errorPayload,
			})
			c.Send <- errorMsg
			return
		}
		
		room.Mutex.Lock()
		
		// Check for duplicate names
		nameExists := false
		for _, p := range room.State.Players {
			if p.Name == payload.PlayerName {
				nameExists = true
				break
			}
		}
		
		if nameExists {
			room.Mutex.Unlock()
			errorPayload, _ := json.Marshal(map[string]string{
				"message": "房间中已存在同名玩家，请换个名字",
			})
			errorMsg, _ := json.Marshal(Message{
				Type:    "ERROR",
				Payload: errorPayload,
			})
			c.Send <- errorMsg
			return
		}
		
		c.Room = room
		room.Clients[c.ID] = c
		room.State.Players = append(room.State.Players, Player{
			ID:      c.ID,
			Name:    payload.PlayerName,
			Hand:    []CardData{},
			IsLocal: true,
		})
		room.Mutex.Unlock()
		
		room.UpdateState()

	case "START_GAME":
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		// Only host (first player) can start
		if len(c.Room.State.Players) > 0 && c.Room.State.Players[0].ID == c.ID {
			c.Room.StartGame()
		}
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()
		
	case "UPDATE_AI_SETTINGS":
		var payload struct {
			AiCount    int        `json:"aiCount"`
			Difficulty Difficulty `json:"difficulty"`
		}
		json.Unmarshal(msg.Payload, &payload)
		
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		c.Room.UpdateAISettings(c.ID, payload.AiCount, payload.Difficulty)
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()

	case "LEAVE_ROOM":
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		c.Room.RemovePlayer(c.ID)
		delete(c.Room.Clients, c.ID)
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()
		c.Room = nil

	case "GET_ROOM_LIST":
		roomsMutex.Lock()
		activeRooms := []map[string]interface{}{}
		for _, r := range rooms {
			if r.State.Status == Lobby && len(r.State.Players) > 0 {
				hostName := "未知"
				if len(r.State.Players) > 0 {
					hostName = r.State.Players[0].Name
				}
				activeRooms = append(activeRooms, map[string]interface{}{
					"code":        r.Code,
					"playerCount": len(r.State.Players),
					"hostName":    hostName,
				})
			}
		}
		roomsMutex.Unlock()

		payload, _ := json.Marshal(map[string]interface{}{
			"rooms": activeRooms,
		})
		infoMsg, _ := json.Marshal(Message{
			Type:    "ROOM_LIST",
			Payload: payload,
		})
		c.Send <- infoMsg
		
	case "PLAY_CARD":
		var payload struct {
			CardID string `json:"cardId"`
		}
		json.Unmarshal(msg.Payload, &payload)
		
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		c.Room.PlayCard(c.ID, payload.CardID)
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()

	case "DRAW_CARD":
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		c.Room.DrawCard(c.ID)
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()

	case "CHOOSE_COLOR":
		var payload struct {
			Color CardColor `json:"color"`
		}
		json.Unmarshal(msg.Payload, &payload)
		
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		c.Room.ChooseColor(c.ID, payload.Color)
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()
		
	case "SHOUT_UNO":
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		c.Room.ShoutUno(c.ID)
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()
	}
}

func main() {
	host := flag.String("host", "0.0.0.0", "host to bind to")
	port := flag.Int("port", 8080, "port to bind to")
	flag.Parse()

	rand.Seed(time.Now().UnixNano())
	
	http.HandleFunc("/ws", handleWebSocket)
	
	fs := http.FileServer(http.Dir("../dist"))
	http.Handle("/", fs)
	
	addr := fmt.Sprintf("%s:%d", *host, *port)
	log.Printf("Server starting on %s\n", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
}
