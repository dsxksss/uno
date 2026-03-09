//! 主菜单 UI 实现
//!
//! 特性：
//! - 响应式布局
//! - 按钮 Hover 缩放 & 发光效果
//! - 文字逐字出现效果 (对标3A剧情展示)
//! - 页面平滑切换

use crate::theme;
use crate::transitions::{trigger_transition, TransitionState};
use crate::GameState;
use crate::MenuPage;
use bevy::prelude::*;

pub struct MenuPlugin;

impl Plugin for MenuPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(MenuPage::Title), spawn_title_menu)
            .add_systems(OnEnter(MenuPage::ModeSelect), spawn_mode_select_menu)
            .add_systems(
                Update,
                (button_system, button_scale_system, animate_title_text)
                    .run_if(in_state(GameState::MainMenu)),
            )
            .add_systems(OnExit(MenuPage::Title), cleanup_menu)
            .add_systems(OnExit(MenuPage::ModeSelect), cleanup_menu);
    }
}

// ─── 组件 ──────────────────────────────────────────────────

#[derive(Component)]
struct MenuRoot;

#[derive(Component)]
enum MenuButtonAction {
    Play,
    Settings,
    Mode(#[allow(dead_code)] String),
    Back,
    Quit,
}

#[derive(Component)]
struct HoverScalar {
    current: f32,
    target: f32,
}

#[derive(Component)]
struct TypewriterText {
    full_text: String,
    timer: Timer,
    index: usize,
}

// ─── UI 生成 ────────────────────────────────────────────────

fn spawn_title_menu(mut commands: Commands, asset_server: Res<AssetServer>) {
    let font = asset_server.load("fonts/simhei.ttf");

    commands
        .spawn((
            MenuRoot,
            Node {
                width: Val::Vw(100.0),
                height: Val::Vh(100.0),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::FlexStart,
                justify_content: JustifyContent::Center,
                padding: UiRect::left(Val::Px(100.0)),
                ..default()
            },
        ))
        .with_children(|parent: &mut ChildBuilder| {
            // --- 游戏标题 ---
            parent.spawn((
                Text::new(""),
                TextFont {
                    font: font.clone(),
                    font_size: theme::TITLE_FONT_SIZE,
                    ..default()
                },
                TextColor(theme::CARD_WHITE),
                TypewriterText {
                    full_text: "KPI 突 围".to_string(),
                    timer: Timer::from_seconds(0.1, TimerMode::Repeating),
                    index: 0,
                },
                Node {
                    margin: UiRect::bottom(Val::Px(10.0)),
                    ..default()
                },
            ));

            parent.spawn((
                Text::new("SURVIVAL OF THE FITTEST"),
                TextFont {
                    font: font.clone(),
                    font_size: theme::SUBTITLE_FONT_SIZE,
                    ..default()
                },
                TextColor(theme::TEXT_HIGHLIGHT),
                Node {
                    margin: UiRect::bottom(Val::Px(60.0)),
                    ..default()
                },
            ));

            // --- 按钮列表 ---
            spawn_button(parent, "开始考核", MenuButtonAction::Play, font.clone());
            spawn_button(parent, "人事管理", MenuButtonAction::Settings, font.clone());
            spawn_button(parent, "离职申请", MenuButtonAction::Quit, font.clone());

            // --- 右侧 HUD 面板 ---
            parent
                .spawn(Node {
                    position_type: PositionType::Absolute,
                    right: Val::Px(50.0),
                    top: Val::Px(50.0),
                    flex_direction: FlexDirection::Column,
                    align_items: AlignItems::FlexEnd,
                    ..default()
                })
                .with_children(|right: &mut ChildBuilder| {
                    // 用户头像/个人信息
                    right
                        .spawn((
                            Node {
                                width: Val::Px(240.0),
                                height: Val::Px(80.0),
                                border: UiRect::left(Val::Px(4.0)),
                                padding: UiRect::left(Val::Px(15.0)),
                                margin: UiRect::bottom(Val::Px(20.0)),
                                justify_content: JustifyContent::Center,
                                flex_direction: FlexDirection::Column,
                                ..default()
                            },
                            BorderColor(theme::PRIMARY),
                            BackgroundColor(theme::SURFACE),
                        ))
                        .with_children(|profile: &mut ChildBuilder| {
                            profile.spawn((
                                Text::new("员工编号: #73921"),
                                TextFont {
                                    font: font.clone(),
                                    font_size: 14.0,
                                    ..default()
                                },
                                TextColor(theme::TEXT_BODY),
                            ));
                            profile.spawn((
                                Text::new("职场等级: 骨干 P5"),
                                TextFont {
                                    font: font.clone(),
                                    font_size: 18.0,
                                    ..default()
                                },
                                TextColor(theme::TEXT_TITLE),
                            ));
                        });

                    // 系统快讯
                    right
                        .spawn((
                            Node {
                                width: Val::Px(300.0),
                                padding: UiRect::all(Val::Px(15.0)),
                                border: UiRect::all(Val::Px(1.0)),
                                flex_direction: FlexDirection::Column,
                                ..default()
                            },
                            BorderColor(theme::BORDER),
                            BackgroundColor(theme::SURFACE),
                        ))
                        .with_children(|news: &mut ChildBuilder| {
                            news.spawn((
                                Text::new("公司动态"),
                                TextFont {
                                    font: font.clone(),
                                    font_size: 16.0,
                                    ..default()
                                },
                                TextColor(theme::PRIMARY),
                                Node {
                                    margin: UiRect::bottom(Val::Px(10.0)),
                                    ..default()
                                },
                            ));
                            news.spawn((
                                Text::new("• Q1 季度 KPI 设计文档已发布"),
                                TextFont {
                                    font: font.clone(),
                                    font_size: 12.0,
                                    ..default()
                                },
                                TextColor(theme::TEXT_BODY),
                            ));
                            news.spawn((
                                Text::new("• 职场防猝死指南增加新条款"),
                                TextFont {
                                    font: font.clone(),
                                    font_size: 12.0,
                                    ..default()
                                },
                                TextColor(theme::TEXT_BODY),
                            ));
                        });
                });

            // --- 视口角落装饰 (Viewport Corners) ---
            spawn_corner_deco(parent, Val::Px(30.0), Val::Px(30.0), Position::TopLeft);
            spawn_corner_deco(parent, Val::Px(30.0), Val::Px(30.0), Position::BottomRight);
        });
}

enum Position {
    TopLeft,
    BottomRight,
}

fn spawn_corner_deco(parent: &mut ChildBuilder, v_val: Val, h_val: Val, pos: Position) {
    let mut node = Node {
        position_type: PositionType::Absolute,
        width: Val::Px(40.0),
        height: Val::Px(40.0),
        ..default()
    };

    match pos {
        Position::TopLeft => {
            node.top = v_val;
            node.left = h_val;
            node.border = UiRect::new(Val::Px(2.0), Val::Px(0.0), Val::Px(2.0), Val::Px(0.0));
        }
        Position::BottomRight => {
            node.bottom = v_val;
            node.right = h_val;
            node.border = UiRect::new(Val::Px(0.0), Val::Px(2.0), Val::Px(0.0), Val::Px(2.0));
        }
    }

    parent.spawn((node, BorderColor(theme::PRIMARY.with_alpha(0.4))));
}

fn spawn_mode_select_menu(mut commands: Commands, asset_server: Res<AssetServer>) {
    let font = asset_server.load("fonts/simhei.ttf");

    commands
        .spawn((
            MenuRoot,
            Node {
                width: Val::Vw(100.0),
                height: Val::Vh(100.0),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                justify_content: JustifyContent::Center,
                ..default()
            },
        ))
        .with_children(|parent: &mut ChildBuilder| {
            parent.spawn((
                Text::new("考核模式选择 - DEPARTMENT SELECT"),
                TextFont {
                    font: font.clone(),
                    font_size: 32.0,
                    ..default()
                },
                TextColor(theme::TEXT_TITLE),
                Node {
                    margin: UiRect::bottom(Val::Px(40.0)),
                    ..default()
                },
            ));

            // 卡牌容器
            parent
                .spawn(Node {
                    display: Display::Flex,
                    flex_direction: FlexDirection::Row,
                    align_items: AlignItems::Center,
                    justify_content: JustifyContent::Center,
                    column_gap: Val::Px(30.0),
                    ..default()
                })
                .with_children(|card_row| {
                    let cards = vec![
                        ("开发部", "dev_refactor.png"),
                        ("业务部", "business_visit.png"),
                        ("行政部", "admin_meeting.png"),
                        ("管理部", "mgmt_strategy.png"),
                    ];

                    for (name, img) in cards {
                        spawn_card(
                            card_row,
                            name,
                            img,
                            asset_server.load(format!("images/cards/{}", img)),
                            font.clone(),
                        );
                    }
                });

            // 返回按钮
            parent
                .spawn(Node {
                    margin: UiRect::top(Val::Px(50.0)),
                    ..default()
                })
                .with_children(|p| {
                    spawn_button(p, "返回主界面", MenuButtonAction::Back, font.clone());
                });
        });
}

fn spawn_card(
    parent: &mut ChildBuilder,
    name: &str,
    _img_path: &str,
    texture: Handle<Image>,
    font: Handle<Font>,
) {
    parent
        .spawn((
            Button,
            Node {
                width: Val::Px(240.0),
                height: Val::Px(340.0),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                padding: UiRect::top(Val::Px(15.0)),
                ..default()
            },
            BackgroundColor(theme::CARD_WHITE),
            BoxShadow {
                color: theme::SHADOW,
                x_offset: Val::Px(0.0),
                y_offset: Val::Px(15.0),
                blur_radius: Val::Px(30.0),
                ..default()
            },
            HoverScalar {
                current: 1.0,
                target: 1.0,
            },
            MenuButtonAction::Mode(name.to_string()),
        ))
        .with_children(|card| {
            // 部门名称 (动态文字)
            card.spawn((
                Text::new(name),
                TextFont {
                    font: font.clone(),
                    font_size: 24.0,
                    ..default()
                },
                TextColor(Color::BLACK),
                Node {
                    margin: UiRect::bottom(Val::Px(10.0)),
                    ..default()
                },
            ));

            // 核心插画 (无文字素材)
            card.spawn((
                Node {
                    width: Val::Px(180.0),
                    height: Val::Px(180.0),
                    ..default()
                },
                ImageNode::new(texture),
            ));

            // 技术细节文字 (修饰语)
            card.spawn((
                Text::new("STATUS: ACTIVE // DEPT_ID:04"),
                TextFont {
                    font,
                    font_size: 10.0,
                    ..default()
                },
                TextColor(Color::srgb(0.5, 0.5, 0.5)),
                Node {
                    margin: UiRect::top(Val::Px(15.0)),
                    ..default()
                },
            ));
        });
}

fn spawn_button(
    parent: &mut ChildBuilder,
    text: &str,
    action: MenuButtonAction,
    font: Handle<Font>,
) {
    // 外层容器，负责整体倾斜和定位
    parent
        .spawn((
            Button,
            Node {
                width: Val::Px(theme::BUTTON_WIDTH),
                height: Val::Px(theme::BUTTON_HEIGHT),
                margin: UiRect::vertical(Val::Px(12.0)),
                justify_content: JustifyContent::FlexStart,
                align_items: AlignItems::Center,
                border: UiRect::left(Val::Px(1.0)),
                padding: UiRect::left(Val::Px(20.0)),
                ..default()
            },
            Transform::from_rotation(Quat::from_rotation_z(theme::SKEW_ANGLE)),
            BorderColor(theme::BORDER.with_alpha(0.1)),
            BackgroundColor(theme::SURFACE.with_alpha(0.6)),
            BoxShadow {
                color: theme::SHADOW,
                x_offset: Val::Px(10.0),
                y_offset: Val::Px(10.0),
                blur_radius: Val::Px(15.0),
                ..default()
            },
            action,
            HoverScalar {
                current: 1.0,
                target: 1.0,
            },
        ))
        .with_children(|parent: &mut ChildBuilder| {
            // 按钮顶部的微文字装饰 (3A 细节)
            parent.spawn((
                Text::new("[ AUTH_L3 // ACCESS_GRANTED ]"),
                TextFont {
                    font: font.clone(),
                    font_size: 9.0,
                    ..default()
                },
                TextColor(theme::TEXT_META),
                Node {
                    position_type: PositionType::Absolute,
                    top: Val::Px(-12.0),
                    left: Val::Px(0.0),
                    ..default()
                },
            ));

            // 侧边指示条 (Hover 时会变色闪烁)
            parent.spawn((
                Node {
                    width: Val::Px(3.0),
                    height: Val::Px(24.0),
                    margin: UiRect::right(Val::Px(15.0)),
                    ..default()
                },
                BackgroundColor(theme::PRIMARY.with_alpha(0.2)),
            ));

            // 核心文字
            parent.spawn((
                Text::new(text),
                TextFont {
                    font: font.clone(),
                    font_size: theme::BUTTON_FONT_SIZE,
                    ..default()
                },
                TextColor(theme::TEXT_BODY),
            ));

            // 按钮末尾的辅助技术码
            parent.spawn((
                Text::new("0[1:F]"),
                TextFont {
                    font: font.clone(),
                    font_size: 10.0,
                    ..default()
                },
                TextColor(theme::TEXT_META),
                Node {
                    position_type: PositionType::Absolute,
                    right: Val::Px(15.0),
                    bottom: Val::Px(5.0),
                    ..default()
                },
            ));
        });
}

// ─── 系统逻辑 ──────────────────────────────────────────────

fn button_system(
    mut interaction_query: Query<
        (
            &Interaction,
            &mut BackgroundColor,
            &mut BorderColor,
            &mut BoxShadow,
            &mut HoverScalar,
            &MenuButtonAction,
            &Children,
        ),
        (Changed<Interaction>, With<Button>),
    >,
    // 合并文本查询以避免并行写入冲突
    mut text_query: Query<&mut TextColor>,
    // 合并背景查询（注意：interaction_query 已经有了 Button 的 BackgroundColor，所以这里的查询要排除 Button）
    mut children_bg_query: Query<&mut BackgroundColor, Without<Button>>,
    mut transition: ResMut<TransitionState>,
    mut app_exit_events: EventWriter<AppExit>,
) {
    for (interaction, mut bg, mut border, mut shadow, mut scalar, action, children) in
        &mut interaction_query
    {
        match *interaction {
            Interaction::Pressed => {
                bg.0 = theme::PRIMARY;
                shadow.color = theme::PRIMARY.with_alpha(0.4);
                match action {
                    MenuButtonAction::Play => {
                        trigger_transition(&mut transition, MenuPage::ModeSelect);
                    }
                    MenuButtonAction::Back => {
                        trigger_transition(&mut transition, MenuPage::Title);
                    }
                    MenuButtonAction::Quit => {
                        app_exit_events.send(AppExit::Success);
                    }
                    _ => {}
                }
            }
            Interaction::Hovered => {
                let is_quit = matches!(action, MenuButtonAction::Quit);
                let highlight_color = if is_quit {
                    theme::DANGER
                } else {
                    theme::PRIMARY
                };

                bg.0 = theme::SURFACE.with_alpha(0.98);
                border.0 = highlight_color.with_alpha(0.5);
                shadow.color = highlight_color.with_alpha(0.4);
                shadow.blur_radius = Val::Px(35.0);
                scalar.target = 1.05;

                // 动态更新子项：按顺序获取以避免借用冲突
                if let Some(&id) = children.get(2) {
                    if let Ok(mut txt) = text_query.get_mut(id) {
                        txt.0 = highlight_color;
                    }
                }
                if let Some(&id) = children.get(0) {
                    if let Ok(mut meta) = text_query.get_mut(id) {
                        meta.0 = highlight_color.with_alpha(0.6);
                    }
                }
                if let Some(&id) = children.get(1) {
                    if let Ok(mut side) = children_bg_query.get_mut(id) {
                        side.0 = highlight_color;
                    }
                }
            }
            Interaction::None => {
                bg.0 = theme::SURFACE.with_alpha(0.6);
                border.0 = theme::BORDER.with_alpha(0.1);
                shadow.color = theme::SHADOW;
                shadow.blur_radius = Val::Px(15.0);
                scalar.target = 1.0;

                if let Some(&id) = children.get(2) {
                    if let Ok(mut txt) = text_query.get_mut(id) {
                        txt.0 = theme::TEXT_BODY;
                    }
                }
                if let Some(&id) = children.get(0) {
                    if let Ok(mut meta) = text_query.get_mut(id) {
                        meta.0 = theme::TEXT_META;
                    }
                }
                if let Some(&id) = children.get(1) {
                    if let Ok(mut side) = children_bg_query.get_mut(id) {
                        side.0 = theme::PRIMARY.with_alpha(0.1);
                    }
                }
            }
        }
    }
}

fn animate_title_text(time: Res<Time>, mut query: Query<(&mut Text, &mut TypewriterText)>) {
    for (mut text, mut typewriter) in &mut query {
        typewriter.timer.tick(time.delta());
        if typewriter.timer.just_finished()
            && typewriter.index < typewriter.full_text.chars().count()
        {
            typewriter.index += 1;
            text.0 = typewriter
                .full_text
                .chars()
                .take(typewriter.index)
                .collect();
        }
    }
}

fn button_scale_system(time: Res<Time>, mut query: Query<(&mut HoverScalar, &mut Transform)>) {
    for (mut scalar, mut transform) in &mut query {
        // 平滑渐变到目标缩放比例
        scalar.current = scalar.current
            + (scalar.target - scalar.current) * theme::HOVER_ANIM_SPEED * time.delta_secs();
        transform.scale = Vec3::splat(scalar.current);
    }
}

// ─── 清理 ──────────────────────────────────────────────────

fn cleanup_menu(mut commands: Commands, query: Query<Entity, With<MenuRoot>>) {
    for entity in &query {
        commands.entity(entity).despawn_recursive();
    }
}
