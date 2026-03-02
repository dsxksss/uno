package main

import (
	"fmt"
	"math/rand"
	"time"

	"github.com/google/uuid"
)

var (
	Colors = []CardColor{Red, Blue, Green, Yellow}
	Values = []CardValue{Zero, One, Two, Three, Four, Five, Six, Seven, Eight, Nine, Skip, Reverse, Draw2}
	WildValues = []CardValue{WildCard, Draw4}
)

func CreateDeck() []CardData {
	deck := []CardData{}
	seed := time.Now().UnixNano()
	rand.Seed(seed)
	
	idCounter := 0
	for _, color := range Colors {
		for _, value := range Values {
			count := 2
			if value == Zero {
				count = 1
			}
			for i := 0; i < count; i++ {
				deck = append(deck, CardData{
					ID:    fmt.Sprintf("card-%d-%d", seed, idCounter),
					Color: color,
					Value: value,
				})
				idCounter++
			}
		}
	}

	for i := 0; i < 4; i++ {
		deck = append(deck, CardData{
			ID:    fmt.Sprintf("card-%d-%d", seed, idCounter),
			Color: Wild,
			Value: WildCard,
		})
		idCounter++
		deck = append(deck, CardData{
			ID:    fmt.Sprintf("card-%d-%d", seed, idCounter),
			Color: Wild,
			Value: Draw4,
		})
		idCounter++
	}

	return Shuffle(deck)
}

func Shuffle(deck []CardData) []CardData {
	newDeck := make([]CardData, len(deck))
	copy(newDeck, deck)
	rand.Shuffle(len(newDeck), func(i, j int) {
		newDeck[i], newDeck[j] = newDeck[j], newDeck[i]
	})
	return newDeck
}

func CanPlayCard(card CardData, topCard CardData, drawStack int, currentWildColor CardColor, lastNumberValue CardValue) bool {
	effectiveColor := topCard.Color
	if topCard.Color == Wild && currentWildColor != "" {
		effectiveColor = currentWildColor
	}

	if drawStack > 0 {
		if card.Value == Draw2 || card.Value == Draw4 {
			return true
		}
		// Royale rules
		if (card.Value == Reverse || card.Value == Skip) && (card.Color == effectiveColor || card.Value == topCard.Value) {
			return true
		}
		return false
	}

	if card.Color == Wild {
		return true
	}

	matchesCurrent := card.Color == effectiveColor || card.Value == topCard.Value
	matchesLastNumber := lastNumberValue != "" && card.Value == lastNumberValue

	return matchesCurrent || matchesLastNumber
}

func CanJumpIn(card CardData, topCard CardData) bool {
	if !IsNumberCard(card) {
		return false
	}
	return card.Color == topCard.Color && card.Value == topCard.Value
}

func IsNumberCard(card CardData) bool {
	switch card.Value {
	case Skip, Reverse, Draw2, WildCard, Draw4:
		return false
	default:
		return true
	}
}

func GetLastNumberValue(discardPile []CardData) CardValue {
	for i := len(discardPile) - 1; i >= 0; i-- {
		if IsNumberCard(discardPile[i]) {
			return discardPile[i].Value
		}
	}
	return ""
}

func GenerateRoomCode() string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 6)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

func NewID() string {
	return uuid.New().String()
}
