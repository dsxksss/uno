//! 页面转场动画系统
//!
//! 实现：
//! - 淡入淡出遮罩
//! - 滑动转场
//! - 状态切换触发

use bevy::prelude::*;
use crate::theme;
use crate::MenuPage;

pub struct TransitionPlugin;

impl Plugin for TransitionPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<TransitionState>()
            .add_systems(Update, (
                process_transition,
                update_transition_overlay,
            ));
    }
}

// ─── 资源 & 组件 ────────────────────────────────────────────

/// 转场状态
#[derive(Resource)]
pub struct TransitionState {
    pub active: bool,
    pub phase: TransitionPhase,
    pub timer: f32,
    pub duration: f32,
    pub target_page: Option<MenuPage>,
}

impl Default for TransitionState {
    fn default() -> Self {
        Self {
            active: false,
            phase: TransitionPhase::None,
            timer: 0.0,
            duration: theme::FADE_DURATION,
            target_page: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TransitionPhase {
    None,
    FadeOut,
    Switch,
    FadeIn,
}

/// 转场遮罩
#[derive(Component)]
pub struct TransitionOverlay;

// ─── 触发转场的公共接口 ─────────────────────────────────────

/// 触发页面转场：发起淡出 → 切换 → 淡入 流程
pub fn trigger_transition(
    transition: &mut TransitionState,
    target: MenuPage,
) {
    if transition.active {
        return;
    }
    transition.active = true;
    transition.phase = TransitionPhase::FadeOut;
    transition.timer = 0.0;
    transition.target_page = Some(target);
}

// ─── 系统 ──────────────────────────────────────────────────

fn process_transition(
    time: Res<Time>,
    mut transition: ResMut<TransitionState>,
    mut next_page: ResMut<NextState<MenuPage>>,
) {
    if !transition.active {
        return;
    }

    transition.timer += time.delta_secs();

    match transition.phase {
        TransitionPhase::FadeOut => {
            if transition.timer >= transition.duration {
                transition.phase = TransitionPhase::Switch;
                transition.timer = 0.0;
            }
        }
        TransitionPhase::Switch => {
            if let Some(target) = transition.target_page {
                next_page.set(target);
            }
            transition.phase = TransitionPhase::FadeIn;
            transition.timer = 0.0;
        }
        TransitionPhase::FadeIn => {
            if transition.timer >= transition.duration {
                transition.phase = TransitionPhase::None;
                transition.active = false;
                transition.target_page = None;
            }
        }
        TransitionPhase::None => {}
    }
}

fn update_transition_overlay(
    mut commands: Commands,
    transition: Res<TransitionState>,
    existing: Query<Entity, With<TransitionOverlay>>,
) {
    if !transition.active && transition.phase == TransitionPhase::None {
        // 移除遮罩
        for entity in &existing {
            commands.entity(entity).despawn();
        }
        return;
    }

    let alpha = match transition.phase {
        TransitionPhase::FadeOut => {
            (transition.timer / transition.duration).clamp(0.0, 1.0)
        }
        TransitionPhase::Switch => 1.0,
        TransitionPhase::FadeIn => {
            1.0 - (transition.timer / transition.duration).clamp(0.0, 1.0)
        }
        TransitionPhase::None => 0.0,
    };

    if existing.is_empty() && alpha > 0.0 {
        // 创建全屏遮罩（极高Z序保持在最前面）
        commands.spawn((
            TransitionOverlay,
            Node {
                width: Val::Vw(100.0),
                height: Val::Vh(100.0),
                position_type: PositionType::Absolute,
                left: Val::Px(0.0),
                top: Val::Px(0.0),
                ..default()
            },
            BackgroundColor(Color::srgba(0.02, 0.02, 0.05, alpha)),
            GlobalZIndex(999),
        ));
    } else {
        for entity in &existing {
            commands.entity(entity).insert(
                BackgroundColor(Color::srgba(0.02, 0.02, 0.05, alpha)),
            );
        }
    }
}
