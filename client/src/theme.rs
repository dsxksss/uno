//! 全局视觉主题 —— 赛博朋克职场风格
//!
//! 色彩灵感：深邃的办公室夜色 + 霓虹灯光

use bevy::prelude::*;

// ─── 主色板 ───────────────────────────────────────────────
/// 主题色：职场橙
pub const PRIMARY: Color = Color::srgb(1.0, 0.4, 0.1);
/// 次要色：商业蓝
pub const SECONDARY: Color = Color::srgb(0.1, 0.45, 0.85);
/// 强调色：科技青
pub const ACCENT: Color = Color::srgb(0.0, 0.85, 0.75);
/// 警告色：深红
pub const DANGER: Color = Color::srgb(0.9, 0.12, 0.18);

// ─── 背景与表面 ────────────────────────────────────────────
/// 极深蓝背景 (对标卡背设计)
pub const BG_DARK: Color = Color::srgb(0.02, 0.02, 0.04);
/// 卡片背景 (带一些透明度的深蓝色表面)
pub const SURFACE: Color = Color::srgba(0.08, 0.1, 0.18, 0.7);
/// 卡牌正面纯白 (用于卡牌展示)
pub const CARD_WHITE: Color = Color::srgb(0.98, 0.98, 1.0);
/// 扫描线颜色 (更加隐蔽)
pub const SCANLINE: Color = Color::srgba(1.0, 1.0, 1.0, 0.01);
/// 面板边框
pub const BORDER: Color = Color::srgba(0.4, 0.6, 1.0, 0.2);
/// 投影颜色
pub const SHADOW: Color = Color::srgba(0.0, 0.0, 0.0, 0.5);

// ─── 装饰 ──────────────────────────────────────────────────
pub const GRID_SIZE: f32 = 80.0;
pub const SKEW_ANGLE: f32 = -0.1; // 减小角度，追求干练

/// 科技感的辅助元数据颜色
pub const TEXT_META: Color = Color::srgba(0.5, 0.7, 1.0, 0.3);

// ─── 文字 ──────────────────────────────────────────────────
/// 主标题颜色
pub const TEXT_TITLE: Color = Color::srgb(1.0, 1.0, 1.0);
/// 正文颜色
pub const TEXT_BODY: Color = Color::srgba(0.85, 0.88, 0.95, 0.9);
/// 高亮文字
pub const TEXT_HIGHLIGHT: Color = Color::srgb(1.0, 0.8, 0.2);

// ─── 粒子 ──────────────────────────────────────────────────
/// 粒子颜色组
pub const PARTICLE_COLORS: [Color; 5] = [
    Color::srgba(1.0, 0.45, 0.1, 0.6),  // 橙
    Color::srgba(0.2, 0.6, 1.0, 0.5),   // 蓝
    Color::srgba(0.0, 0.95, 0.85, 0.4), // 青
    Color::srgba(0.95, 0.15, 0.2, 0.3), // 红
    Color::srgba(1.0, 0.85, 0.4, 0.35), // 金
];

// ─── 尺寸常量 ──────────────────────────────────────────────
pub const TITLE_FONT_SIZE: f32 = 72.0;
pub const SUBTITLE_FONT_SIZE: f32 = 28.0;
pub const BUTTON_FONT_SIZE: f32 = 26.0;
pub const BUTTON_WIDTH: f32 = 340.0;
pub const BUTTON_HEIGHT: f32 = 60.0;

// ─── 动画时长 ──────────────────────────────────────────────
pub const HOVER_ANIM_SPEED: f32 = 8.0;
pub const FADE_DURATION: f32 = 0.5;
#[allow(dead_code)]
pub const STAGGER_DELAY: f32 = 0.08;

// ─── 动画组件 ──────────────────────────────────────────────
#[derive(Component)]
pub struct CursorRingAnimation {
    pub speed: f32,
}
