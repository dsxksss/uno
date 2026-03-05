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
	Stop      chan struct{}
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
			Status: Lobby,
			RoomCode: code,
			Direction: 1,
			CurrentPlayerIndex: 0,
			TimeLeft: 30,
			Players: []Player{},
			Deck: []CardData{},
			DiscardPile: []CardData{},
			PlayAgainVotes: make(map[string]bool),
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
					// Skip this update if buffer is full instead of closing
					// log.Printf("Warning: Client %s buffer full, skipping update", id)
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
	state := r.State

	// Create actual state message
	type StatePayload struct {
		State GameState `json:"state"`
	}
	
	payload, err := json.Marshal(StatePayload{State: state})
	if err != nil {
		log.Printf("Marshal error: %v", err)
		return
	}
	fullMsg, _ := json.Marshal(Message{
		Type:    "UPDATE_STATE",
		Payload: payload,
	})
	
	// Non-blocking send to prevent deadlocks if the Run loop is stopped
	select {
	case r.Broadcast <- fullMsg:
	case <-time.After(50 * time.Millisecond):
		// Skip if broadcast is blocked
	}
}

func (r *Room) cleanupIfAbandoned() {
	// Acquire locks in safe order: global roomsMutex first, then room Mutex
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
	if !hasHuman {
		for _, p := range r.State.Spectators {
			if p.IsLocal {
				hasHuman = true
				break
			}
		}
	}

	if !hasHuman || len(r.Clients) == 0 {
		if _, exists := rooms[r.Code]; exists {
			log.Printf("Room %s closing: no human players left or no connections\n", r.Code)
			
			// Set status and update others before closing
			r.State.Status = Ended
			// We unlock to call UpdateState which might need the lock (though UpdateState handles its own locking)
			// Wait, r.Mutex is already locked here. UpdateState ALSO locks r.Mutex.
			// This would DEADLOCK!
			
			// We need to call a version of UpdateState that doesn't lock
			r.updateStateLocked()

			delete(rooms, r.Code)
			
			// Use a select to close the Stop channel only once if it exists
			select {
			case <-r.Stop:
				// Already closed
			default:
				close(r.Stop) // Stop the Run goroutine
			}
		}
	}
}

func startPeriodicCleanup() {
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		for range ticker.C {
			roomsMutex.Lock()
			codes := make([]string, 0, len(rooms))
			for code := range rooms {
				codes = append(codes, code)
			}
			roomsMutex.Unlock()

			for _, code := range codes {
				roomsMutex.Lock()
				room, exists := rooms[code]
				roomsMutex.Unlock()
				if exists {
					room.cleanupIfAbandoned()
				}
			}
		}
	}()
}

func startPeriodicRoomListBroadcast() {
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		for range ticker.C {
			roomsMutex.Lock()
			roomList := make([]map[string]interface{}, 0, len(rooms))
			for _, room := range rooms {
				room.Mutex.Lock()
				
				// 获胜后或没有玩家时不显示在房间列表
				if room.State.Status == Ended || len(room.State.Players) == 0 {
					room.Mutex.Unlock()
					continue
				}

				// 检查是否有真人在内
				hasHuman := false
				for _, p := range room.State.Players {
					if p.IsLocal {
						hasHuman = true
						break
					}
				}
				if !hasHuman {
					room.Mutex.Unlock()
					continue
				}

				hostName := "未知"
				if len(room.State.Players) > 0 {
					hostName = room.State.Players[0].Name
				}
				
				roomList = append(roomList, map[string]interface{}{
					"code":        room.Code,
					"playerCount": len(room.State.Players),
					"hostName":    hostName,
					"status":      room.State.Status,
				})
				room.Mutex.Unlock()
			}
			roomsMutex.Unlock()

			if len(roomList) == 0 && len(globalClients) == 0 {
				continue
			}

			payload, _ := json.Marshal(map[string]interface{}{
				"rooms": roomList,
			})
			msg, _ := json.Marshal(Message{
				Type:    "ROOM_LIST",
				Payload: payload,
			})

			clientsMutex.Lock()
			for _, client := range globalClients {
				// Only send to clients who are not in a room (in the lobby)
				if client.Room == nil {
					select {
					case client.Send <- msg:
					default:
					}
				}
			}
			clientsMutex.Unlock()
		}
	}()
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
		Send: make(chan []byte, 512),
	}

	clientsMutex.Lock()
	globalClients[client.ID] = client
	clientsMutex.Unlock()

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
		
		isSpectator := room.State.Status != Lobby || len(room.State.Players) >= 10
		
		if isSpectator {
			room.State.Spectators = append(room.State.Spectators, Player{
				ID:      c.ID,
				Name:    payload.PlayerName,
				Hand:    []CardData{},
				IsLocal: true,
			})
		} else {
			room.State.Players = append(room.State.Players, Player{
				ID:      c.ID,
				Name:    payload.PlayerName,
				Hand:    []CardData{},
				IsLocal: true,
			})
		}
		room.Mutex.Unlock()
		
		room.UpdateState()

	case "START_GAME":
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		// Only host (first player) can start
		if len(c.Room.State.Players) > 0 && c.Room.State.Players[0].ID == c.ID {
			// Check if everyone (except bots) is ready
			allReady := true
			for i, p := range c.Room.State.Players {
				// Host is always considered ready to start if they click Start
				if i == 0 { continue }
				// AI is always ready
				if startsWith(p.ID, "ai-") { continue }
				
				if !p.IsReady {
					allReady = false
					break
				}
			}
			
			if allReady {
				if len(c.Room.State.Players) < 2 {
					errorPayload, _ := json.Marshal(map[string]string{
						"message": "房间人数不足，至少需要 2 人（含机器人）才能开始游戏",
					})
					errorMsg, _ := json.Marshal(Message{
						Type:    "ERROR",
						Payload: errorPayload,
					})
					c.Send <- errorMsg
				} else {
					c.Room.StartGame()
				}
			} else {
				// Broadcast reminder
				remindMsg, _ := json.Marshal(Message{
					Type: "REMIND_READY",
				})
				select {
				case c.Room.Broadcast <- remindMsg:
				case <-time.After(50 * time.Millisecond):
				}
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
		c.Room.cleanupIfAbandoned()
		c.Room = nil

	case "GET_ROOM_LIST":
		roomsMutex.Lock()
		activeRooms := []map[string]interface{}{}
		for _, r := range rooms {
			r.Mutex.Lock()
			// 获胜后或没有玩家时不显示在房间列表
			if r.State.Status == Ended || len(r.State.Players) == 0 {
				r.Mutex.Unlock()
				continue
			}

			// 检查是否有真人在内（可选，但通常公共列表只显示有人的房间）
			hasHuman := false
			for _, p := range r.State.Players {
				if p.IsLocal {
					hasHuman = true
					break
				}
			}
			if !hasHuman {
				r.Mutex.Unlock()
				continue
			}

			hostName := "未知"
			if len(r.State.Players) > 0 {
				hostName = r.State.Players[0].Name
			}
			
			activeRooms = append(activeRooms, map[string]interface{}{
				"code":        r.Code,
				"playerCount": len(r.State.Players),
				"hostName":    hostName,
				"status":      r.State.Status,
			})
			r.Mutex.Unlock()
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
		
	case "TRANSFER_HOST":
		var payload struct {
			TargetPlayerID string `json:"targetPlayerId"`
		}
		json.Unmarshal(msg.Payload, &payload)
		
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		c.Room.TransferHost(c.ID, payload.TargetPlayerID)
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()

	case "KICK_PLAYER":
		var payload struct {
			TargetPlayerID string `json:"targetPlayerId"`
		}
		json.Unmarshal(msg.Payload, &payload)
		
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		c.Room.KickPlayer(c.ID, payload.TargetPlayerID)
		r := c.Room
		r.Mutex.Unlock()
		r.UpdateState()

	case "VOTE_PLAY_AGAIN":
		if c.Room == nil { return }
		c.Room.Mutex.Lock()
		c.Room.VotePlayAgain(c.ID)
		c.Room.Mutex.Unlock()
		c.Room.UpdateState()
	}
}

func main() {
	host := flag.String("host", "0.0.0.0", "host to bind to")
	port := flag.Int("port", 8080, "port to bind to")
	flag.Parse()

	rand.Seed(time.Now().UnixNano())
	
	startPeriodicCleanup()
	startPeriodicRoomListBroadcast()
	
	http.HandleFunc("/ws", handleWebSocket)
	
	fs := http.FileServer(http.Dir("../dist"))
	http.Handle("/", fs)
	
	addr := fmt.Sprintf("%s:%d", *host, *port)
	log.Printf("Server starting on %s\n", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
}
