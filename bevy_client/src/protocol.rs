use serde::{Deserialize, Serialize};

// === Wire Protocol (matches Go backend Message struct) ===

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ServerMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

// === Card Types ===

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CardData {
    pub id: String,
    pub color: String,
    pub value: String,
    #[serde(default)]
    pub chosen_color: Option<String>,
}

// === Player ===

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    pub id: String,
    pub name: String,
    pub hand: Vec<CardData>,
    #[serde(default)]
    pub is_local: bool,
    #[serde(default, rename = "hasShoutedUNO")]
    pub has_shouted_uno: bool,
    #[serde(default)]
    pub difficulty: Option<String>,
    #[serde(default)]
    pub is_ready: bool,
}

// === Game State (matches Go backend GameState) ===

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameState {
    pub deck: Vec<CardData>,
    pub discard_pile: Vec<CardData>,
    pub players: Vec<Player>,
    pub current_player_index: i32,
    pub direction: i32,
    pub status: String,
    pub room_code: String,
    #[serde(default)]
    pub winner: Option<String>,
    #[serde(default)]
    pub time_left: i32,
    #[serde(default)]
    pub draw_stack: i32,
    #[serde(default)]
    pub current_wild_color: Option<String>,
    #[serde(default)]
    pub pending_wild_color_player_index: Option<i32>,
    #[serde(default, rename = "pendingUNOPlayerId")]
    pub pending_uno_player_id: Option<String>,
    #[serde(default)]
    pub jump_in_player_id: Option<String>,
    #[serde(default)]
    pub spectators: Vec<Player>,
    #[serde(default)]
    pub is_reverse_active: bool,
    #[serde(default)]
    pub is_dev_mode: bool,
    #[serde(default)]
    pub player_left_message: Option<String>,
    #[serde(default)]
    pub host_change_message: Option<String>,
    #[serde(default)]
    pub play_again_votes: Option<serde_json::Value>,
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
