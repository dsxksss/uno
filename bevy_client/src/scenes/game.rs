use bevy::prelude::*;
use crate::{GameStateRes, AppState};
use crate::network::{NetworkChannels, LocalClientId, send_command};

#[derive(Component)]
pub struct GameUI;

#[derive(Component)]
#[allow(dead_code)]
pub(crate) struct CardEntity {
    card_id: String,
    color: String,
    value: String,
}

#[derive(Component)]
pub(crate) struct DiscardDisplay;

#[derive(Component)]
#[allow(dead_code)]
pub(crate) struct HandCard(usize);

#[derive(Component)]
pub(crate) struct HudText;

#[derive(Component)]
pub(crate) struct DrawPileBtn;

#[derive(Component)]
pub(crate) struct LeaveGameBtn;

fn card_color(color: &str) -> Color {
    match color {
        "red" => Color::srgb(0.93, 0.27, 0.27),
        "blue" => Color::srgb(0.23, 0.51, 0.96),
        "green" => Color::srgb(0.06, 0.73, 0.50),
        "yellow" => Color::srgb(0.98, 0.80, 0.08),
        _ => Color::srgb(0.2, 0.2, 0.25),
    }
}

fn card_display_text(value: &str) -> String {
    match value {
        "skip" => "⊘".into(),
        "reverse" => "⇄".into(),
        "draw2" => "+2".into(),
        "draw4" => "+4".into(),
        "wild" => "W".into(),
        v => v.to_string(),
    }
}

pub fn setup_game(mut commands: Commands, _game_state: Res<GameStateRes>) {
    commands.spawn((
        GameUI,
        Node {
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            flex_direction: FlexDirection::Column,
            ..default()
        },
    )).with_children(|root| {
        // Top HUD bar
        root.spawn(Node {
            width: Val::Percent(100.0),
            height: Val::Px(60.0),
            flex_direction: FlexDirection::Row,
            justify_content: JustifyContent::SpaceBetween,
            align_items: AlignItems::Center,
            padding: UiRect::axes(Val::Px(20.0), Val::Px(10.0)),
            ..default()
        }).with_children(|hud| {
            hud.spawn((
                HudText,
                Text::new("游戏进行中..."),
                TextFont { font_size: 18.0, ..default() },
                TextColor(Color::WHITE),
            ));
            // Leave button
            hud.spawn((
                LeaveGameBtn,
                Button,
                Node {
                    padding: UiRect::axes(Val::Px(20.0), Val::Px(8.0)),
                    ..default()
                },
                BackgroundColor(Color::srgba(0.5, 0.1, 0.1, 0.8)),
                BorderRadius::all(Val::Px(8.0)),
            )).with_children(|btn| {
                btn.spawn((
                    Text::new("退出"),
                    TextFont { font_size: 14.0, ..default() },
                    TextColor(Color::WHITE),
                ));
            });
        });

        // Center area: discard pile
        root.spawn(Node {
            width: Val::Percent(100.0),
            height: Val::Percent(50.0),
            justify_content: JustifyContent::Center,
            align_items: AlignItems::Center,
            ..default()
        }).with_children(|center| {
            // Discard card display
            center.spawn((
                DiscardDisplay,
                Node {
                    width: Val::Px(120.0),
                    height: Val::Px(170.0),
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    ..default()
                },
                BackgroundColor(Color::srgb(0.2, 0.2, 0.25)),
                BorderRadius::all(Val::Px(14.0)),
            )).with_children(|card| {
                card.spawn((
                    Text::new("?"),
                    TextFont { font_size: 50.0, ..default() },
                    TextColor(Color::WHITE),
                ));
            });

            // Draw pile button
            center.spawn((
                DrawPileBtn,
                Button,
                Node {
                    width: Val::Px(100.0),
                    height: Val::Px(140.0),
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    margin: UiRect::left(Val::Px(40.0)),
                    ..default()
                },
                BackgroundColor(Color::srgba(0.15, 0.15, 0.2, 0.8)),
                BorderRadius::all(Val::Px(12.0)),
            )).with_children(|pile| {
                pile.spawn((
                    Text::new("摸牌"),
                    TextFont { font_size: 16.0, ..default() },
                    TextColor(Color::srgb(0.5, 0.5, 0.6)),
                ));
            });
        });

        // Bottom: hand area
        root.spawn(Node {
            width: Val::Percent(100.0),
            height: Val::Percent(35.0),
            flex_direction: FlexDirection::Row,
            justify_content: JustifyContent::Center,
            align_items: AlignItems::FlexEnd,
            column_gap: Val::Px(4.0),
            padding: UiRect::bottom(Val::Px(20.0)),
            overflow: Overflow::clip(),
            ..default()
        }).with_children(|hand_area| {
            // Cards will be spawned dynamically in game_ui system
            hand_area.spawn((
                Text::new("手牌加载中..."),
                TextFont { font_size: 16.0, ..default() },
                TextColor(Color::srgb(0.5, 0.5, 0.6)),
            ));
        });
    });
}

pub fn cleanup_game(mut commands: Commands, q: Query<Entity, With<GameUI>>) {
    for e in &q {
        commands.entity(e).despawn_recursive();
    }
}

pub fn game_ui(
    channels: Option<Res<NetworkChannels>>,
    _client_id: Res<LocalClientId>,
    game_state: Res<GameStateRes>,
    mut hud_q: Query<&mut Text, With<HudText>>,
    mut discard_q: Query<(&mut BackgroundColor, &Children), With<DiscardDisplay>>,
    mut text_q: Query<&mut Text, Without<HudText>>,
    draw_q: Query<&Interaction, (Changed<Interaction>, With<DrawPileBtn>)>,
    leave_q: Query<&Interaction, (Changed<Interaction>, With<LeaveGameBtn>, Without<DrawPileBtn>)>,
    mut app_state: ResMut<NextState<AppState>>,
) {
    let Some(channels) = channels else { return };
    let Some(state) = &game_state.0 else { return };

    // Update HUD
    let current = state.players.get(state.current_player_index as usize);
    let turn_name = current.map(|p| p.name.as_str()).unwrap_or("?");
    let dir = if state.direction == 1 { "→" } else { "←" };
    for mut text in &mut hud_q {
        **text = format!(
            "当前回合: {}  |  方向: {}  |  房间: {}  |  剩余牌堆: {} 张",
            turn_name, dir, state.room_code, state.deck.len()
        );
    }

    // Update discard pile display
    if let Some(top) = state.discard_pile.last() {
        for (mut bg, children) in &mut discard_q {
            *bg = BackgroundColor(card_color(&top.color));
            for &child in children.iter() {
                if let Ok(mut text) = text_q.get_mut(child) {
                    **text = card_display_text(&top.value);
                }
            }
        }
    }

    // Draw card
    for interaction in &draw_q {
        if *interaction == Interaction::Pressed {
            send_command(&channels, "DRAW_CARD", serde_json::Value::Null);
        }
    }

    // Leave game
    for interaction in &leave_q {
        if *interaction == Interaction::Pressed {
            send_command(&channels, "LEAVE_ROOM", serde_json::Value::Null);
            app_state.set(AppState::Lobby);
        }
    }
}
