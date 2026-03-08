use bevy::prelude::*;
use crate::network::{NetworkChannels, send_command, LocalClientId};
use crate::GameStateRes;
use crate::protocol::{SkillCard, Employee};

#[derive(Component)]
pub struct GameUIRoot;

#[derive(Component)]
pub struct CardBtn(pub String); // stores card id

#[derive(Component)]
pub struct EndTurnBtn;

#[derive(Component)]
pub struct EmployeeBtn {
    pub id: String,
}

#[derive(Resource, Default)]
pub struct SelectedCard {
    pub id: Option<String>,
}

// Containers
#[derive(Component)]
pub struct OpponentZone;

#[derive(Component)]
pub struct MyZone;

#[derive(Component)]
pub struct HandZone;

#[derive(Component)]
pub struct StatusZone;

#[derive(Component)]
pub struct ToastText;

pub fn setup_game(mut commands: Commands) {
    commands.insert_resource(SelectedCard { id: None });
    
    commands.spawn((
        GameUIRoot,
        Node {
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            flex_direction: FlexDirection::Column,
            justify_content: JustifyContent::SpaceBetween,
            padding: UiRect::all(Val::Px(20.0)),
            ..default()
        },
    )).with_children(|root| {
        // --- 1. Opponent Zone ---
        root.spawn((
            OpponentZone,
            Node {
                width: Val::Percent(100.0), height: Val::Percent(25.0),
                flex_direction: FlexDirection::Row,
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                column_gap: Val::Px(15.0),
                padding: UiRect::all(Val::Px(15.0)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.2, 0.1, 0.1, 0.5)),
            BorderRadius::all(Val::Px(10.0)),
        ));

        // --- 2. Center Status ---
        root.spawn((
            StatusZone,
            Node {
                width: Val::Percent(100.0), height: Val::Percent(15.0),
                flex_direction: FlexDirection::Row,
                justify_content: JustifyContent::SpaceBetween,
                align_items: AlignItems::Center,
                padding: UiRect::axes(Val::Px(40.0), Val::Px(0.0)),
                ..default()
            },
        ));

        // --- 3. My Zone ---
        root.spawn((
            MyZone,
            Node {
                width: Val::Percent(100.0), height: Val::Percent(25.0),
                flex_direction: FlexDirection::Row,
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                column_gap: Val::Px(15.0),
                padding: UiRect::all(Val::Px(15.0)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.1, 0.2, 0.1, 0.5)),
            BorderRadius::all(Val::Px(10.0)),
        ));

        // --- 4. Hand Zone ---
        root.spawn((
            HandZone,
            Node {
                width: Val::Percent(100.0), height: Val::Percent(25.0),
                flex_direction: FlexDirection::Row,
                justify_content: JustifyContent::Center,
                align_items: AlignItems::FlexEnd,
                column_gap: Val::Px(10.0),
                ..default()
            },
        ));
    });

    // Toast
    commands.spawn((
        GameUIRoot,
        ToastText,
        Text::new(""),
        TextFont { font_size: 28.0, ..default() },
        TextColor(Color::srgb(1.0, 0.8, 0.2)),
        Node {
            position_type: PositionType::Absolute,
            top: Val::Px(20.0),
            left: Val::Percent(50.0),
            ..default()
        },
    ));
}

pub fn cleanup_game(mut commands: Commands, q: Query<Entity, With<GameUIRoot>>) {
    for e in &q { commands.entity(e).despawn_recursive(); }
    commands.remove_resource::<SelectedCard>();
}

// -----------------------------------------------------------------------------------------
// UI Rendering - ONLY REBUILD WHEN GAME STATE CHANGES OR SELECTION CHANGES
// -----------------------------------------------------------------------------------------

pub fn update_game_ui(
    mut commands: Commands,
    game_state: Res<GameStateRes>,
    local_id: Res<LocalClientId>,
    selected_card: Res<SelectedCard>,
    
    q_opp: Query<Entity, With<OpponentZone>>,
    q_mine: Query<Entity, With<MyZone>>,
    q_hand: Query<Entity, With<HandZone>>,
    q_status: Query<Entity, With<StatusZone>>,
    mut q_toast: Query<&mut Text, With<ToastText>>,
) {
    if !game_state.is_changed() && !selected_card.is_changed() { return; }

    let Some(state) = &game_state.0 else { return };
    let Some(my_id) = &local_id.0 else { return };

    let mut my_idx = 0;
    for (i, p) in state.players.iter().enumerate() {
        if p.id == *my_id {
            my_idx = i;
            break;
        }
    }
    let is_my_turn = state.current_player_index as usize == my_idx;
    let my_player = &state.players[my_idx];
    let opp_idx = (my_idx + 1) % state.players.len();
    let opp_player = if state.players.len() > 1 { Some(&state.players[opp_idx]) } else { None };

    // Update Toast
    if let Ok(mut text) = q_toast.get_single_mut() {
        if let Some(msg) = &state.event_message { **text = msg.clone(); }
        else if let Some(msg) = &state.last_action { **text = msg.clone(); }
        else { **text = "".into(); }
    }

    // 1. Opponent Zone
    if let Ok(ent) = q_opp.get_single() {
        commands.entity(ent).despawn_descendants();
        if let Some(opp) = opp_player {
            commands.entity(ent).with_children(|b| {
                b.spawn((
                    Text::new(format!("对手部门: {}\n法力: {}/{}", opp.name, opp.mana, opp.max_mana)),
                    TextColor(Color::srgb(0.8, 0.8, 0.8))
                ));
                for emp in &opp.employees {
                    spawn_employee(b, emp, false);
                }
            });
        }
    }

    // 2. My Zone
    if let Ok(ent) = q_mine.get_single() {
        commands.entity(ent).despawn_descendants();
        commands.entity(ent).with_children(|b| {
            b.spawn((
                Text::new(format!("你的部门: {}\n法力: {}/{}", my_player.name, my_player.mana, my_player.max_mana)),
                TextColor(Color::WHITE)
            ));
            for emp in &my_player.employees {
                spawn_employee(b, emp, true);
            }
        });
    }

    // 3. Hand
    if let Ok(ent) = q_hand.get_single() {
        commands.entity(ent).despawn_descendants();
        commands.entity(ent).with_children(|b| {
            for card in &my_player.hand {
                let is_selected = selected_card.id.as_deref() == Some(card.id.as_str());
                spawn_skill_card(b, card, is_selected);
            }
        });
    }

    // 4. Status
    if let Ok(ent) = q_status.get_single() {
        commands.entity(ent).despawn_descendants();
        commands.entity(ent).with_children(|b| {
            b.spawn(Node { flex_direction: FlexDirection::Column, ..default() }).with_children(|col| {
                col.spawn((Text::new(format!("KPI 考核周期: {}", state.turn_number)), TextColor(Color::WHITE)));
                let turn_text = if is_my_turn { "▶ 你主导发声" } else { "⏳ 对方闭麦发言中" };
                col.spawn((Text::new(turn_text), TextColor(if is_my_turn { Color::srgb(0.4, 0.9, 0.4) } else { Color::srgb(0.9, 0.4, 0.4) })));
                col.spawn((Text::new(format!("剩余 {}s", state.time_left)), TextColor(Color::srgb(0.5, 0.5, 0.5))));
            });

            b.spawn((
                EndTurnBtn, Button,
                Node { padding: UiRect::axes(Val::Px(30.0), Val::Px(15.0)), ..default() },
                BackgroundColor(if is_my_turn { Color::srgb(0.8, 0.2, 0.2) } else { Color::srgb(0.3, 0.3, 0.3) }),
                BorderRadius::all(Val::Px(5.0)),
            )).with_children(|btn| {
                btn.spawn((Text::new("结束发言 (End Turn)"), TextColor(Color::WHITE), TextFont { font_size: 20.0, ..default() }));
            });
        });
    }
}

// -----------------------------------------------------------------------------------------
// Component Rendering Helpers
// -----------------------------------------------------------------------------------------

fn spawn_employee(b: &mut ChildBuilder, emp: &Employee, is_mine: bool) {
    let color = if is_mine { Color::srgb(0.15, 0.4, 0.25) } else { Color::srgb(0.4, 0.15, 0.15) };
    
    b.spawn((
        EmployeeBtn { id: emp.id.clone() },
        Button,
        Node {
            width: Val::Px(130.0), height: Val::Px(160.0),
            flex_direction: FlexDirection::Column,
            justify_content: JustifyContent::SpaceBetween,
            padding: UiRect::all(Val::Px(10.0)),
            border: UiRect::all(Val::Px(2.0)),
            ..default()
        },
        BackgroundColor(color),
        BorderColor(Color::srgb(0.3, 0.3, 0.3)),
        BorderRadius::all(Val::Px(8.0)),
    )).with_children(|c| {
        c.spawn((Text::new(format!("P{} {}", emp.level, emp.name)), TextColor(Color::WHITE), TextFont { font_size: 16.0, ..default() }));
        
        // HP Bar
        c.spawn(Node { width: Val::Percent(100.0), height: Val::Px(10.0), ..default() }).with_children(|hp_bar| {
            let hp_percent = if emp.max_hp > 0 { (emp.hp as f32 / emp.max_hp as f32) * 100.0 } else { 0.0 };
            hp_bar.spawn((
                Node { width: Val::Percent(hp_percent), height: Val::Percent(100.0), ..default() },
                BackgroundColor(Color::srgb(1.0, 0.3, 0.3)),
            ));
        });
        
        c.spawn((Text::new(format!("HP: {}/{}", emp.hp, emp.max_hp)), TextColor(Color::WHITE), TextFont { font_size: 14.0, ..default() }));
        if emp.shielded {
            c.spawn((Text::new("🛡️ 居家(免疫干涉)"), TextColor(Color::srgb(0.5, 0.8, 1.0)), TextFont { font_size: 12.0, ..default() }));
        }
    });
}

fn spawn_skill_card(b: &mut ChildBuilder, card: &SkillCard, is_selected: bool) {
    let bg_color = if is_selected { Color::srgb(0.8, 0.7, 0.2) } else { Color::srgb(0.25, 0.25, 0.35) };
    let border_color = if is_selected { Color::WHITE } else { Color::BLACK };
    
    let type_str = match card.card_type.as_str() {
        "optimize" => "裁员",
        "interfere" => "干扰",
        "buff" => "增益",
        "defense" => "防御",
        "global" => "全局",
        "ultimate" => "终极大招",
        _ => "技能",
    };

    b.spawn((
        CardBtn(card.id.clone()),
        Button,
        Node {
            width: Val::Px(140.0), height: Val::Px(200.0),
            flex_direction: FlexDirection::Column,
            justify_content: JustifyContent::SpaceBetween,
            padding: UiRect::all(Val::Px(12.0)),
            margin: if is_selected { UiRect::bottom(Val::Px(20.0)) } else { UiRect::all(Val::Px(0.0)) },
            border: UiRect::all(Val::Px(3.0)),
            ..default()
        },
        BackgroundColor(bg_color),
        BorderColor(border_color),
        BorderRadius::all(Val::Px(10.0)),
    )).with_children(|c| {
        c.spawn(Node { justify_content: JustifyContent::SpaceBetween, width: Val::Percent(100.0), ..default() }).with_children(|row| {
            row.spawn((Text::new(format!("{}费", card.cost)), TextColor(Color::srgb(0.2, 1.0, 1.0)), TextFont { font_size: 16.0, ..default() }));
            row.spawn((Text::new(type_str), TextColor(Color::WHITE), TextFont { font_size: 12.0, ..default() }));
        });
        c.spawn((Text::new(&card.name), TextColor(Color::WHITE), TextFont { font_size: 18.0, ..default() }));
        c.spawn((Text::new(&card.description), TextColor(Color::srgb(0.9, 0.9, 0.9)), TextFont { font_size: 13.0, ..default() }));
    });
}

// -----------------------------------------------------------------------------------------
// Input Handling
// -----------------------------------------------------------------------------------------

pub fn game_input(
    channels_res: Option<Res<NetworkChannels>>,
    local_id: Res<LocalClientId>,
    game_state: Res<GameStateRes>,
    mut selected_card: ResMut<SelectedCard>,
    
    mut card_inter: Query<(&Interaction, &CardBtn, &mut BackgroundColor), Changed<Interaction>>,
    mut end_inter: Query<(&Interaction, &EndTurnBtn, &mut BackgroundColor), (Changed<Interaction>, Without<CardBtn>)>,
    mut emp_inter: Query<(&Interaction, &EmployeeBtn, &mut BorderColor), (Changed<Interaction>, Without<CardBtn>, Without<EndTurnBtn>)>,
) {
    let Some(channels) = channels_res else { return };
    let Some(state) = &game_state.0 else { return };
    let Some(my_id) = &local_id.0 else { return };

    let mut is_my_turn = false;
    let mut my_player_idx = 0;
    for (i, p) in state.players.iter().enumerate() {
        if p.id == *my_id {
            my_player_idx = i;
            if state.current_player_index as usize == i { is_my_turn = true; }
            break;
        }
    }

    if !is_my_turn { return; }

    // End Turn
    for (inter, _, mut bg) in &mut end_inter {
        match *inter {
            Interaction::Pressed => {
                send_command(&channels, "END_TURN", serde_json::Value::Null);
                selected_card.id = None;
            }
            Interaction::Hovered => *bg = BackgroundColor(Color::srgb(0.9, 0.3, 0.3)),
            Interaction::None => *bg = BackgroundColor(Color::srgb(0.8, 0.2, 0.2)),
        }
    }

    // Select Card
    for (inter, btn, _) in &mut card_inter {
        if *inter == Interaction::Pressed {
            // Find card
            let mut card_type = "buff";
            for c in &state.players[my_player_idx].hand {
                if c.id == btn.0 { card_type = c.card_type.as_str(); break; }
            }
            
            let requires_target = card_type == "optimize" || card_type == "defense";

            if !requires_target {
                send_command(&channels, "PLAY_CARD", serde_json::json!({
                    "cardId": btn.0,
                    "targetEmpId": ""
                }));
                selected_card.id = None;
            } else {
                if selected_card.id.as_deref() == Some(btn.0.as_str()) {
                    selected_card.id = None;
                } else {
                    selected_card.id = Some(btn.0.clone());
                }
            }
        }
    }

    // Target Employee
    for (inter, emp_btn, mut border) in &mut emp_inter {
        match *inter {
            Interaction::Pressed => {
                if let Some(card_id) = &selected_card.id {
                    send_command(&channels, "PLAY_CARD", serde_json::json!({
                        "cardId": card_id,
                        "targetEmpId": emp_btn.id
                    }));
                    selected_card.id = None;
                }
            }
            Interaction::Hovered => *border = BorderColor(Color::WHITE),
            Interaction::None => *border = BorderColor(Color::srgb(0.3, 0.3, 0.3)),
        }
    }
}
