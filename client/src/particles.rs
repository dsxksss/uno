//! 背景粒子特效系统
//!
//! 实现多层粒子：
//! - 漂浮光点（模拟数据流 / 办公楼灯光）
//! - 缓慢上升的"KPI泡泡"
//! - 鼠标附近的互动粒子

use crate::theme;
use crate::GameState;
use bevy::prelude::*;

pub struct ParticlePlugin;

impl Plugin for ParticlePlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(
            OnEnter(GameState::MainMenu),
            (spawn_mouse_cursor,), // Only spawn the custom cursor
        )
        .add_systems(
            Update,
            (update_mouse_glow, update_cursor_animation).run_if(in_state(GameState::MainMenu)),
        )
        .add_systems(OnExit(GameState::MainMenu), cleanup_particles);
    }
}

// ─── 组件 ──────────────────────────────────────────────────

/// 鼠标光晕
#[derive(Component)]
struct MouseGlow;

// ─── 生成 ──────────────────────────────────────────────────

fn spawn_mouse_cursor(mut commands: Commands) {
    // --- 3A 科技感自定义指针 (哥特红风格) ---
    commands
        .spawn((
            MouseGlow,
            Node {
                position_type: PositionType::Absolute,
                width: Val::Px(24.0),
                height: Val::Px(24.0),
                ..default()
            },
            GlobalZIndex(1000),
        ))
        .with_children(|parent: &mut ChildBuilder| {
            // 中心点
            parent.spawn((
                Node {
                    width: Val::Px(4.0),
                    height: Val::Px(4.0),
                    position_type: PositionType::Absolute,
                    left: Val::Px(10.0),
                    top: Val::Px(10.0),
                    ..default()
                },
                BackgroundColor(theme::GOTHIC_RED),
            ));

            // 外部十字辅助线
            for i in 0..4 {
                let angle = i as f32 * std::f32::consts::FRAC_PI_2;
                parent.spawn((
                    Node {
                        width: Val::Px(1.0),
                        height: Val::Px(8.0),
                        position_type: PositionType::Absolute,
                        left: Val::Px(11.5 + angle.cos() * 10.0),
                        top: Val::Px(11.5 + angle.sin() * 10.0),
                        ..default()
                    },
                    BackgroundColor(theme::GOTHIC_PAPER.with_alpha(0.6)),
                    Transform::from_rotation(Quat::from_rotation_z(angle)),
                ));
            }

            // 外圈动态旋转环
            parent.spawn((
                Node {
                    width: Val::Px(30.0),
                    height: Val::Px(30.0),
                    position_type: PositionType::Absolute,
                    left: Val::Px(-3.0),
                    top: Val::Px(-3.0),
                    border: UiRect::all(Val::Px(1.0)),
                    ..default()
                },
                BorderColor(theme::GOTHIC_RED.with_alpha(0.3)),
                theme::CursorRingAnimation { speed: 2.0 },
            ));
        });
}

// ─── 更新系统 ──────────────────────────────────────────────

fn update_mouse_glow(
    window_query: Query<&Window>,
    mut glow_query: Query<&mut Node, With<MouseGlow>>,
) {
    let Ok(window) = window_query.get_single() else {
        return;
    };

    if let Some(cursor_pos) = window.cursor_position() {
        for mut node in &mut glow_query {
            // 平滑跟随
            let current_left = match node.left {
                Val::Px(p) => p,
                _ => cursor_pos.x,
            };
            let current_top = match node.top {
                Val::Px(p) => p,
                _ => cursor_pos.y,
            };

            node.left = Val::Px(current_left + (cursor_pos.x - current_left) * 0.4);
            node.top = Val::Px(current_top + (cursor_pos.y - current_top) * 0.4);
        }
    }
}

fn update_cursor_animation(
    time: Res<Time>,
    mut query: Query<(&mut Transform, &theme::CursorRingAnimation)>,
) {
    for (mut transform, anim) in &mut query {
        transform.rotate_z(anim.speed * time.delta_secs());
    }
}

// ─── 清理 ──────────────────────────────────────────────────

fn cleanup_particles(mut commands: Commands, glow_query: Query<Entity, With<MouseGlow>>) {
    for entity in &glow_query {
        commands.entity(entity).despawn();
    }
}
