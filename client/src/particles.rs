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
            (spawn_particle_field, spawn_background_deco),
        )
        .add_systems(
            Update,
            (
                update_floating_particles,
                update_rising_bubbles,
                update_sparkle_particles,
                update_mouse_glow,
                update_scanlines,
                update_cursor_animation,
            )
                .run_if(in_state(GameState::MainMenu)),
        )
        .add_systems(OnExit(GameState::MainMenu), cleanup_particles);
    }
}

// ─── 组件 ──────────────────────────────────────────────────

#[derive(Component)]
struct ParticleField;

/// 漂浮光点
#[derive(Component)]
struct FloatingParticle {
    base_pos: Vec2,
    phase: f32,
    speed: f32,
    amplitude: Vec2,
}

/// 上升气泡
#[derive(Component)]
struct RisingBubble {
    speed: f32,
    wobble_phase: f32,
    wobble_amp: f32,
}

/// 闪烁星点
#[derive(Component)]
struct SparkleParticle {
    lifetime: f32,
    max_lifetime: f32,
    fade_in: f32,
}

/// 鼠标光晕
#[derive(Component)]
struct MouseGlow;

// ─── 生成 ──────────────────────────────────────────────────

fn spawn_particle_field(mut commands: Commands) {
    let field = commands
        .spawn((ParticleField, Transform::default(), Visibility::default()))
        .id();

    // --- 漂浮光点（80颗）---
    for i in 0..80 {
        let phase = i as f32 * 0.7853;
        let x = (i as f32 * 137.508).sin() * 900.0;
        let y = (i as f32 * 73.137).cos() * 500.0;
        let color_idx = i % theme::PARTICLE_COLORS.len();
        let size = 2.0 + (i as f32 * 0.31).sin().abs() * 4.0;

        let child = commands
            .spawn((
                FloatingParticle {
                    base_pos: Vec2::new(x, y),
                    phase,
                    speed: 0.3 + (i as f32 * 0.17).sin().abs() * 0.5,
                    amplitude: Vec2::new(
                        30.0 + (i as f32 * 0.43).cos().abs() * 60.0,
                        20.0 + (i as f32 * 0.29).sin().abs() * 40.0,
                    ),
                },
                Sprite {
                    color: theme::PARTICLE_COLORS[color_idx],
                    custom_size: Some(Vec2::splat(size)),
                    ..default()
                },
                Transform::from_translation(Vec3::new(x, y, 1.0)),
            ))
            .id();
        commands.entity(field).add_child(child);
    }

    // --- 上升气泡（25颗） ---
    for i in 0..25 {
        let x = -900.0 + (i as f32 / 25.0) * 1800.0 + (i as f32 * 47.3).sin() * 80.0;
        let y = -600.0 + (i as f32 * 93.7).sin() * 200.0;
        let color_idx = (i + 2) % theme::PARTICLE_COLORS.len();
        let size = 4.0 + (i as f32 * 0.53).sin().abs() * 8.0;

        let child = commands
            .spawn((
                RisingBubble {
                    speed: 15.0 + (i as f32 * 0.7).sin().abs() * 30.0,
                    wobble_phase: i as f32 * 1.23,
                    wobble_amp: 20.0 + (i as f32 * 0.41).cos().abs() * 40.0,
                },
                Sprite {
                    color: theme::PARTICLE_COLORS[color_idx],
                    custom_size: Some(Vec2::splat(size)),
                    ..default()
                },
                Transform::from_translation(Vec3::new(x, y, 0.5)),
            ))
            .id();
        commands.entity(field).add_child(child);
    }

    // --- 闪烁星点（40颗）---
    for i in 0..40 {
        let x = (i as f32 * 173.31).sin() * 950.0;
        let y = (i as f32 * 97.77).cos() * 540.0;
        let max_life = 1.5 + (i as f32 * 0.37).sin().abs() * 3.0;
        let current = (i as f32 * 0.61).sin().abs() * max_life;

        let child = commands
            .spawn((
                SparkleParticle {
                    lifetime: current,
                    max_lifetime: max_life,
                    fade_in: 0.3,
                },
                Sprite {
                    color: Color::srgba(1.0, 1.0, 1.0, 0.0),
                    custom_size: Some(Vec2::splat(2.5)),
                    ..default()
                },
                Transform::from_translation(Vec3::new(x, y, 2.0)),
            ))
            .id();
        commands.entity(field).add_child(child);
    }

    // --- 3A 科技感自定义指针 ---
    commands
        .spawn((
            MouseGlow,
            Node {
                position_type: PositionType::Absolute,
                width: Val::Px(24.0),
                height: Val::Px(24.0),
                ..default()
            },
            GlobalZIndex(1000), // 永远在最上层
        ))
        .with_children(|parent: &mut ChildBuilder| {
            // 中心发光点
            parent.spawn((
                Node {
                    width: Val::Px(4.0),
                    height: Val::Px(4.0),
                    position_type: PositionType::Absolute,
                    left: Val::Px(10.0),
                    top: Val::Px(10.0),
                    ..default()
                },
                BackgroundColor(theme::ACCENT),
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
                    BackgroundColor(theme::SECONDARY.with_alpha(0.6)),
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
                BorderColor(theme::ACCENT.with_alpha(0.3)),
                theme::CursorRingAnimation { speed: 2.0 },
            ));
        });
}

#[derive(Component)]
struct Scanline;

fn spawn_background_deco(mut commands: Commands) {
    let deco_root = commands
        .spawn((ParticleField, Transform::default(), Visibility::default()))
        .id();

    // 1. 绘制背景网格 (Grid)
    for x in (-16..17).map(|i| i as f32 * theme::GRID_SIZE) {
        let child = commands
            .spawn((
                Sprite {
                    color: theme::BORDER.with_alpha(0.05),
                    custom_size: Some(Vec2::new(1.0, 1080.0)),
                    ..default()
                },
                Transform::from_translation(Vec3::new(x, 0.0, 0.01)),
            ))
            .id();
        commands.entity(deco_root).add_child(child);
    }
    for y in (-10..11).map(|i| i as f32 * theme::GRID_SIZE) {
        let child = commands
            .spawn((
                Sprite {
                    color: theme::BORDER.with_alpha(0.05),
                    custom_size: Some(Vec2::new(1920.0, 1.0)),
                    ..default()
                },
                Transform::from_translation(Vec3::new(0.0, y, 0.01)),
            ))
            .id();
        commands.entity(deco_root).add_child(child);
    }

    // 2. 绘制动态扫描线 (Scanlines)
    for i in 0..6 {
        let y = -540.0 + i as f32 * 200.0;
        let child = commands
            .spawn((
                Scanline,
                Sprite {
                    color: theme::SCANLINE,
                    custom_size: Some(Vec2::new(1920.0, 2.0)),
                    ..default()
                },
                Transform::from_translation(Vec3::new(0.0, y, 0.02)),
            ))
            .id();
        commands.entity(deco_root).add_child(child);
    }
}

fn update_scanlines(time: Res<Time>, mut query: Query<&mut Transform, With<Scanline>>) {
    let dt = time.delta_secs();
    for mut transform in &mut query {
        transform.translation.y += 40.0 * dt;
        if transform.translation.y > 540.0 {
            transform.translation.y = -540.0;
        }
    }
}

// ─── 更新系统 ──────────────────────────────────────────────

fn update_floating_particles(
    time: Res<Time>,
    mut query: Query<(&FloatingParticle, &mut Transform, &mut Sprite)>,
) {
    let t = time.elapsed_secs();
    for (particle, mut transform, mut sprite) in &mut query {
        let offset_x = (t * particle.speed + particle.phase).sin() * particle.amplitude.x;
        let offset_y =
            (t * particle.speed * 0.7 + particle.phase * 1.3).cos() * particle.amplitude.y;
        transform.translation.x = particle.base_pos.x + offset_x;
        transform.translation.y = particle.base_pos.y + offset_y;

        // 呼吸闪烁
        let alpha_base = sprite.color.alpha();
        let breath = 0.3 + (t * particle.speed * 2.0 + particle.phase).sin().abs() * 0.7;
        let target_alpha = alpha_base * 0.0 + breath * 0.6; // 不累积，直接设
        sprite.color.set_alpha(target_alpha.clamp(0.05, 0.8));
    }
}

fn update_rising_bubbles(
    time: Res<Time>,
    mut query: Query<(&mut RisingBubble, &mut Transform, &mut Sprite)>,
) {
    let dt = time.delta_secs();
    let t = time.elapsed_secs();

    for (mut bubble, mut transform, mut sprite) in &mut query {
        // 上升
        transform.translation.y += bubble.speed * dt;
        // 横向摆动
        let wobble = (t * 1.5 + bubble.wobble_phase).sin() * bubble.wobble_amp * dt;
        transform.translation.x += wobble;

        // 到顶部后重置到底部
        if transform.translation.y > 580.0 {
            transform.translation.y = -580.0;
            bubble.wobble_phase += 2.71;
        }

        // 根据高度调整透明度（中间最明显）
        let norm_y = (transform.translation.y + 580.0) / 1160.0;
        let alpha = (norm_y * std::f32::consts::PI).sin() * 0.5;
        sprite.color.set_alpha(alpha.clamp(0.02, 0.5));
    }
}

fn update_sparkle_particles(
    time: Res<Time>,
    mut query: Query<(&mut SparkleParticle, &mut Sprite, &mut Transform)>,
) {
    let dt = time.delta_secs();
    for (mut sparkle, mut sprite, mut transform) in &mut query {
        sparkle.lifetime += dt;

        if sparkle.lifetime >= sparkle.max_lifetime {
            // 重置
            sparkle.lifetime = 0.0;
            sparkle.max_lifetime = 1.5 + (time.elapsed_secs() * 0.37).sin().abs() * 3.0;
            transform.translation.x = (time.elapsed_secs() * 173.31).sin() * 950.0;
            transform.translation.y = (time.elapsed_secs() * 97.77).cos() * 540.0;
        }

        // 淡入淡出
        let progress = sparkle.lifetime / sparkle.max_lifetime;
        let alpha = if progress < sparkle.fade_in {
            progress / sparkle.fade_in
        } else if progress > 0.7 {
            (1.0 - progress) / 0.3
        } else {
            1.0
        };
        sprite.color.set_alpha((alpha * 0.7).clamp(0.0, 0.7));

        // 微微膨胀
        let scale = 1.0 + (progress * std::f32::consts::PI).sin() * 0.5;
        transform.scale = Vec3::splat(scale);
    }
}

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

fn cleanup_particles(
    mut commands: Commands,
    query: Query<Entity, With<ParticleField>>,
    glow_query: Query<Entity, With<MouseGlow>>,
) {
    for entity in &query {
        commands.entity(entity).despawn();
    }
    for entity in &glow_query {
        commands.entity(entity).despawn();
    }
}
