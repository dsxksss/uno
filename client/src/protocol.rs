use serde::{Deserialize, Serialize};

// === Wire Protocol ===

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ServerMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

// === Employee ===

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Employee {
    pub id: String,
    pub level: i32,
    pub name: String,
    pub hp: i32,
    #[serde(rename = "maxHP")]
    pub max_hp: i32,
    pub shielded: bool,
}

// === Skill Card ===

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SkillCard {
    pub id: String,
    pub name: String,
    pub description: String,
    pub cost: i32,
    pub card_type: String,
    pub effect: String,
}

// === Player ===

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    pub id: String,
    pub name: String,
    pub department: String,
    pub employees: Vec<Employee>,
    pub hand: Vec<SkillCard>,
    pub mana: i32,
    pub max_mana: i32,
    #[serde(default)]
    pub is_local: bool,
    #[serde(default)]
    pub is_ready: bool,

    #[serde(default)]
    pub mana_debuff: i32,
    #[serde(default)]
    pub draw_debuff: i32,
    #[serde(default)]
    pub cost_floor: i32,
    #[serde(default)]
    pub shield_active: bool,
}

// === Game State ===

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameState {
    pub players: Vec<Player>,
    pub current_player_index: i32,
    pub status: String,
    pub room_code: String,
    #[serde(default)]
    pub winner: Option<String>,
    pub turn_number: i32,
    pub deck_count: i32,
    pub discard_count: i32,
    pub time_left: i32,
    #[serde(default)]
    pub last_action: Option<String>,
    #[serde(default)]
    pub event_message: Option<String>,
}

// === State Payload Wrapper ===

#[derive(Deserialize, Debug)]
pub struct StatePayload {
    pub state: GameState,
}

#[derive(Deserialize, Debug)]
pub struct InitPayload {
    pub id: String,
}

#[derive(Deserialize, Debug)]
pub struct RoomListPayload {
    pub rooms: Vec<RoomInfo>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoomInfo {
    pub code: String,
    pub player_count: i32,
    #[serde(default)]
    pub host_name: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct ErrorPayload {
    pub message: String,
}
