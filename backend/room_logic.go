package main

import (
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
		r.Mutex.Unlock()
		r.UpdateState()
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

	if r.State.IsReverseActive {
		time.AfterFunc(1500*time.Millisecond, func() {
			r.Mutex.Lock()
			r.State.IsReverseActive = false
			r.Mutex.Unlock()
			r.UpdateState()
		})
	}

	if card.Color == Wild || card.Value == Draw4 {
		r.State.PendingWildColorPlayerIndex = &playerIndex
	} else {
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
		})
	}

	if isJumpIn {
		r.State.JumpInPlayerID = player.ID
		time.AfterFunc(2*time.Second, func() {
			r.Mutex.Lock()
			r.State.JumpInPlayerID = ""
			r.Mutex.Unlock()
			r.UpdateState()
		})
	}
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
	newPlayers := []Player{}
	found := false
	var leftPlayerName string
	var leftPlayerHand []CardData

	for _, p := range r.State.Players {
		if p.ID == playerID {
			found = true
			leftPlayerName = p.Name
			leftPlayerHand = p.Hand
			continue
		}
		newPlayers = append(newPlayers, p)
	}

	r.State.Players = newPlayers

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

	// If game was playing, we might need to adjust CurrentPlayerIndex
	if r.State.Status == Playing {
		if len(newPlayers) <= 1 {
			if len(newPlayers) == 1 {
				r.State.Winner = newPlayers[0].Name
			}
			r.State.Status = Ended
			return
		}

		// Reshuffle the leaving player's cards into the deck
		if len(leftPlayerHand) > 0 {
			r.State.Deck = append(r.State.Deck, leftPlayerHand...)
			r.State.Deck = Shuffle(r.State.Deck)
		}

		// Show notification
		r.State.PlayerLeftMessage = fmt.Sprintf("玩家 %s 退出游戏，手牌已洗入牌库", leftPlayerName)
		time.AfterFunc(3*time.Second, func() {
			r.Mutex.Lock()
			r.State.PlayerLeftMessage = ""
			r.Mutex.Unlock()
			r.UpdateState()
		})

		if r.State.CurrentPlayerIndex >= len(newPlayers) {
			r.State.CurrentPlayerIndex = 0
		}
	}
}


func startsWith(s, prefix string) bool {
	return len(s) >= len(prefix) && s[0:len(prefix)] == prefix
}
