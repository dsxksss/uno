package main

import "encoding/json"

// === Department Types ===

type Department string

const (
	DeptDev      Department = "dev"      // 开发部
	DeptBusiness Department = "business" // 业务部
	DeptAdmin    Department = "admin"    // 行政部
	DeptMgmt     Department = "mgmt"     // 管理部
)

// === Employee (打工人) ===

type Employee struct {
	ID       string `json:"id"`
	Level    int    `json:"level"`    // P1=1, P2=2, P3=3, etc.
	Name     string `json:"name"`     // Display name
	HP       int    `json:"hp"`       // Current HP
	MaxHP    int    `json:"maxHP"`    // Max HP
	Shielded bool   `json:"shielded"` // Protected from interference
}

// === Skill Card Types ===

type SkillCardType string

const (
	CardTypeOptimize  SkillCardType = "optimize"  // 优化类：对自己员工造成伤害
	CardTypeInterfere SkillCardType = "interfere" // 干扰类：妨碍对手
	CardTypeBuff      SkillCardType = "buff"      // 增益类：抽牌/加费
	CardTypeDefense   SkillCardType = "defense"   // 防御/特殊类
	CardTypeGlobal    SkillCardType = "global"    // 全局事件
	CardTypeUltimate  SkillCardType = "ultimate"  // 部门终结技
)

type SkillCard struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Description string        `json:"description"`
	Cost        int           `json:"cost"`
	CardType    SkillCardType `json:"cardType"`
	Effect      string        `json:"effect"` // Effect identifier for logic dispatch
}

// === Player ===

type Player struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Department Department `json:"department"`
	Employees  []Employee `json:"employees"`
	Hand       []SkillCard `json:"hand"`
	Mana       int        `json:"mana"`
	MaxMana    int        `json:"maxMana"`
	IsLocal    bool       `json:"isLocal"`
	IsReady    bool       `json:"isReady"`

	// Debuffs / Status effects (cleared each turn)
	ManaDebuff    int  `json:"manaDebuff"`    // Reduce max mana next turn
	DrawDebuff    int  `json:"drawDebuff"`    // Reduce draw count next turn
	CostFloor     int  `json:"costFloor"`     // Can't play cards <= this cost (预算削减)
	ShieldActive  bool `json:"shieldActive"`  // 居家办公: block next interference
}

// === Game Status ===

type GameStatus string

const (
	StatusLobby   GameStatus = "lobby"
	StatusPlaying GameStatus = "playing"
	StatusEnded   GameStatus = "ended"
)

// === Game State (synchronized to all clients) ===

type GameState struct {
	Players            []Player    `json:"players"`
	CurrentPlayerIndex int         `json:"currentPlayerIndex"`
	Status             GameStatus  `json:"status"`
	RoomCode           string      `json:"roomCode"`
	Winner             string      `json:"winner,omitempty"`
	TurnNumber         int         `json:"turnNumber"`
	DeckCount          int         `json:"deckCount"`     // Don't send actual deck to clients
	DiscardCount       int         `json:"discardCount"`
	TimeLeft           int         `json:"timeLeft"`
	LastAction         string      `json:"lastAction,omitempty"`    // Description of last action (for UI log)
	EventMessage       string      `json:"eventMessage,omitempty"` // Temporary toast/event message
}

// Internal state (not sent to clients directly)
type InternalState struct {
	Deck        []SkillCard
	DiscardPile []SkillCard
}

// === Message Protocol ===

type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}
