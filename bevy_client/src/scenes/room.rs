use bevy::prelude::*;
use crate::{GameStateRes, AppState};
use crate::network::{NetworkChannels, send_command};

#[derive(Component)]
pub struct RoomUI;

#[derive(Component)]
pub(crate) struct ReadyBtn;

#[derive(Component)]
pub(crate) struct StartBtn;

#[derive(Component)]
pub(crate) struct LeaveBtn;

#[derive(Component)]
pub(crate) struct PlayerListArea;

#[derive(Component)]
pub(crate) struct RoomCodeDisplay;

pub fn setup_room(mut commands: Commands, game_state: Res<GameStateRes>) {
    let room_code = game_state.0.as_ref().map(|s| s.room_code.clone()).unwrap_or_default();

    commands.spawn((
        RoomUI,
        Node {
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            flex_direction: FlexDirection::Column,
            justify_content: JustifyContent::Center,
            align_items: AlignItems::Center,
            row_gap: Val::Px(20.0),
            ..default()
        },
    )).with_children(|root| {
        // Title
        root.spawn((
            Text::new("房间等待中"),
            TextFont { font_size: 36.0, ..default() },
            TextColor(Color::WHITE),
        ));

        // Room code display
        root.spawn((
            RoomCodeDisplay,
            Node {
                padding: UiRect::axes(Val::Px(30.0), Val::Px(12.0)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.15, 0.15, 0.2, 0.8)),
            BorderRadius::all(Val::Px(12.0)),
        )).with_children(|code_box| {
            code_box.spawn((
                Text::new(format!("房间代码: {}", room_code)),
                TextFont { font_size: 22.0, ..default() },
                TextColor(Color::srgb(0.1, 0.8, 0.5)),
            ));
        });

        // Player list
        root.spawn((
            PlayerListArea,
            Node {
                width: Val::Px(400.0),
                min_height: Val::Px(200.0),
                flex_direction: FlexDirection::Column,
                padding: UiRect::all(Val::Px(20.0)),
                row_gap: Val::Px(8.0),
                ..default()
            },
            BackgroundColor(Color::srgba(0.1, 0.1, 0.12, 0.7)),
            BorderRadius::all(Val::Px(16.0)),
        )).with_children(|list| {
            list.spawn((
                Text::new("等待玩家加入..."),
                TextFont { font_size: 16.0, ..default() },
                TextColor(Color::srgb(0.5, 0.5, 0.6)),
            ));
        });

        // Buttons row
        root.spawn(Node {
            flex_direction: FlexDirection::Row,
            column_gap: Val::Px(15.0),
            ..default()
        }).with_children(|btns| {
            // Ready button
            btns.spawn((
                ReadyBtn,
                Button,
                Node {
                    padding: UiRect::axes(Val::Px(30.0), Val::Px(14.0)),
                    ..default()
                },
                BackgroundColor(Color::srgb(0.1, 0.55, 0.35)),
                BorderRadius::all(Val::Px(10.0)),
            )).with_children(|btn| {
                btn.spawn((
                    Text::new("准备"),
                    TextFont { font_size: 16.0, ..default() },
                    TextColor(Color::WHITE),
                ));
            });

            // Start button
            btns.spawn((
                StartBtn,
                Button,
                Node {
                    padding: UiRect::axes(Val::Px(30.0), Val::Px(14.0)),
                    ..default()
                },
                BackgroundColor(Color::srgb(0.2, 0.5, 0.9)),
                BorderRadius::all(Val::Px(10.0)),
            )).with_children(|btn| {
                btn.spawn((
                    Text::new("开始游戏"),
                    TextFont { font_size: 16.0, ..default() },
                    TextColor(Color::WHITE),
                ));
            });

            // Leave
            btns.spawn((
                LeaveBtn,
                Button,
                Node {
                    padding: UiRect::axes(Val::Px(30.0), Val::Px(14.0)),
                    ..default()
                },
                BackgroundColor(Color::srgba(0.5, 0.1, 0.1, 0.8)),
                BorderRadius::all(Val::Px(10.0)),
            )).with_children(|btn| {
                btn.spawn((
                    Text::new("退出房间"),
                    TextFont { font_size: 16.0, ..default() },
                    TextColor(Color::WHITE),
                ));
            });
        });
    });
}

pub fn cleanup_room(mut commands: Commands, q: Query<Entity, With<RoomUI>>) {
    for e in &q {
        commands.entity(e).despawn_recursive();
    }
}

pub fn room_ui(
    channels: Option<Res<NetworkChannels>>,
    mut ready_q: Query<(&Interaction, &mut BackgroundColor), (Changed<Interaction>, With<ReadyBtn>)>,
    mut start_q: Query<(&Interaction, &mut BackgroundColor), (Changed<Interaction>, With<StartBtn>, Without<ReadyBtn>)>,
    mut leave_q: Query<(&Interaction, &mut BackgroundColor), (Changed<Interaction>, With<LeaveBtn>, Without<ReadyBtn>, Without<StartBtn>)>,
    mut app_state: ResMut<NextState<AppState>>,
    game_state: Res<GameStateRes>,
    list_q: Query<&Children, With<PlayerListArea>>,
    mut text_q: Query<&mut Text>,
) {
    let Some(channels) = channels else { return };

    // Ready
    for (interaction, mut bg) in &mut ready_q {
        if *interaction == Interaction::Pressed {
            send_command(&channels, "TOGGLE_READY", serde_json::Value::Null);
        }
        match *interaction {
            Interaction::Hovered => *bg = BackgroundColor(Color::srgb(0.15, 0.65, 0.42)),
            Interaction::None => *bg = BackgroundColor(Color::srgb(0.1, 0.55, 0.35)),
            _ => {}
        }
    }

    // Start
    for (interaction, mut bg) in &mut start_q {
        if *interaction == Interaction::Pressed {
            send_command(&channels, "START_GAME", serde_json::Value::Null);
        }
        match *interaction {
            Interaction::Hovered => *bg = BackgroundColor(Color::srgb(0.3, 0.6, 1.0)),
            Interaction::None => *bg = BackgroundColor(Color::srgb(0.2, 0.5, 0.9)),
            _ => {}
        }
    }

    // Leave
    for (interaction, mut bg) in &mut leave_q {
        if *interaction == Interaction::Pressed {
            send_command(&channels, "LEAVE_ROOM", serde_json::Value::Null);
            app_state.set(AppState::Lobby);
        }
        match *interaction {
            Interaction::Hovered => *bg = BackgroundColor(Color::srgba(0.6, 0.15, 0.15, 0.9)),
            Interaction::None => *bg = BackgroundColor(Color::srgba(0.5, 0.1, 0.1, 0.8)),
            _ => {}
        }
    }

    // Update player list text
    if let Some(state) = &game_state.0 {
        for children in &list_q {
            for &child in children.iter() {
                if let Ok(mut text) = text_q.get_mut(child) {
                    let mut lines = String::new();
                    for (i, p) in state.players.iter().enumerate() {
                        let host_tag = if i == 0 { " [房主]" } else { "" };
                        let ready_tag = if p.is_ready { " ✓" } else { "" };
                        lines.push_str(&format!("{}{}{}  ({} 张牌)\n", p.name, host_tag, ready_tag, p.hand.len()));
                    }
                    if lines.is_empty() {
                        lines = "等待玩家加入...".to_string();
                    }
                    **text = lines;
                }
            }
        }
    }
}
