package main

type CardColor string

const (
	Red    CardColor = "red"
	Blue   CardColor = "blue"
	Green  CardColor = "green"
	Yellow CardColor = "yellow"
	Wild   CardColor = "wild"
)

type CardValue string

const (
	Zero    CardValue = "0"
	One     CardValue = "1"
	Two     CardValue = "2"
	Three   CardValue = "3"
	Four    CardValue = "4"
	Five    CardValue = "5"
	Six     CardValue = "6"
	Seven   CardValue = "7"
	Eight   CardValue = "8"
	Nine    CardValue = "9"
	Skip    CardValue = "skip"
	Reverse CardValue = "reverse"
	Draw2   CardValue = "draw2"
	WildCard CardValue = "wild"
	Draw4   CardValue = "draw4"
)

type CardData struct {
	ID          string    `json:"id"`
	Color       CardColor `json:"color"`
	Value       CardValue `json:"value"`
	ChosenColor CardColor `json:"chosenColor,omitempty"`
}

type Difficulty string

const (
	Easy   Difficulty = "easy"
	Medium Difficulty = "medium"
	Hard   Difficulty = "hard"
)

type Player struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Hand           []CardData `json:"hand"`
	IsLocal        bool       `json:"isLocal"`
	HasShoutedUno  bool       `json:"hasShoutedUNO"`
	Difficulty     Difficulty `json:"difficulty,omitempty"`
	IsReady        bool       `json:"isReady"`
}

type GameStatus string

const (
	Lobby   GameStatus = "lobby"
	Playing GameStatus = "playing"
	Ended   GameStatus = "ended"
)

type GameState struct {
	Deck                        []CardData `json:"deck"`
	DiscardPile                 []CardData `json:"discardPile"`
	Players                     []Player   `json:"players"`
	CurrentPlayerIndex          int        `json:"currentPlayerIndex"`
	Direction                   int        `json:"direction"` // 1 or -1
	Status                      GameStatus `json:"status"`
	RoomCode                    string     `json:"roomCode"`
	Winner                      string     `json:"winner"`
	TimeLeft                    int        `json:"timeLeft"`
	DrawStack                   int        `json:"drawStack"`
	CurrentWildColor            CardColor  `json:"currentWildColor"`
	PendingWildColorPlayerIndex *int       `json:"pendingWildColorPlayerIndex"`
	PendingUnoPlayerID          string     `json:"pendingUNOPlayerId"`
	JumpInPlayerID              string     `json:"jumpInPlayerId"`
	Spectators                  []Player   `json:"spectators"`
	IsReverseActive             bool       `json:"isReverseActive"`
	IsDevMode                   bool       `json:"isDevMode"`
	PlayerLeftMessage           string     `json:"playerLeftMessage,omitempty"`
}
