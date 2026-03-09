mod game;
mod menu;
mod particles;
mod theme;
mod transitions;

use bevy::prelude::*;
use game::GamePlugin;
use menu::MenuPlugin;
use particles::ParticlePlugin;
use transitions::TransitionPlugin;

/// 游戏全局状态
#[derive(States, Debug, Clone, Copy, Eq, PartialEq, Hash, Default)]
pub enum GameState {
    #[default]
    MainMenu,
    Settings,
    DepartmentSelect,
    Matchmaking,
    InGame,
}

#[derive(Resource, Default)]
pub struct SelectedMode(pub String);

/// 菜单子状态（主菜单内的页面）
#[derive(SubStates, Debug, Clone, Copy, Eq, PartialEq, Hash, Default)]
#[source(GameState = GameState::MainMenu)]
pub enum MenuPage {
    #[default]
    Title,
    ModeSelect,
    Credits,
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "职场大逃杀：KPI突围".into(),
                resolution: (1920., 1080.).into(),
                present_mode: bevy::window::PresentMode::AutoVsync,
                cursor_options: bevy::window::CursorOptions {
                    visible: false, // 隐藏原生指针，我们将使用自定义 3A 指针
                    ..default()
                },
                ..default()
            }),
            ..default()
        }))
        .insert_resource(ClearColor(theme::GOTHIC_INK))
        .init_state::<GameState>()
        .add_sub_state::<MenuPage>()
        .init_resource::<SelectedMode>()
        .add_plugins((MenuPlugin, ParticlePlugin, TransitionPlugin, GamePlugin))
        .add_systems(Startup, setup_camera)
        .run();
}

fn setup_camera(mut commands: Commands) {
    commands.spawn((
        Camera2d,
        Camera {
            hdr: true,
            ..default()
        },
        bevy::core_pipeline::bloom::Bloom::NATURAL,
        bevy::core_pipeline::tonemapping::Tonemapping::ReinhardLuminance,
    ));
}
