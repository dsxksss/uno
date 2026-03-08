mod protocol;
mod network;
mod scenes;

use bevy::prelude::*;
use network::LocalClientId;
use protocol::{GameState, RoomInfo};

// === App States ===
#[derive(States, Debug, Clone, Eq, PartialEq, Hash, Default)]
pub enum AppState {
    #[default]
    Lobby,
    Room,
    InGame,
    GameOver,
}

// === Global Resources ===
#[derive(Resource, Default)]
pub struct GameStateRes(pub Option<GameState>);

#[derive(Resource, Default)]
pub struct RoomListRes(pub Vec<RoomInfo>);

#[derive(Resource, Default)]
pub struct ErrorMessage(pub Option<String>);

#[derive(Resource, Default)]
pub struct PlayerName(pub String);

#[derive(Resource, Default)]
pub struct RoomCodeInput(pub String);

fn main() {
    let server_url = "ws://127.0.0.1:8080/ws".to_string();
    let channels = network::spawn_ws_thread(server_url);

    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "职场大逃杀：KPI突围".into(),
                resolution: (1440., 850.).into(),
                ..default()
            }),
            ..default()
        }))
        .init_state::<AppState>()
        .insert_resource(ClearColor(Color::srgb(0.06, 0.06, 0.08))) // Dark background
        .insert_resource(channels)
        .insert_resource(LocalClientId::default())
        .insert_resource(GameStateRes::default())
        .insert_resource(RoomListRes::default())
        .insert_resource(ErrorMessage::default())
        .insert_resource(PlayerName::default())
        .insert_resource(RoomCodeInput::default())
        .add_systems(Startup, setup_camera)
        .add_systems(Update, network::poll_network_events)
        // Scenes
        .add_systems(OnEnter(AppState::Lobby), scenes::lobby::setup_lobby)
        .add_systems(OnExit(AppState::Lobby), scenes::lobby::cleanup_lobby)
        .add_systems(Update, scenes::lobby::lobby_ui.run_if(in_state(AppState::Lobby)))
        
        .add_systems(OnEnter(AppState::Room), scenes::room::setup_room)
        .add_systems(OnExit(AppState::Room), scenes::room::cleanup_room)
        .add_systems(Update, scenes::room::room_ui.run_if(in_state(AppState::Room)))
        
        .add_systems(OnEnter(AppState::InGame), scenes::game::setup_game)
        .add_systems(OnExit(AppState::InGame), scenes::game::cleanup_game)
        .add_systems(Update, (
            scenes::game::update_game_ui,
            scenes::game::game_input
        ).run_if(in_state(AppState::InGame)))
        .add_systems(Update, apply_chinese_font)
        .run();
}

fn setup_camera(mut commands: Commands) {
    commands.spawn(Camera2d);
}

// Automatically apply the Chinese font to any newly spawned text
fn apply_chinese_font(
    asset_server: Res<AssetServer>,
    mut q: Query<&mut TextFont, Added<TextFont>>,
) {
    let font_handle = asset_server.load("fonts/simhei.ttf");
    for mut text_font in &mut q {
        if text_font.font != font_handle {
            text_font.font = font_handle.clone();
        }
    }
}
