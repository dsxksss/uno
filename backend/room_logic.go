package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"time"
)

const INITIAL_HAND_SIZE = 7

func (r *Room) StartGame() {
	if len(r.State.Players) < 2 {
		return
	}

	fullDeck := CreateDeck()
	players := make([]Player, len(r.State.Players))
	for i, p := range r.State.Players {
		players[i] = Player{
			ID:            p.ID,
			Name:          p.Name,
			Hand:          []CardData{},
			IsLocal:       p.IsLocal,
			HasShoutedUno: false,
			Difficulty:    p.Difficulty,
		}
	}

	for i := 0; i < INITIAL_HAND_SIZE; i++ {
		for j := range players {
			if len(fullDeck) == 0 {
				fullDeck = CreateDeck()
			}
			card := fullDeck[len(fullDeck)-1]
			fullDeck = fullDeck[:len(fullDeck)-1]
			players[j].Hand = append(players[j].Hand, card)
		}
	}

	firstCardIndex := -1
	for i, card := range fullDeck {
		if IsNumberCard(card) {
			firstCardIndex = i
			break
		}
	}

	if firstCardIndex == -1 {
		firstCardIndex = 0
	}

	firstCard := fullDeck[firstCardIndex]
	fullDeck = append(fullDeck[:firstCardIndex], fullDeck[firstCardIndex+1:]...)

	r.State = GameState{
		Deck:               fullDeck,
		DiscardPile:        []CardData{firstCard},
		Players:            players,
		CurrentPlayerIndex: 0,
		Direction:          1,
		Status:             Playing,
		RoomCode:           r.Code,
		TimeLeft:           30,
		DrawStack:          0,
		CurrentWildColor:   "",
		IsDevMode:          r.State.IsDevMode,
		Spectators:         r.State.Spectators,
	}

	go r.StartTimer()
	r.CheckAI()
}

func (r *Room) StartTimer() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		<-ticker.C
		r.Mutex.Lock()
		if r.State.Status != Playing {
			r.Mutex.Unlock()
			return
		}
		
		if r.State.IsReverseActive || r.State.JumpInPlayerID != "" {
			r.Mutex.Unlock()
			continue
		}

		r.State.TimeLeft--
		if r.State.TimeLeft <= 0 {
			r.AutoMove()
		}
		r.updateStateLocked()
		r.Mutex.Unlock()
	}
}

func (r *Room) AutoMove() {
	if r.State.Status != Playing {
		return
	}

	// If someone needs to pick a color, pick one for them
	if r.State.PendingWildColorPlayerIndex != nil {
		pIdx := *r.State.PendingWildColorPlayerIndex
		if pIdx >= 0 && pIdx < len(r.State.Players) {
			colors := []CardColor{Red, Blue, Green, Yellow}
			randomColor := colors[rand.Intn(len(colors))]
			r.ChooseColor(r.State.Players[pIdx].ID, randomColor)
			return
		}
	}

	player := &r.State.Players[r.State.CurrentPlayerIndex]
	topCard := r.State.DiscardPile[len(r.State.DiscardPile)-1]
	lastNum := GetLastNumberValue(r.State.DiscardPile)
	
	var playableCardID string
	for _, card := range player.Hand {
		if CanPlayCard(card, topCard, r.State.DrawStack, r.State.CurrentWildColor, lastNum) {
			playableCardID = card.ID
			break
		}
	}

	if playableCardID != "" {
		r.PlayCardInternal(player.ID, playableCardID)
	} else {
		r.DrawCard(player.ID)
	}
}

func (r *Room) PlayCard(playerID string, cardID string) {
	r.PlayCardInternal(playerID, cardID)
}

func (r *Room) PlayCardInternal(playerID string, cardID string) {
	playerIndex := -1
	for i, p := range r.State.Players {
		if p.ID == playerID {
			playerIndex = i
			break
		}
	}

	if playerIndex == -1 {
		return
	}

	player := &r.State.Players[playerIndex]
	cardIndex := -1
	for i, c := range player.Hand {
		if c.ID == cardID {
			cardIndex = i
			break
		}
	}

	if cardIndex == -1 {
		return
	}

	card := player.Hand[cardIndex]
	topCard := r.State.DiscardPile[len(r.State.DiscardPile)-1]
	lastNum := GetLastNumberValue(r.State.DiscardPile)

	isJumpIn := playerIndex != r.State.CurrentPlayerIndex

	if isJumpIn {
		if !CanJumpIn(card, topCard) {
			return
		}
	} else {
		if !CanPlayCard(card, topCard, r.State.DrawStack, r.State.CurrentWildColor, lastNum) {
			return
		}
	}

	// Rule: Cannot win with an action card
	if len(player.Hand) == 1 && !IsNumberCard(card) {
		return
	}

	player.Hand = append(player.Hand[:cardIndex], player.Hand[cardIndex+1:]...)
	player.HasShoutedUno = false
	r.State.DiscardPile = append(r.State.DiscardPile, card)

	nextDirection := r.State.Direction
	skipNext := false
	newDrawStack := r.State.DrawStack

	if card.Value == Reverse {
		nextDirection = r.State.Direction * -1
		if len(r.State.Players) == 2 && newDrawStack == 0 {
			skipNext = true
		}
	} else if card.Value == Skip {
		if len(r.State.Players) == 2 && newDrawStack > 0 {
			skipNext = false
		} else {
			skipNext = true
		}
	} else if card.Value == Draw2 {
		newDrawStack += 2
	} else if card.Value == Draw4 {
		newDrawStack += 4
	}

	if len(player.Hand) == 0 {
		r.State.Winner = player.Name
		r.State.Status = Ended
		return
	}

	nextPlayerIndex := (playerIndex + nextDirection + len(r.State.Players)) % len(r.State.Players)
	if skipNext {
		nextPlayerIndex = (nextPlayerIndex + nextDirection + len(r.State.Players)) % len(r.State.Players)
	}

	r.State.Direction = nextDirection
	r.State.DrawStack = newDrawStack
	r.State.IsReverseActive = card.Value == Reverse

	if r.State.IsReverseActive {
		time.AfterFunc(1500*time.Millisecond, func() {
			r.Mutex.Lock()
			r.State.IsReverseActive = false
			r.Mutex.Unlock()
			r.UpdateState()
			r.CheckAI()
		})
	}
	if isJumpIn {
		r.State.JumpInPlayerID = player.ID
		time.AfterFunc(2*time.Second, func() {
			r.Mutex.Lock()
			r.State.JumpInPlayerID = ""
			r.Mutex.Unlock()
			r.UpdateState()
			r.CheckAI()
		})
	}

	if card.Color == Wild || card.Value == Draw4 {
		r.State.PendingWildColorPlayerIndex = &playerIndex
		r.State.CurrentPlayerIndex = playerIndex
		r.State.TimeLeft = 30
	} else {
		r.State.CurrentPlayerIndex = nextPlayerIndex
		r.State.TimeLeft = 30
		r.State.CurrentWildColor = ""
		r.State.PendingWildColorPlayerIndex = nil
	}

	if len(player.Hand) == 1 {
		r.State.PendingUnoPlayerID = player.ID
		time.AfterFunc(3*time.Second, func() {
			r.Mutex.Lock()
			if r.State.PendingUnoPlayerID == player.ID {
				// Penalty logic
				r.DrawPenalty(player.ID, 2)
				r.State.PendingUnoPlayerID = ""
			}
			r.Mutex.Unlock()
			r.UpdateState()
			r.CheckAI()
		})
	}

	r.CheckAI()
}

func (r *Room) DrawCard(playerID string) {
	playerIndex := -1
	for i, p := range r.State.Players {
		if p.ID == playerID {
			playerIndex = i
			break
		}
	}

	if playerIndex != r.State.CurrentPlayerIndex || r.State.PendingWildColorPlayerIndex != nil {
		return
	}

	drawCount := r.State.DrawStack
	if drawCount == 0 {
		drawCount = 1
	}

	r.DrawPenalty(playerID, drawCount)

	r.State.DrawStack = 0
	r.State.CurrentPlayerIndex = (r.State.CurrentPlayerIndex + r.State.Direction + len(r.State.Players)) % len(r.State.Players)
	r.State.TimeLeft = 30
	r.CheckAI()
}

func (r *Room) DrawPenalty(playerID string, count int) {
	playerIndex := -1
	for i, p := range r.State.Players {
		if p.ID == playerID {
			playerIndex = i
			break
		}
	}
	if playerIndex == -1 { return }
	player := &r.State.Players[playerIndex]

	for i := 0; i < count; i++ {
		if len(r.State.Deck) == 0 {
			if len(r.State.DiscardPile) <= 1 {
				break
			}
			topCard := r.State.DiscardPile[len(r.State.DiscardPile)-1]
			remaining := r.State.DiscardPile[:len(r.State.DiscardPile)-1]
			r.State.Deck = Shuffle(remaining)
			r.State.DiscardPile = []CardData{topCard}
		}

		card := r.State.Deck[len(r.State.Deck)-1]
		r.State.Deck = r.State.Deck[:len(r.State.Deck)-1]
		player.Hand = append(player.Hand, card)
	}
}

func (r *Room) ShoutUno(playerID string) {
	if r.State.PendingUnoPlayerID == playerID {
		r.State.PendingUnoPlayerID = ""
		for i, p := range r.State.Players {
			if p.ID == playerID {
				r.State.Players[i].HasShoutedUno = true
				time.AfterFunc(2*time.Second, func() {
					r.Mutex.Lock()
					r.State.Players[i].HasShoutedUno = false
					r.Mutex.Unlock()
					r.UpdateState()
				})
				break
			}
		}
	}
	r.CheckAI()
}

func (r *Room) ChooseColor(playerID string, color CardColor) {
	if r.State.PendingWildColorPlayerIndex == nil {
		return
	}

	playerIndex := *r.State.PendingWildColorPlayerIndex
	if r.State.Players[playerIndex].ID != playerID {
		return
	}

	r.State.CurrentWildColor = color
	r.State.PendingWildColorPlayerIndex = nil

	topCard := &r.State.DiscardPile[len(r.State.DiscardPile)-1]
	topCard.ChosenColor = color

	// Advance turn now after color is chosen
	nextPlayerIndex := (r.State.CurrentPlayerIndex + r.State.Direction + len(r.State.Players)) % len(r.State.Players)
	r.State.CurrentPlayerIndex = nextPlayerIndex
	r.State.TimeLeft = 30
	r.CheckAI()
}

func (r *Room) UpdateAISettings(playerID string, aiCount int, difficulty Difficulty) {
	// Only first player (host) can change settings
	if len(r.State.Players) == 0 || r.State.Players[0].ID != playerID {
		return
	}

	if r.State.Status != Lobby {
		return
	}

	// Filter current players to keep only humans
	humans := []Player{}
	for _, p := range r.State.Players {
		// Keep all real human players (they have IsLocal set to true in main.go)
		if p.IsLocal {
			humans = append(humans, p)
		}
	}

	// Limit aiCount so that total players <= 10
	maxAI := 10 - len(humans)
	if aiCount > maxAI {
		aiCount = maxAI
	}
	if aiCount < 0 {
		aiCount = 0
	}

	newPlayers := make([]Player, len(humans))
	copy(newPlayers, humans)

	for i := 0; i < aiCount; i++ {
		newPlayers = append(newPlayers, Player{
			ID:            fmt.Sprintf("ai-%d", i),
			Name:          fmt.Sprintf("机器人 %d", i+1),
			Hand:          []CardData{},
			IsLocal:       false,
			HasShoutedUno: false,
			Difficulty:    difficulty,
		})
	}
	r.State.Players = newPlayers
}

func (r *Room) RemovePlayer(playerID string) {
	playerIndex := -1
	for i, p := range r.State.Players {
		if p.ID == playerID {
			playerIndex = i
			break
		}
	}

	found := false
	var leftPlayerName string
	var leftPlayerHand []CardData

	if playerIndex != -1 {
		found = true
		leftPlayerName = r.State.Players[playerIndex].Name
		leftPlayerHand = r.State.Players[playerIndex].Hand

		// Remove from slice
		r.State.Players = append(r.State.Players[:playerIndex], r.State.Players[playerIndex+1:]...)

		if r.State.Status == Playing {
			if len(r.State.Players) <= 1 {
				if len(r.State.Players) == 1 {
					r.State.Winner = r.State.Players[0].Name
				}
				r.State.Status = Ended
				return
			}

			// Adjust CurrentPlayerIndex
			if playerIndex < r.State.CurrentPlayerIndex {
				r.State.CurrentPlayerIndex--
			} else if r.State.CurrentPlayerIndex >= len(r.State.Players) {
				r.State.CurrentPlayerIndex = 0
			}

			// Handle PendingWildColorPlayerIndex
			if r.State.PendingWildColorPlayerIndex != nil {
				pendingIdx := *r.State.PendingWildColorPlayerIndex
				if playerIndex == pendingIdx {
					// The person choosing color left. Clear it and move to next player.
					r.State.PendingWildColorPlayerIndex = nil
					r.State.TimeLeft = 30
					// CurrentPlayerIndex is already at 'pendingIdx' (since we were waiting for them)
					// No further adjustment needed, CheckAI will take over for the person now at this index.
				} else if playerIndex < pendingIdx {
					newPendingIdx := pendingIdx - 1
					r.State.PendingWildColorPlayerIndex = &newPendingIdx
				}
			}

			// Reshuffle the leaving player's cards into the deck
			if len(leftPlayerHand) > 0 {
				r.State.Deck = append(r.State.Deck, leftPlayerHand...)
				r.State.Deck = Shuffle(r.State.Deck)
			}

			// Show notification
			r.State.PlayerLeftMessage = fmt.Sprintf("玩家 %s 退出游戏，手牌已洗入牌库", leftPlayerName)
			messageID := fmt.Sprintf("left-%d", time.Now().UnixNano())
			r.State.PendingUnoPlayerID = messageID // Reuse this field or similar for temporary message? No, better just timeout.
			
			// We already have the notification timer below
			time.AfterFunc(3*time.Second, func() {
				r.Mutex.Lock()
				// Only clear if no one else left meanwhile (best effort)
				if r.State.PlayerLeftMessage == fmt.Sprintf("玩家 %s 退出游戏，手牌已洗入牌库", leftPlayerName) {
					r.State.PlayerLeftMessage = ""
				}
				r.Mutex.Unlock()
				r.UpdateState()
			})
		}
	}

	// Also check spectators
	newSpectators := []Player{}
	for _, p := range r.State.Spectators {
		if p.ID == playerID {
			found = true
			continue
		}
		newSpectators = append(newSpectators, p)
	}
	r.State.Spectators = newSpectators

	if !found {
		return
	}

	// Ensure Host priority: If players[0] is AI but there are humans, swap
	hostChanged := false
	var newHostName string

	if len(r.State.Players) > 0 && !startsWith(r.State.Players[0].ID, "ai-") {
		// Already a human host
	} else if len(r.State.Players) > 1 {
		for i := 1; i < len(r.State.Players); i++ {
			if startsWith(r.State.Players[i].ID, "ai-") {
				continue
			}
			// Found a human, swap to host
			r.State.Players[0], r.State.Players[i] = r.State.Players[i], r.State.Players[0]
			hostChanged = true
			newHostName = r.State.Players[0].Name
			
			// If playing, we must also adjust CurrentPlayerIndex to follow the player!
			if r.State.Status == Playing {
				if r.State.CurrentPlayerIndex == 0 {
					r.State.CurrentPlayerIndex = i
				} else if r.State.CurrentPlayerIndex == i {
					r.State.CurrentPlayerIndex = 0
				}
				// Also adjust pendingWildColorPlayerIndex if it was these players
				if r.State.PendingWildColorPlayerIndex != nil {
					idx := *r.State.PendingWildColorPlayerIndex
					if idx == 0 {
						newIdx := i
						r.State.PendingWildColorPlayerIndex = &newIdx
					} else if idx == i {
						newIdx := 0
						r.State.PendingWildColorPlayerIndex = &newIdx
					}
				}
			}
			break
		}
	}

	if hostChanged {
		r.State.HostChangeMessage = fmt.Sprintf("房主已离开，%s 成为新任房主", newHostName)
		time.AfterFunc(3*time.Second, func() {
			r.Mutex.Lock()
			r.State.HostChangeMessage = ""
			r.Mutex.Unlock()
			r.UpdateState()
		})
	}

	// Trigger AI if it's their turn now
	if r.State.Status == Playing {
		r.CheckAI()
	}
}

func (r *Room) TransferHost(currentHostID string, targetPlayerID string) {
	if len(r.State.Players) == 0 || r.State.Players[0].ID != currentHostID {
		return
	}

	if currentHostID == targetPlayerID {
		return
	}

	targetIndex := -1
	for i, p := range r.State.Players {
		if p.ID == targetPlayerID {
			targetIndex = i
			break
		}
	}

	if targetIndex == -1 || startsWith(targetPlayerID, "ai-") {
		return
	}

	// Swap indices to make target the host (index 0)
	r.State.Players[0], r.State.Players[targetIndex] = r.State.Players[targetIndex], r.State.Players[0]
	
	// Adjust CurrentPlayerIndex if playing
	if r.State.Status == Playing {
		if r.State.CurrentPlayerIndex == 0 {
			r.State.CurrentPlayerIndex = targetIndex
		} else if r.State.CurrentPlayerIndex == targetIndex {
			r.State.CurrentPlayerIndex = 0
		}
	}

	r.State.HostChangeMessage = fmt.Sprintf("房主已将权限转让给 %s", r.State.Players[0].Name)
	time.AfterFunc(3*time.Second, func() {
		r.Mutex.Lock()
		r.State.HostChangeMessage = ""
		r.Mutex.Unlock()
		r.UpdateState()
	})
}

func (r *Room) KickPlayer(currentHostID string, targetPlayerID string) {
	if len(r.State.Players) == 0 || r.State.Players[0].ID != currentHostID {
		return
	}

	if currentHostID == targetPlayerID {
		return
	}

	// 1. First, tell the target they are kicked by broadcasting a specific message
	// Or we can just set a special state field.
	var targetName string
	for _, p := range r.State.Players {
		if p.ID == targetPlayerID {
			targetName = p.Name
			break
		}
	}
	if targetName == "" {
		for _, p := range r.State.Spectators {
			if p.ID == targetPlayerID {
				targetName = p.Name
				break
			}
		}
	}

	if targetName == "" {
		return
	}

	// Set kick message for everyone to see
	r.State.KickMessage = fmt.Sprintf("房主已将 %s 移出房间", targetName)
	
	// Create a message specifically for the kicked person if needed, 
	// but UpdateState will reach them before they are removed from Clients map.
	
	// 2. Perform Removal
	r.RemovePlayer(targetPlayerID)
	
	// 3. Close their connection
	if client, ok := r.Clients[targetPlayerID]; ok {
		// Send a final state update so they see the kick message before closure
		// We'll give it a tiny delay in the read/write pump usually, 
		// but here we can just delete from map after update.
		delete(r.Clients, targetPlayerID)
		
		// Optional: send explicit KICKED message
		kickNotify, _ := json.Marshal(Message{Type: "KICKED"})
		client.Send <- kickNotify
	}

	// Clear message after 3 seconds
	time.AfterFunc(3*time.Second, func() {
		r.Mutex.Lock()
		r.State.KickMessage = ""
		r.Mutex.Unlock()
		r.UpdateState()
	})
}


func (r *Room) CheckAI() {
	if r.State.Status != Playing {
		return
	}

	// 1. Handle Pending UNO Shout
	if r.State.PendingUnoPlayerID != "" {
		pIdx := -1
		for i, p := range r.State.Players {
			if p.ID == r.State.PendingUnoPlayerID { pIdx = i; break }
		}
		if pIdx != -1 && !startsWith(r.State.Players[pIdx].ID, "ai-") {
			// Real player, we don't act for them
		} else if pIdx != -1 {
			// Bot needs to shout UNO
			diff := r.State.Players[pIdx].Difficulty
			if diff == "" { diff = Medium }
			
			delay := 1000 + rand.Intn(1000)
			if diff == Easy { delay = 1500 + rand.Intn(1000) }
			if diff == Hard { delay = 400 + rand.Intn(400) }
			
			pID := r.State.PendingUnoPlayerID
			time.AfterFunc(time.Duration(delay)*time.Millisecond, func() {
				r.Mutex.Lock()
				defer r.Mutex.Unlock()
				if r.State.PendingUnoPlayerID == pID {
					// 80% chance to shout UNO
					if rand.Float32() < 0.8 {
						r.ShoutUno(pID)
						r.updateStateLocked()
					}
				}
			})
			// Do not return! Let it continue to Choosing Color or Normal Turn
		}
	}

	// 2. Handle Choosing Color
	if r.State.PendingWildColorPlayerIndex != nil {
		pIdx := *r.State.PendingWildColorPlayerIndex
		if pIdx >= 0 && pIdx < len(r.State.Players) {
			player := &r.State.Players[pIdx]
			if !startsWith(player.ID, "ai-") { return }
			
			diff := player.Difficulty
			if diff == "" { diff = Medium }
			delay := 1000
			if diff == Hard { delay = 500 }
			
			pID := player.ID
			time.AfterFunc(time.Duration(delay)*time.Millisecond, func() {
				r.Mutex.Lock()
				defer r.Mutex.Unlock()
				if r.State.PendingWildColorPlayerIndex != nil && r.State.Players[*r.State.PendingWildColorPlayerIndex].ID == pID {
					colors := []CardColor{Red, Blue, Green, Yellow}
					counts := make([]int, 4)
					for _, c := range r.State.Players[*r.State.PendingWildColorPlayerIndex].Hand {
						for i, col := range colors {
							if c.Color == col { counts[i]++; break }
						}
					}
					maxIdx := 0
					for i, count := range counts {
						if count > counts[maxIdx] { maxIdx = i }
					}
					r.ChooseColor(pID, colors[maxIdx])
					r.updateStateLocked()
				}
			})
			return
		}
	}

	// 3. Normal Turn
	if r.State.CurrentPlayerIndex < 0 || r.State.CurrentPlayerIndex >= len(r.State.Players) {
		return
	}
	player := &r.State.Players[r.State.CurrentPlayerIndex]
	if !startsWith(player.ID, "ai-") {
		return
	}

	// Block AI if animation is playing
	if r.State.IsReverseActive || r.State.JumpInPlayerID != "" {
		return
	}

	diff := player.Difficulty
	if diff == "" { diff = Medium }
	
	delay := 800
	if diff == Easy { delay = 1500 + rand.Intn(1000) }
	if diff == Medium { delay = 500 + rand.Intn(400) }
	if diff == Hard { delay = 50 + rand.Intn(100) }

	pID := player.ID
	time.AfterFunc(time.Duration(delay)*time.Millisecond, func() {
		r.Mutex.Lock()
		defer r.Mutex.Unlock()
		
		if r.State.Status != Playing || r.State.Players[r.State.CurrentPlayerIndex].ID != pID {
			return
		}
		if r.State.IsReverseActive || r.State.JumpInPlayerID != "" || r.State.PendingWildColorPlayerIndex != nil {
			// Reschedule? Actually CheckAI will be called when these finish
			return
		}

		topCard := r.State.DiscardPile[len(r.State.DiscardPile)-1]
		lastNum := GetLastNumberValue(r.State.DiscardPile)
		
		var playableCardID string
		playableCards := []CardData{}
		isLastCard := len(r.State.Players[r.State.CurrentPlayerIndex].Hand) == 1
		for _, card := range r.State.Players[r.State.CurrentPlayerIndex].Hand {
			if CanPlayCard(card, topCard, r.State.DrawStack, r.State.CurrentWildColor, lastNum) {
				// Rule: Cannot win with an action card
				if isLastCard && !IsNumberCard(card) {
					continue
				}
				playableCards = append(playableCards, card)
			}
		}

		if len(playableCards) > 0 {
			if diff == Hard {
				// Strat: punishment
				hasNearWinner := false
				for i, p := range r.State.Players {
					if i != r.State.CurrentPlayerIndex && len(p.Hand) <= 2 {
						hasNearWinner = true
						break
					}
				}
				
				if hasNearWinner {
					// Try to play action cards
					for _, c := range playableCards {
						if c.Value == Draw4 || c.Value == Draw2 || c.Value == Skip || c.Value == Reverse {
							playableCardID = c.ID
							break
						}
					}
				}
				
				if playableCardID == "" {
					// Priority: match most common color
					colorCounts := map[CardColor]int{Red: 0, Blue: 0, Green: 0, Yellow: 0}
					for _, c := range r.State.Players[r.State.CurrentPlayerIndex].Hand {
						if c.Color != Wild { colorCounts[c.Color]++ }
					}
					var bestColor CardColor
					maxC := -1
					for col, count := range colorCounts {
						if count > maxC { maxC = count; bestColor = col }
					}
					for _, c := range playableCards {
						if c.Color == bestColor && c.Value != WildCard && c.Value != Draw4 {
							playableCardID = c.ID
							break
						}
					}
				}
			}
			if playableCardID == "" {
				playableCardID = playableCards[0].ID
			}
			r.PlayCardInternal(pID, playableCardID)
		} else {
			r.DrawCard(pID)
		}
		r.updateStateLocked()
	})
}


func startsWith(s, prefix string) bool {
	return len(s) >= len(prefix) && s[0:len(prefix)] == prefix
}

