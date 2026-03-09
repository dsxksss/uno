use crate::theme;
use crate::{GameState, SelectedMode};
use bevy::prelude::*;
use rand::seq::SliceRandom;

pub struct GamePlugin;

impl Plugin for GamePlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(GameState::InGame), setup_game)
            .add_systems(
                Update,
                (
                    handle_card_interactions,
                    update_resources_ui,
                    check_win_conditions,
                    turn_phase_manager,
                    next_phase_button_system,
                    card_animation_system,
                    opponent_ai_system,
                )
                    .run_if(in_state(GameState::InGame)),
            )
            .add_systems(OnExit(GameState::InGame), cleanup_game);
    }
}

// ─── 类型与组件 ──────────────────────────────────────────────

#[derive(Component)]
pub struct GameRoot;

#[derive(Component)]
pub struct PlayerHand;

#[derive(Component)]
pub struct PlayerField;

#[derive(Component)]
pub struct OpponentField;

#[derive(Component)]
pub struct TurnIndicator;

#[derive(Component)]
pub struct KpiIndicator;

#[derive(Component)]
pub struct PlayerPressureIndicator;

#[derive(Component)]
pub struct OpponentInfoIndicator;

#[derive(Component)]
pub struct ResourceIndicator;

#[derive(Component)]
pub struct NextPhaseButton;

#[derive(PartialEq, Eq, Debug, Clone, Copy)]
pub enum CardType {
    Employee,
    Skill,
}

#[derive(Component)]
pub struct CardComponent {
    pub name: String,
    pub card_type: CardType,
    pub level: u8,
    pub cost: u32,
    pub health: i32,
    pub state: CardState,
    pub owner: TurnOwner,
}

#[derive(PartialEq, Eq, Debug, Clone, Copy)]
pub enum CardState {
    InHand,
    OnField,
    Optimized,
}

#[derive(Resource)]
pub struct GameSession {
    pub player_pressure: i32,
    pub opponent_pressure: i32,
    pub player_kpi: u32,
    pub opponent_kpi: u32,
    pub human_cost: u32,
    pub max_human_cost: u32,
    pub current_turn: TurnOwner,
    pub phase: TurnPhase,
    pub phase_timer: Timer,
    pub deck: Vec<(String, u8, CardType)>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TurnOwner {
    #[default]
    Player,
    Opponent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TurnPhase {
    Preparation,   // 抽卡/资源恢复
    MainAction,    // 打出手牌
    Optimization,  // 指定卡牌进行“优化”以获取 KPI
    EndSettlement, // 效果结算
}

// ─── 初始化 ────────────────────────────────────────────────

fn setup_game(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    selected_mode: Res<SelectedMode>,
) {
    let font = asset_server.load("fonts/simhei.ttf");

    // 生成初始卡库
    let mut deck = Vec::new();
    let department = &selected_mode.0;

    // 基础打工人
    for _ in 0..10 {
        deck.push((format!("{}员", department), 1, CardType::Employee));
        deck.push((format!("{}专家", department), 2, CardType::Employee));
    }
    // 技能卡
    deck.push(("末位淘汰".to_string(), 1, CardType::Skill));
    deck.push(("紧急需求".to_string(), 2, CardType::Skill));

    deck.shuffle(&mut rand::thread_rng());

    commands.insert_resource(GameSession {
        player_pressure: 0,
        opponent_pressure: 0,
        player_kpi: 0,
        opponent_kpi: 0,
        human_cost: 4,
        max_human_cost: 4,
        current_turn: TurnOwner::Player,
        phase: TurnPhase::Preparation,
        phase_timer: Timer::from_seconds(2.0, TimerMode::Once),
        deck,
    });

    commands
        .spawn((
            GameRoot,
            Node {
                width: Val::Vw(100.0),
                height: Val::Vh(100.0),
                flex_direction: FlexDirection::Column,
                justify_content: JustifyContent::SpaceBetween,
                ..default()
            },
        ))
        .with_children(|parent| {
            // --- 顶部 HUD ---
            parent
                .spawn((
                    Node {
                        width: Val::Vw(100.0),
                        height: Val::Px(120.0),
                        padding: UiRect::horizontal(Val::Px(50.0)),
                        justify_content: JustifyContent::SpaceBetween,
                        align_items: AlignItems::Center,
                        ..default()
                    },
                    BackgroundColor(theme::GOTHIC_INK),
                ))
                .with_children(|bar| {
                    // 左侧：对手信息
                    bar.spawn(Node::default()).with_children(|left| {
                        left.spawn((
                            Text::new("OPPONENT DEPARTMENT"),
                            TextFont {
                                font: font.clone(),
                                font_size: 14.0,
                                ..default()
                            },
                            TextColor(theme::GOTHIC_PAPER.with_alpha(0.5)),
                        ));
                        left.spawn((
                            Text::new("KPI: 0% / PRESSURE: 0%"),
                            TextFont {
                                font: font.clone(),
                                font_size: 18.0,
                                ..default()
                            },
                            TextColor(theme::GOTHIC_PAPER),
                            OpponentInfoIndicator,
                        ));
                    });

                    // 中间：状态指示
                    bar.spawn(Node {
                        flex_direction: FlexDirection::Column,
                        align_items: AlignItems::Center,
                        ..default()
                    })
                    .with_children(|mid| {
                        mid.spawn((
                            Text::new("PLAYER TURN"),
                            TextFont {
                                font: font.clone(),
                                font_size: 28.0,
                                ..default()
                            },
                            TextColor(theme::GOTHIC_RED),
                            TurnIndicator,
                        ));

                        mid.spawn((
                            Button,
                            NextPhaseButton,
                            Node {
                                width: Val::Px(180.0),
                                height: Val::Px(40.0),
                                border: UiRect::all(Val::Px(1.0)),
                                justify_content: JustifyContent::Center,
                                align_items: AlignItems::Center,
                                margin: UiRect::top(Val::Px(10.0)),
                                ..default()
                            },
                            BorderColor(theme::GOTHIC_RED),
                            BackgroundColor(theme::GOTHIC_INK),
                        ))
                        .with_children(|btn| {
                            btn.spawn((
                                Text::new("NEXT PHASE [SPACE]"),
                                TextFont {
                                    font: font.clone(),
                                    font_size: 12.0,
                                    ..default()
                                },
                                TextColor(theme::GOTHIC_PAPER),
                            ));
                        });
                    });

                    // 右侧：玩家资源
                    bar.spawn(Node {
                        flex_direction: FlexDirection::Column,
                        align_items: AlignItems::FlexEnd,
                        ..default()
                    })
                    .with_children(|right| {
                        right.spawn((
                            Text::new("KPI PROGRESS"),
                            TextFont {
                                font: font.clone(),
                                font_size: 24.0,
                                ..default()
                            },
                            TextColor(theme::TEXT_HIGHLIGHT),
                            KpiIndicator,
                        ));
                        right.spawn((
                            Text::new("PLAYER PRESSURE: 0%"),
                            TextFont {
                                font: font.clone(),
                                font_size: 18.0,
                                ..default()
                            },
                            TextColor(theme::GOTHIC_RED),
                            PlayerPressureIndicator,
                        ));
                        right.spawn((
                            Text::new("HR BUDGET: 4/4"),
                            TextFont {
                                font: font.clone(),
                                font_size: 18.0,
                                ..default()
                            },
                            TextColor(theme::GOTHIC_PAPER),
                            ResourceIndicator,
                        ));
                    });
                });

            // --- 战场 ---
            parent
                .spawn(Node {
                    flex_grow: 1.0,
                    width: Val::Vw(100.0),
                    flex_direction: FlexDirection::Column,
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    row_gap: Val::Px(20.0),
                    ..default()
                })
                .with_children(|arena| {
                    // 对手区
                    arena.spawn((
                        OpponentField,
                        Node {
                            width: Val::Vw(85.0),
                            height: Val::Px(250.0),
                            border: UiRect::all(Val::Px(1.0)),
                            justify_content: JustifyContent::Center,
                            align_items: AlignItems::Center,
                            column_gap: Val::Px(15.0),
                            ..default()
                        },
                        BorderColor(theme::GOTHIC_INK.with_alpha(0.2)),
                        BackgroundColor(theme::GOTHIC_INK.with_alpha(0.05)),
                    ));

                    // 玩家区
                    arena.spawn((
                        PlayerField,
                        Node {
                            width: Val::Vw(85.0),
                            height: Val::Px(250.0),
                            border: UiRect::all(Val::Px(1.0)),
                            justify_content: JustifyContent::Center,
                            align_items: AlignItems::Center,
                            column_gap: Val::Px(15.0),
                            ..default()
                        },
                        BorderColor(theme::GOTHIC_INK),
                        BackgroundColor(theme::GOTHIC_INK.with_alpha(0.05)),
                    ));
                });

            // --- 底部手牌 ---
            parent.spawn((
                PlayerHand,
                Node {
                    width: Val::Vw(100.0),
                    height: Val::Px(260.0),
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    column_gap: Val::Px(20.0),
                    ..default()
                },
                BackgroundColor(theme::GOTHIC_INK.with_alpha(0.9)),
            ));
        });
}

fn spawn_card(
    parent: &mut ChildBuilder,
    font: &Handle<Font>,
    name: String,
    level: u8,
    card_type: CardType,
    owner: TurnOwner,
) {
    let bg_color = match card_type {
        CardType::Employee => theme::GOTHIC_GREY,
        CardType::Skill => theme::GOTHIC_RED.with_alpha(0.3),
    };

    parent
        .spawn((
            Button,
            CardComponent {
                name: name.clone(),
                card_type,
                level,
                cost: level as u32,
                health: (level * 5) as i32,
                state: CardState::InHand,
                owner,
            },
            Node {
                width: Val::Px(140.0),
                height: Val::Px(210.0),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                justify_content: JustifyContent::SpaceBetween,
                padding: UiRect::all(Val::Px(12.0)),
                border: UiRect::all(Val::Px(1.0)),
                ..default()
            },
            BorderColor(theme::GOTHIC_INK),
            BackgroundColor(bg_color),
            Transform::from_scale(Vec3::ZERO), // 动画入场
        ))
        .with_children(|card| {
            // 类型标签
            card.spawn((
                Text::new(match card_type {
                    CardType::Employee => "EMPLOYEE",
                    CardType::Skill => "SKILL",
                }),
                TextFont {
                    font: font.clone(),
                    font_size: 10.0,
                    ..default()
                },
                TextColor(theme::GOTHIC_PAPER.with_alpha(0.6)),
            ));

            // 名称
            card.spawn((
                Text::new(name),
                TextFont {
                    font: font.clone(),
                    font_size: 16.0,
                    ..default()
                },
                TextColor(Color::BLACK),
            ));

            // 等级/数值
            card.spawn((
                Text::new(format!("P{}", level)),
                TextFont {
                    font: font.clone(),
                    font_size: 24.0,
                    ..default()
                },
                TextColor(theme::GOTHIC_INK),
            ));

            // 消耗
            card.spawn((
                Text::new(format!("COST: {}", level)),
                TextFont {
                    font: font.clone(),
                    font_size: 12.0,
                    ..default()
                },
                TextColor(theme::GOTHIC_RED),
            ));
        });
}

// ─── 核心逻辑系统 ──────────────────────────────────────────

fn turn_phase_manager(
    time: Res<Time>,
    mut session: ResMut<GameSession>,
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    player_hand: Query<Entity, With<PlayerHand>>,
    cards_query: Query<&CardComponent>,
) {
    session.phase_timer.tick(time.delta());

    if session.phase_timer.finished() {
        match session.phase {
            TurnPhase::Preparation => {
                // 抽牌逻辑
                if session.current_turn == TurnOwner::Player {
                    let font = asset_server.load("fonts/simhei.ttf");
                    if let Ok(hand_entity) = player_hand.get_single() {
                        let mut hand_builder = commands.entity(hand_entity);
                        hand_builder.with_children(|p| {
                            // 每次回合开始尝试抽 2 张牌
                            for _ in 0..2 {
                                if let Some((name, lvl, ctype)) = session.deck.pop() {
                                    spawn_card(p, &font, name, lvl, ctype, TurnOwner::Player);
                                }
                            }
                        });
                    }
                }
                session.phase = TurnPhase::MainAction;
                session.phase_timer = Timer::from_seconds(30.0, TimerMode::Once);
            }
            TurnPhase::MainAction => {
                session.phase = TurnPhase::Optimization;
                session.phase_timer = Timer::from_seconds(15.0, TimerMode::Once);
            }
            TurnPhase::Optimization => {
                session.phase = TurnPhase::EndSettlement;
                session.phase_timer = Timer::from_seconds(5.0, TimerMode::Once);
            }
            TurnPhase::EndSettlement => {
                session.phase = TurnPhase::Preparation;

                // 计算在场员工对敌方造成的压力
                let mut p_damage = 0;
                let mut o_damage = 0;
                for card in &cards_query {
                    if card.state == CardState::OnField {
                        if card.card_type == CardType::Employee {
                            if card.owner == TurnOwner::Player {
                                o_damage += card.level as i32 * 5;
                            } else {
                                p_damage += card.level as i32 * 5;
                            }
                        }
                    }
                }
                session.player_pressure += p_damage;
                session.opponent_pressure += o_damage;

                session.current_turn = match session.current_turn {
                    TurnOwner::Player => TurnOwner::Opponent,
                    TurnOwner::Opponent => TurnOwner::Player,
                };
                session.phase_timer = Timer::from_seconds(2.0, TimerMode::Once);

                // 资源恢复
                if session.current_turn == TurnOwner::Player {
                    session.max_human_cost += 1;
                    session.human_cost = session.max_human_cost;
                }
            }
        }
    }
}

fn handle_card_interactions(
    mut interaction_query: Query<
        (
            &Interaction,
            &mut CardComponent,
            Entity,
            &mut BorderColor,
            &mut BackgroundColor,
        ),
        (Changed<Interaction>, With<Button>, Without<NextPhaseButton>),
    >,
    mut commands: Commands,
    player_field: Query<Entity, With<PlayerField>>,
    mut session: ResMut<GameSession>,
) {
    if session.current_turn != TurnOwner::Player {
        return;
    }

    for (interaction, mut card, entity, mut border, mut bg) in &mut interaction_query {
        match *interaction {
            Interaction::Pressed => {
                if session.phase == TurnPhase::MainAction && card.state == CardState::InHand {
                    if session.human_cost >= card.cost {
                        session.human_cost -= card.cost;
                        if card.card_type == CardType::Skill {
                            if card.name == "末位淘汰" {
                                session.opponent_pressure += 10;
                            } else if card.name == "紧急需求" {
                                session.player_kpi += 5;
                                session.opponent_pressure += 5;
                            }
                            commands.entity(entity).despawn_recursive();
                        } else {
                            if let Ok(field) = player_field.get_single() {
                                card.state = CardState::OnField;
                                commands.entity(entity).set_parent(field);
                                border.0 = theme::GOTHIC_RED;
                            }
                        }
                    }
                } else if session.phase == TurnPhase::Optimization
                    && card.state == CardState::OnField
                    && card.card_type == CardType::Employee
                {
                    // 执行裁员
                    card.state = CardState::Optimized;
                    session.player_kpi += (card.level as u32) * 10;
                    commands.entity(entity).despawn_recursive();
                }
            }
            Interaction::Hovered => {
                bg.0 = theme::TEXT_HIGHLIGHT.with_alpha(0.1);
            }
            Interaction::None => {
                bg.0 = if card.card_type == CardType::Employee {
                    theme::GOTHIC_GREY
                } else {
                    theme::GOTHIC_RED.with_alpha(0.3)
                };
            }
        }
    }
}

fn next_phase_button_system(
    mut interaction_query: Query<&Interaction, (Changed<Interaction>, With<NextPhaseButton>)>,
    keyboard: Res<ButtonInput<KeyCode>>,
    mut session: ResMut<GameSession>,
) {
    let mut pressed = keyboard.just_pressed(KeyCode::Space);
    for interaction in &mut interaction_query {
        if *interaction == Interaction::Pressed {
            pressed = true;
        }
    }
    if pressed {
        session
            .phase_timer
            .set_duration(std::time::Duration::from_secs(0));
    }
}

fn opponent_ai_system(
    mut commands: Commands,
    mut session: ResMut<GameSession>,
    opponent_field: Query<Entity, With<OpponentField>>,
    asset_server: Res<AssetServer>,
) {
    if session.current_turn != TurnOwner::Opponent {
        return;
    }

    // 极其简易的 AI：在 MainAction 阶段直接生成一张牌到场上并跳过
    if session.phase == TurnPhase::MainAction && session.phase_timer.remaining_secs() > 10.0 {
        if let Ok(field_entity) = opponent_field.get_single() {
            let font = asset_server.load("fonts/simhei.ttf");
            commands.entity(field_entity).with_children(|p| {
                spawn_card(
                    p,
                    &font,
                    "竞对员工".to_string(),
                    1,
                    CardType::Employee,
                    TurnOwner::Opponent,
                );
            });
            // 结束后直接跳到下一阶段
            session
                .phase_timer
                .set_duration(std::time::Duration::from_secs(0));
        }
    } else if session.phase == TurnPhase::Optimization {
        // AI 优化逻辑占位
        session
            .phase_timer
            .set_duration(std::time::Duration::from_secs(0));
    }
}

fn update_resources_ui(
    session: Res<GameSession>,
    mut turn_q: Query<&mut Text, With<TurnIndicator>>,
    mut kpi_q: Query<&mut Text, (With<KpiIndicator>, Without<TurnIndicator>)>,
    mut res_q: Query<
        &mut Text,
        (
            With<ResourceIndicator>,
            Without<TurnIndicator>,
            Without<KpiIndicator>,
        ),
    >,
    mut opp_q: Query<
        &mut Text,
        (
            With<OpponentInfoIndicator>,
            Without<ResourceIndicator>,
            Without<TurnIndicator>,
            Without<KpiIndicator>,
        ),
    >,
    mut pp_q: Query<
        &mut Text,
        (
            With<PlayerPressureIndicator>,
            Without<OpponentInfoIndicator>,
            Without<ResourceIndicator>,
            Without<TurnIndicator>,
            Without<KpiIndicator>,
        ),
    >,
) {
    if let Ok(mut t) = turn_q.get_single_mut() {
        t.0 = format!("{:?} // {:?}", session.current_turn, session.phase);
    }
    if let Ok(mut k) = kpi_q.get_single_mut() {
        k.0 = format!("KPI: {}%", session.player_kpi);
    }
    if let Ok(mut r) = res_q.get_single_mut() {
        r.0 = format!(
            "HR BUDGET: {}/{}",
            session.human_cost, session.max_human_cost
        );
    }
    if let Ok(mut o) = opp_q.get_single_mut() {
        o.0 = format!(
            "KPI: {}% / PRESSURE: {}%",
            session.opponent_kpi, session.opponent_pressure
        );
    }
    if let Ok(mut p) = pp_q.get_single_mut() {
        p.0 = format!("PLAYER PRESSURE: {}%", session.player_pressure);
    }
}

fn check_win_conditions(session: Res<GameSession>, mut next_state: ResMut<NextState<GameState>>) {
    if session.player_kpi >= 100 || session.opponent_pressure >= 100 {
        next_state.set(GameState::MainMenu);
    } else if session.opponent_kpi >= 100 || session.player_pressure >= 100 {
        next_state.set(GameState::MainMenu);
    }
}

fn card_animation_system(time: Res<Time>, mut query: Query<&mut Transform, With<CardComponent>>) {
    for mut transform in &mut query {
        transform.scale = transform.scale.lerp(Vec3::ONE, time.delta_secs() * 5.0);
    }
}

fn cleanup_game(mut commands: Commands, query: Query<Entity, With<GameRoot>>) {
    for entity in &query {
        commands.entity(entity).despawn_recursive();
    }
}
