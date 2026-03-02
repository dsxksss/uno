package main

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
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
}

func (c *Client) readPump() {
	defer func() {
		if c.Room != nil {
			c.Room.Mutex.Lock()
			delete(c.Room.Clients, c.ID)
			c.Room.Mutex.Unlock()
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
		
		roomsMutex.Lock()
		room, exists := rooms[payload.RoomCode]
		roomsMutex.Unlock()
		
		if !exists {
			// Error: Room not found
			return
		}
		
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

	case "START_GAME":
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		c.Room.StartGame()
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()
		
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
	}
}

func main() {
	rand.Seed(time.Now().UnixNano())
	
	http.HandleFunc("/ws", handleWebSocket)
	
	log.Println("Server starting on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
}
