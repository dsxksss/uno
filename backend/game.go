package main

import (
	"fmt"
	"math/rand"
	"time"

	"github.com/google/uuid"
)

// === Employee Templates ===

type EmployeeTemplate struct {
	Level int
	Name  string
	HP    int
}

var StartingEmployees = []EmployeeTemplate{
	{Level: 1, Name: "实习生", HP: 1},
	{Level: 1, Name: "实习生", HP: 1},
	{Level: 2, Name: "初级员工", HP: 2},
	{Level: 2, Name: "初级员工", HP: 2},
	{Level: 3, Name: "骨干员工", HP: 3},
}

func CreateEmployees() []Employee {
	employees := make([]Employee, len(StartingEmployees))
	for i, t := range StartingEmployees {
		employees[i] = Employee{
			ID:    fmt.Sprintf("emp-%s", uuid.New().String()[:8]),
			Level: t.Level,
			Name:  t.Name,
			HP:    t.HP,
			MaxHP: t.HP,
		}
	}
	return employees
}

// === Card Templates ===

type CardTemplate struct {
	Name        string
	Description string
	Cost        int
	CardType    SkillCardType
	Effect      string
	Count       int // How many copies in the deck
}

var SharedCardTemplates = []CardTemplate{
	// Optimization cards (damage YOUR employees = progress KPI)
	{"绩效考核", "对己方1名员工造成2点伤害", 1, CardTypeOptimize, "performance_review", 6},
	{"PIP考核", "对己方1名员工造成3点伤害", 2, CardTypeOptimize, "pip_review", 4},
	{"末位淘汰", "直接移除己方HP最低的员工", 3, CardTypeOptimize, "bottom_eliminate", 3},
	{"无效加班", "对己方全体员工各造成1点伤害", 2, CardTypeOptimize, "pointless_overtime", 3},

	// Interference cards (slow down opponent)
	{"跨部门会议", "对手下回合最大法力-2", 2, CardTypeInterfere, "cross_dept_meeting", 4},
	{"紧急需求", "给对手添加1个P1实习生", 3, CardTypeInterfere, "urgent_request", 3},
	{"钉钉轰炸", "对手下回合少抽1张牌", 2, CardTypeInterfere, "dingtalk_bomb", 3},

	// Buff cards
	{"咖啡激励", "抽2张牌", 1, CardTypeBuff, "coffee_boost", 4},
	{"弹性工作制", "本回合+2法力", 0, CardTypeBuff, "flex_work", 3},

	// Defense/Special cards
	{"居家办公", "抵消对手下一次干扰效果", 2, CardTypeDefense, "work_from_home", 3},
	{"调岗安排", "将己方1名员工转移到对手部门", 2, CardTypeDefense, "transfer_employee", 3},
	{"摸鱼卡", "随机效果：50%抽3张牌 / 50%丢弃1张手牌", 1, CardTypeDefense, "slacking", 4},

	// Global event cards
	{"全员996", "所有员工（双方）各受1点伤害", 4, CardTypeGlobal, "nine_nine_six", 2},
}

// Department ultimate cards
var UltimateCards = map[Department]CardTemplate{
	DeptDev:      {"系统重构", "直接移除己方所有P1-P2员工", 6, CardTypeUltimate, "system_refactor", 1},
	DeptBusiness: {"超级大单", "直接移除己方2名随机员工", 6, CardTypeUltimate, "mega_deal", 1},
	DeptAdmin:    {"预算削减", "对手下回合无法打出3费以上的牌", 5, CardTypeUltimate, "budget_cut", 1},
	DeptMgmt:     {"组织调整", "随机交换双方各1名员工", 5, CardTypeUltimate, "org_restructure", 1},
}

func CreateDeck() []SkillCard {
	deck := []SkillCard{}
	seed := time.Now().UnixNano()
	idCounter := 0

	for _, tmpl := range SharedCardTemplates {
		for i := 0; i < tmpl.Count; i++ {
			deck = append(deck, SkillCard{
				ID:          fmt.Sprintf("card-%d-%d", seed, idCounter),
				Name:        tmpl.Name,
				Description: tmpl.Description,
				Cost:        tmpl.Cost,
				CardType:    tmpl.CardType,
				Effect:      tmpl.Effect,
			})
			idCounter++
		}
	}

	return Shuffle(deck)
}

func CreateUltimateCard(dept Department) SkillCard {
	tmpl, ok := UltimateCards[dept]
	if !ok {
		tmpl = UltimateCards[DeptDev] // fallback
	}
	return SkillCard{
		ID:          fmt.Sprintf("ult-%s", uuid.New().String()[:8]),
		Name:        tmpl.Name,
		Description: tmpl.Description,
		Cost:        tmpl.Cost,
		CardType:    tmpl.CardType,
		Effect:      tmpl.Effect,
	}
}

func Shuffle(deck []SkillCard) []SkillCard {
	newDeck := make([]SkillCard, len(deck))
	copy(newDeck, deck)
	rand.Shuffle(len(newDeck), func(i, j int) {
		newDeck[i], newDeck[j] = newDeck[j], newDeck[i]
	})
	return newDeck
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

func startsWith(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}
