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

#[derive(Resource)]
struct IconAssets {
    layout: Handle<TextureAtlasLayout>,
    texture: Handle<Image>,
}

impl FromWorld for IconAssets {
    fn from_world(world: &mut World) -> Self {
        let asset_server = world.resource::<AssetServer>();
        let texture = asset_server.load("images/部门.png");
        let layout = TextureAtlasLayout::from_grid(UVec2::splat(200), 5, 5, None, None);
        let mut texture_atlas_layouts = world.resource_mut::<Assets<TextureAtlasLayout>>();
        let layout_handle = texture_atlas_layouts.add(layout);

        Self {
            layout: layout_handle,
            texture,
        }
    }
}

impl Plugin for MenuPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<IconAssets>()
            .add_systems(OnEnter(MenuPage::Title), spawn_title_menu)
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

fn spawn_title_menu(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    icons: Res<IconAssets>,
) {
    let font = asset_server.load("fonts/simhei.ttf");

    // --- 动态背景排线 (Procedural Hatching) ---
    commands
        .spawn(Node {
            width: Val::Vw(100.0),
            height: Val::Vh(100.0),
            position_type: PositionType::Absolute,
            overflow: Overflow::clip(),
            ..default()
        })
        .with_children(|bg| {
            for i in 0..20 {
                bg.spawn((
                    Node {
                        width: Val::Vw(150.0),
                        height: Val::Px(1.0),
                        position_type: PositionType::Absolute,
                        top: Val::Vh(i as f32 * 5.0),
                        left: Val::Vw(-25.0),
                        ..default()
                    },
                    BackgroundColor(theme::GOTHIC_INK.with_alpha(0.05)),
                    Transform::from_rotation(Quat::from_rotation_z(0.3)),
                ));
            }
        });

    // --- 顶部黑色墨迹条 (Inky Header) ---
    commands.spawn((
        Node {
            width: Val::Vw(100.0),
            height: Val::Px(80.0),
            position_type: PositionType::Absolute,
            top: Val::Px(0.0),
            ..default()
        },
        BackgroundColor(theme::GOTHIC_INK),
        ZIndex(0),
    ));

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
                TextColor(theme::GOTHIC_PAPER),
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

            // --- 按钮列表 (图标索引: 4=KPI, 2=Admin/Settings, 0=Dev/Quit) ---
            spawn_button(
                parent,
                "开始考核",
                MenuButtonAction::Play,
                font.clone(),
                Some(4),
                &icons,
            );
            spawn_button(
                parent,
                "人事管理",
                MenuButtonAction::Settings,
                font.clone(),
                Some(2),
                &icons,
            );
            spawn_button(
                parent,
                "离职申请",
                MenuButtonAction::Quit,
                font.clone(),
                Some(0),
                &icons,
            );

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
                            BorderColor(theme::GOTHIC_RED),
                            BackgroundColor(theme::GOTHIC_INK),
                        ))
                        .with_children(|profile: &mut ChildBuilder| {
                            profile.spawn((
                                Text::new("员工编号: #73921"),
                                TextFont {
                                    font: font.clone(),
                                    font_size: 14.0,
                                    ..default()
                                },
                                TextColor(theme::GOTHIC_PAPER.with_alpha(0.6)),
                            ));
                            profile.spawn((
                                Text::new("职场等级: 骨干 P5"),
                                TextFont {
                                    font: font.clone(),
                                    font_size: 18.0,
                                    ..default()
                                },
                                TextColor(theme::GOTHIC_PAPER),
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
                            BorderColor(theme::GOTHIC_RED.with_alpha(0.3)),
                            BackgroundColor(theme::GOTHIC_INK),
                        ))
                        .with_children(|news: &mut ChildBuilder| {
                            news.spawn((
                                Text::new("公司动态"),
                                TextFont {
                                    font: font.clone(),
                                    font_size: 16.0,
                                    ..default()
                                },
                                TextColor(theme::GOTHIC_RED),
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

    parent.spawn((node, BorderColor(theme::GOTHIC_RED.with_alpha(0.4))));
}

fn spawn_mode_select_menu(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    icons: Res<IconAssets>,
) {
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
                    let cards = vec![("研发部", 0), ("业务部", 1), ("行政部", 2), ("管理部", 3)];

                    for (name, index) in cards {
                        spawn_card(card_row, name, index, &icons, font.clone());
                    }
                });

            // 返回按钮
            parent
                .spawn(Node {
                    margin: UiRect::top(Val::Px(50.0)),
                    ..default()
                })
                .with_children(|p| {
                    spawn_button(
                        p,
                        "返回主界面",
                        MenuButtonAction::Back,
                        font.clone(),
                        None,
                        &icons,
                    );
                });
        });
}

fn spawn_card(
    parent: &mut ChildBuilder,
    name: &str,
    icon_idx: usize,
    icons: &Res<IconAssets>,
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
                border: UiRect::all(Val::Px(2.0)),
                ..default()
            },
            BorderColor(theme::GOTHIC_INK),
            BackgroundColor(theme::GOTHIC_GREY),
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
            // 核心插画 (容器设为菱形)
            // -- 在插画背后添加一些“阴影/排线”细节 --
            card.spawn(Node {
                width: Val::Px(165.0),
                height: Val::Px(165.0),
                position_type: PositionType::Absolute,
                top: Val::Px(45.0),
                ..default()
            })
            .with_children(|hatch| {
                for i in 0..5 {
                    hatch.spawn((
                        Node {
                            width: Val::Px(165.0),
                            height: Val::Px(1.0),
                            position_type: PositionType::Absolute,
                            top: Val::Px(i as f32 * 30.0),
                            ..default()
                        },
                        BackgroundColor(theme::GOTHIC_INK.with_alpha(0.3)),
                        Transform::from_rotation(Quat::from_rotation_z(0.785)),
                    ));
                }
            });

            card.spawn((
                Node {
                    width: Val::Px(160.0),
                    height: Val::Px(160.0),
                    margin: UiRect::top(Val::Px(10.0)),
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    ..default()
                },
                BackgroundColor(theme::GOTHIC_INK),
                Transform::from_rotation(Quat::from_rotation_z(std::f32::consts::FRAC_PI_4)),
            ))
            .with_children(|icon_bg| {
                // 内部显示的图标 (使用 Atlas)
                icon_bg.spawn((
                    ImageNode {
                        image: icons.texture.clone(),
                        texture_atlas: Some(TextureAtlas {
                            layout: icons.layout.clone(),
                            index: icon_idx,
                        }),
                        ..default()
                    },
                    // 图标本身旋回 45 度，保持竖直
                    Transform::from_rotation(Quat::from_rotation_z(-std::f32::consts::FRAC_PI_4)),
                ));
            });

            // 部门名称 (移至图标下方)
            card.spawn((
                Text::new(name),
                TextFont {
                    font: font.clone(),
                    font_size: 26.0,
                    ..default()
                },
                TextColor(theme::GOTHIC_RED),
                ButtonText,
                Node {
                    margin: UiRect::top(Val::Px(30.0)),
                    ..default()
                },
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
    icon_idx: Option<usize>,
    icons: &Res<IconAssets>,
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
            Transform::from_rotation(Quat::IDENTITY),
            BorderColor(theme::GOTHIC_INK),
            BackgroundColor(theme::GOTHIC_GREY),
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
                TextColor(theme::GOTHIC_PAPER.with_alpha(0.4)),
                ButtonText, // Also fade/highlight this meta text?
                Node {
                    position_type: PositionType::Absolute,
                    top: Val::Px(-12.0),
                    left: Val::Px(0.0),
                    ..default()
                },
            ));

            // 按钮内部布局：图标 + 文字
            parent
                .spawn(Node {
                    display: Display::Flex,
                    flex_direction: FlexDirection::Row,
                    align_items: AlignItems::Center,
                    ..default()
                })
                .with_children(|inner| {
                    // 如果有图标，从 Atlas 中加载
                    if let Some(idx) = icon_idx {
                        inner.spawn((
                            Node {
                                width: Val::Px(24.0),
                                height: Val::Px(24.0),
                                margin: UiRect::right(Val::Px(12.0)),
                                ..default()
                            },
                            ImageNode {
                                image: icons.texture.clone(),
                                texture_atlas: Some(TextureAtlas {
                                    layout: icons.layout.clone(),
                                    index: idx,
                                }),
                                ..default()
                            },
                        ));
                    }

                    // 侧边指示条 (Gothic Style)
                    inner.spawn((
                        Node {
                            width: Val::Px(3.0),
                            height: Val::Px(24.0),
                            margin: UiRect::right(Val::Px(15.0)),
                            ..default()
                        },
                        BackgroundColor(theme::GOTHIC_RED.with_alpha(0.2)),
                    ));

                    // 核心文字
                    inner.spawn((
                        Text::new(text),
                        TextFont {
                            font: font.clone(),
                            font_size: theme::BUTTON_FONT_SIZE,
                            ..default()
                        },
                        TextColor(theme::GOTHIC_PAPER),
                        ButtonText,
                    ));
                });

            // 按钮末尾的辅助技术码
            parent.spawn((
                Text::new("0[1:F]"),
                TextFont {
                    font: font.clone(),
                    font_size: 10.0,
                    ..default()
                },
                TextColor(theme::GOTHIC_PAPER.with_alpha(0.4)),
                ButtonText,
                Node {
                    position_type: PositionType::Absolute,
                    right: Val::Px(15.0),
                    bottom: Val::Px(5.0),
                    ..default()
                },
            ));
        });
}

#[derive(Component)]
struct ButtonText;

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
    mut text_query: Query<&mut TextColor, With<ButtonText>>,
    child_query: Query<&Children>,
    mut transition: ResMut<TransitionState>,
    mut app_exit_events: EventWriter<AppExit>,
) {
    for (interaction, mut bg, mut border, mut shadow, mut scalar, action, children) in
        &mut interaction_query
    {
        match *interaction {
            Interaction::Pressed => {
                bg.0 = theme::GOTHIC_PAPER;
                shadow.color = theme::GOTHIC_PAPER.with_alpha(0.4);
                // ... logic for actions ...
                match action {
                    MenuButtonAction::Play => {
                        trigger_transition(&mut transition, MenuPage::ModeSelect)
                    }
                    MenuButtonAction::Back => trigger_transition(&mut transition, MenuPage::Title),
                    MenuButtonAction::Quit => {
                        app_exit_events.send(AppExit::Success);
                    }
                    _ => {}
                }
            }
            Interaction::Hovered => {
                bg.0 = theme::GOTHIC_RED.with_alpha(0.85);
                border.0 = theme::GOTHIC_INK;
                shadow.color = theme::GOTHIC_RED.with_alpha(0.4);
                shadow.blur_radius = Val::Px(35.0);
                scalar.target = 1.05;

                highlight_button_text(
                    &mut text_query,
                    children,
                    theme::GOTHIC_PAPER,
                    true,
                    &child_query,
                );
            }
            Interaction::None => {
                bg.0 = theme::GOTHIC_GREY;
                border.0 = theme::GOTHIC_INK;
                shadow.color = theme::SHADOW;
                shadow.blur_radius = Val::Px(15.0);
                scalar.target = 1.0;

                highlight_button_text(
                    &mut text_query,
                    children,
                    theme::GOTHIC_PAPER,
                    false,
                    &child_query,
                );
            }
        }
    }
}

/// 递归高亮按钮文字
fn highlight_button_text(
    query: &mut Query<&mut TextColor, With<ButtonText>>,
    children: &Children,
    color: Color,
    hover: bool,
    child_query: &Query<&Children>,
) {
    for &child in children.iter() {
        if let Ok(mut txt) = query.get_mut(child) {
            txt.0 = if hover {
                theme::GOTHIC_RED
            } else {
                theme::GOTHIC_PAPER
            };
        }
        // 递归
        if let Ok(inner_children) = child_query.get(child) {
            highlight_button_text(query, inner_children, color, hover, child_query);
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
