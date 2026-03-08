package main

import (
	"fmt"
	"math/rand"
	"time"

	"github.com/google/uuid"
)

func (r *Room) StartGame() {
	if len(r.State.Players) < 2 {
		return
	}

	fullDeck := CreateDeck()
	
	// Setup players
	for i := range r.State.Players {
		p := &r.State.Players[i]
		p.Employees = CreateEmployees()
		p.Hand = []SkillCard{}
		p.MaxMana = 1
		p.Mana = 1
		
		// Add their ultimate card
		p.Hand = append(p.Hand, CreateUltimateCard(p.Department))
		
		// Draw initial 4 cards
		for j := 0; j < 4; j++ {
			if len(fullDeck) == 0 {
				break
			}
			card := fullDeck[len(fullDeck)-1]
			fullDeck = fullDeck[:len(fullDeck)-1]
			p.Hand = append(p.Hand, card)
		}
	}

	r.InternalState = InternalState{
		Deck:        fullDeck,
		DiscardPile: []SkillCard{},
	}

	r.State.CurrentPlayerIndex = 0
	r.State.Status = StatusPlaying
	r.State.TurnNumber = 1
	r.State.DeckCount = len(r.InternalState.Deck)
	r.State.DiscardCount = 0
	r.State.TimeLeft = 60
	r.State.EventMessage = "游戏开始！"

	// Start turn timer
	go r.StartTimer()
}

func (r *Room) StartTimer() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		<-ticker.C
		r.Mutex.Lock()
		if r.State.Status != StatusPlaying {
			r.Mutex.Unlock()
			return
		}
		
		r.State.TimeLeft--
		if r.State.TimeLeft <= 0 {
			r.EndTurn(r.State.Players[r.State.CurrentPlayerIndex].ID)
		}
		r.updateStateLocked()
		r.Mutex.Unlock()
	}
}

func (r *Room) EndTurn(playerID string) {
	if r.State.Status != StatusPlaying {
		return
	}
	currentPlayer := &r.State.Players[r.State.CurrentPlayerIndex]
	if currentPlayer.ID != playerID {
		return
	}

	// Move to next player
	r.State.CurrentPlayerIndex = (r.State.CurrentPlayerIndex + 1) % len(r.State.Players)
	nextPlayer := &r.State.Players[r.State.CurrentPlayerIndex]
	
	if r.State.CurrentPlayerIndex == 0 {
		r.State.TurnNumber++
	}

	// Apply start-of-turn buffs/debuffs for nextPlayer
	
	// 1. Max Mana calculation
	nextPlayer.MaxMana += 1
	if nextPlayer.MaxMana > 10 {
		nextPlayer.MaxMana = 10
	}
	
	actualMaxMana := nextPlayer.MaxMana - nextPlayer.ManaDebuff
	if actualMaxMana < 1 {
		actualMaxMana = 1
	}
	nextPlayer.ManaDebuff = 0 // clear
	
	// 2. Refill mana
	nextPlayer.Mana = actualMaxMana
	
	// 3. Clear other debuffs
	nextPlayer.CostFloor = 0
	nextPlayer.ShieldActive = false
	
	// 4. Draw card
	drawCount := 1 - nextPlayer.DrawDebuff
	if drawCount < 0 { drawCount = 0 }
	nextPlayer.DrawDebuff = 0 // clear

	for i := 0; i < drawCount; i++ {
		r.drawCardForPlayer(nextPlayer)
	}

	r.State.TimeLeft = 60
	r.State.EventMessage = fmt.Sprintf("现在是 %s 的回合", nextPlayer.Name)
}

func (r *Room) drawCardForPlayer(player *Player) {
	if len(r.InternalState.Deck) == 0 {
		// Reshuffle discard into deck if possible
		if len(r.InternalState.DiscardPile) > 0 {
			r.InternalState.Deck = Shuffle(r.InternalState.DiscardPile)
			r.InternalState.DiscardPile = []SkillCard{}
			r.State.EventMessage = "弃牌堆洗入牌库"
		} else {
			return // literally no cards left
		}
	}
	
	card := r.InternalState.Deck[len(r.InternalState.Deck)-1]
	r.InternalState.Deck = r.InternalState.Deck[:len(r.InternalState.Deck)-1]
	player.Hand = append(player.Hand, card)
	
	r.State.DeckCount = len(r.InternalState.Deck)
	r.State.DiscardCount = len(r.InternalState.DiscardPile)
}

func (r *Room) PlayCard(playerID string, cardID string, targetEmployeeID string) {
	if r.State.Status != StatusPlaying {
		return
	}

	playerIndex := r.State.CurrentPlayerIndex
	currentPlayer := &r.State.Players[playerIndex]
	
	if currentPlayer.ID != playerID {
		return
	}

	// Find card in hand
	cardIndex := -1
	for i, c := range currentPlayer.Hand {
		if c.ID == cardID {
			cardIndex = i
			break
		}
	}

	if cardIndex == -1 {
		return
	}

	card := currentPlayer.Hand[cardIndex]

	// Check Mana
	if currentPlayer.Mana < card.Cost {
		r.State.EventMessage = "法力不足"
		return
	}
	
	// Check CostFloor Debuff
	if card.Cost <= currentPlayer.CostFloor && card.Cost > 0 { // allow 0 cost cards? rules say "can't play 3 or less"? Wait, rule: "无法打出3费以上的牌" -> Cost Ceiling!
		// Let's implement CostCeiling (if CostFloor logic was inverted)
		// Oh, the implementation plan said: "无法打出3费以上的牌" -> cannot play cards with Cost > 3
		if card.Cost > currentPlayer.CostFloor && currentPlayer.CostFloor > 0 {
			r.State.EventMessage = "受预算削减影响，无法打出高费卡"
			return
		}
	}

	// Pay costs
	currentPlayer.Mana -= card.Cost
	currentPlayer.Hand = append(currentPlayer.Hand[:cardIndex], currentPlayer.Hand[cardIndex+1:]...)

	// Execute Effect
	r.resolveCardEffect(currentPlayer, playerIndex, card, targetEmployeeID)

	// Discard
	r.InternalState.DiscardPile = append(r.InternalState.DiscardPile, card)
	r.State.DiscardCount = len(r.InternalState.DiscardPile)
	
	r.State.LastAction = fmt.Sprintf("%s 打出了 [%s]", currentPlayer.Name, card.Name)

	r.CheckWinCondition()
}

func (r *Room) resolveCardEffect(player *Player, playerIndex int, card SkillCard, targetEmpID string) {
	opponentIndex := (playerIndex + 1) % len(r.State.Players)
	opponent := &r.State.Players[opponentIndex]
	
	// Interference Shield Check
	if card.CardType == CardTypeInterfere && opponent.ShieldActive {
		opponent.ShieldActive = false
		r.State.EventMessage = fmt.Sprintf("%s 的居家办公抵消了干扰！", opponent.Name)
		return
	}

	switch card.Effect {
	// === Optimize ===
	case "performance_review": // 2 dmg to 1 emp
		r.damageEmployee(player, targetEmpID, 2)
	case "pip_review": // 3 dmg to 1 emp
		r.damageEmployee(player, targetEmpID, 3)
	case "bottom_eliminate": // remove lowest HP emp
		if len(player.Employees) > 0 {
			lowestIdx := 0
			for i := 1; i < len(player.Employees); i++ {
				if player.Employees[i].HP < player.Employees[lowestIdx].HP {
					lowestIdx = i
				}
			}
			r.damageEmployee(player, player.Employees[lowestIdx].ID, 99)
		}
	case "pointless_overtime": // 1 dmg to all own
		for i := len(player.Employees) - 1; i >= 0; i-- {
			r.damageEmployee(player, player.Employees[i].ID, 1)
		}

	// === Interfere ===
	case "cross_dept_meeting": // opponent max mana -2 next turn
		opponent.ManaDebuff += 2
	case "urgent_request": // add P1 to opponent
		opponent.Employees = append(opponent.Employees, Employee{
			ID:    fmt.Sprintf("emp-%s", uuid.New().String()[:8]),
			Level: 1,
			Name:  "突发需求(P1)",
			HP:    1,
			MaxHP: 1,
		})
	case "dingtalk_bomb": // opponent draw -1
		opponent.DrawDebuff += 1

	// === Buff ===
	case "coffee_boost": // draw 2
		r.drawCardForPlayer(player)
		r.drawCardForPlayer(player)
	case "flex_work": // current mana +2
		player.Mana += 2

	// === Defense/Special ===
	case "work_from_home": // shield
		player.ShieldActive = true
	case "transfer_employee": // move 1 emp to opponent
		if len(player.Employees) > 0 {
			targetIdx := -1
			for i, emp := range player.Employees {
				if emp.ID == targetEmpID {
					targetIdx = i
					break
				}
			}
			if targetIdx == -1 { targetIdx = 0 } // fallback
			
			emp := player.Employees[targetIdx]
			player.Employees = append(player.Employees[:targetIdx], player.Employees[targetIdx+1:]...)
			opponent.Employees = append(opponent.Employees, emp)
		}
	case "slacking": // random 50/50
		if rand.Float32() < 0.5 {
			r.drawCardForPlayer(player)
			r.drawCardForPlayer(player)
			r.drawCardForPlayer(player)
			r.State.EventMessage = "摸鱼成功：抽3张牌"
		} else {
			if len(player.Hand) > 0 {
				discardIdx := rand.Intn(len(player.Hand))
				r.InternalState.DiscardPile = append(r.InternalState.DiscardPile, player.Hand[discardIdx])
				player.Hand = append(player.Hand[:discardIdx], player.Hand[discardIdx+1:]...)
			}
			r.State.EventMessage = "摸鱼被抓：随机弃1张牌"
		}

	// === Global ===
	case "nine_nine_six": // 1 dmg to all
		for _, p := range []*Player{player, opponent} {
			for i := len(p.Employees) - 1; i >= 0; i-- {
				r.damageEmployee(p, p.Employees[i].ID, 1)
			}
		}

	// === Ultimates ===
	case "system_refactor": // Dev: remove all P1-P2
		for i := len(player.Employees) - 1; i >= 0; i-- {
			if player.Employees[i].Level <= 2 {
				player.Employees = append(player.Employees[:i], player.Employees[i+1:]...)
			}
		}
	case "mega_deal": // Biz: remove 2 random
		for i := 0; i < 2; i++ {
			if len(player.Employees) > 0 {
				idx := rand.Intn(len(player.Employees))
				player.Employees = append(player.Employees[:idx], player.Employees[idx+1:]...)
			}
		}
	case "budget_cut": // Admin: opponent can't play >3 cost
		opponent.CostFloor = 3 // Use CostFloor variable as a ceiling limiter
	case "org_restructure": // Mgmt: swap 1 random
		if len(player.Employees) > 0 && len(opponent.Employees) > 0 {
			idx1 := rand.Intn(len(player.Employees))
			idx2 := rand.Intn(len(opponent.Employees))
			
			emp1 := player.Employees[idx1]
			emp2 := opponent.Employees[idx2]
			
			player.Employees[idx1] = emp2
			opponent.Employees[idx2] = emp1
		}
	}
}

func (r *Room) damageEmployee(player *Player, empID string, amount int) {
	for i, emp := range player.Employees {
		if emp.ID == empID || empID == "" { // "" hits first available if fallback needed
			player.Employees[i].HP -= amount
			if player.Employees[i].HP <= 0 {
				// Target optimized
				player.Employees = append(player.Employees[:i], player.Employees[i+1:]...)
			}
			break
		}
	}
}

func (r *Room) CheckWinCondition() {
	for _, p := range r.State.Players {
		if len(p.Employees) == 0 {
			r.State.Winner = p.Name
			r.State.Status = StatusEnded
			r.State.EventMessage = fmt.Sprintf("%s 成功完成了所有KPI，顺利毕业！", p.Name)
			return
		}
	}
}

func (r *Room) RemovePlayer(playerID string) {
	playerIndex := -1
	for i, p := range r.State.Players {
		if p.ID == playerID {
			playerIndex = i
			break
		}
	}

	if playerIndex != -1 {
		leftPlayerName := r.State.Players[playerIndex].Name
		r.State.Players = append(r.State.Players[:playerIndex], r.State.Players[playerIndex+1:]...)

		if r.State.Status == StatusPlaying {
			r.State.Winner = "对手" // if one leaves, the other wins
			r.State.EventMessage = fmt.Sprintf("玩家 %s 退出游戏，对手不战而胜！", leftPlayerName)
			r.State.Status = StatusEnded
		}
	}
}
