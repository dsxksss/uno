//! 全局视觉主题 —— 职场暗黑哥特风格 (Corporate Gothic)
//!
//! 灵感：高压力的办公室、破碎的理想、暗黑地牢式的硬核美术

use bevy::prelude::*;

// ─── 核心色板 (Core Palette) ──────────────────────────────────
/// 重墨色 (Gothic Ink) - 背景、阴影、主要的描边
pub const GOTHIC_INK: Color = Color::srgb(0.02, 0.02, 0.02);
/// 纸张色 (Gothic Paper) - 文字、亮部、激活状态
pub const GOTHIC_PAPER: Color = Color::srgb(0.85, 0.85, 0.85);
/// 鲜血色 (Gothic Blood) - Hover 状态、KPI、警告、压力
pub const GOTHIC_RED: Color = Color::srgb(0.55, 0.0, 0.0);
/// 铅灰色 (Gothic Grey/Ash) - 静止状态背景、次要文字
pub const GOTHIC_GREY: Color = Color::srgb(0.18, 0.18, 0.18);

// ─── BACKGROUND & SURFACE ────────────────────────────────────────────
pub const SHADOW: Color = Color::srgba(0.0, 0.0, 0.0, 0.8);

// ─── 文字与尺寸 ──────────────────────────────────────────────
pub const TEXT_TITLE: Color = GOTHIC_PAPER;
pub const TEXT_BODY: Color = Color::srgba(0.7, 0.7, 0.7, 0.9);
pub const TEXT_HIGHLIGHT: Color = GOTHIC_RED;

pub const TITLE_FONT_SIZE: f32 = 80.0;
pub const SUBTITLE_FONT_SIZE: f32 = 24.0;
pub const BUTTON_FONT_SIZE: f32 = 26.0;
pub const BUTTON_WIDTH: f32 = 360.0;
pub const BUTTON_HEIGHT: f32 = 64.0;

// ─── 动画时长 ──────────────────────────────────────────────
pub const HOVER_ANIM_SPEED: f32 = 10.0;
pub const FADE_DURATION: f32 = 0.6;

#[derive(Component)]
pub struct CursorRingAnimation {
    pub speed: f32,
}
