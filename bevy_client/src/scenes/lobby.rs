use bevy::prelude::*;
use crate::{PlayerName, RoomCodeInput, ErrorMessage};
use crate::network::{NetworkChannels, send_command};

#[derive(Component)]
pub struct LobbyUI;

#[derive(Component)]
pub(crate) struct CreateBtn;

#[derive(Component)]
pub(crate) struct JoinBtn;

#[derive(Component)]
pub(crate) struct RefreshBtn;

#[derive(Component)]
pub(crate) struct NameInput;

#[derive(Component)]
pub(crate) struct RoomInput;

#[derive(Component)]
pub(crate) struct RoomListText;

#[derive(Component)]
pub(crate) struct ErrorText;

pub fn setup_lobby(mut commands: Commands) {
    // Root container
    commands.spawn((
        LobbyUI,
        Node {
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            flex_direction: FlexDirection::Row,
            justify_content: JustifyContent::Center,
            align_items: AlignItems::Center,
            ..default()
        },
    )).with_children(|parent| {
        // Left: Logo area
        parent.spawn(Node {
            width: Val::Percent(45.0),
            height: Val::Percent(100.0),
            justify_content: JustifyContent::Center,
            align_items: AlignItems::Center,
            ..default()
        }).with_children(|logo_area| {
            logo_area.spawn((
                Text::new("UNO\nROYALE"),
                TextFont {
                    font_size: 80.0,
                    ..default()
                },
                TextColor(Color::WHITE),
            ));
        });

        // Right: Panel
        parent.spawn((
            Node {
                width: Val::Px(480.0),
                min_height: Val::Px(600.0),
                flex_direction: FlexDirection::Column,
                padding: UiRect::all(Val::Px(30.0)),
                row_gap: Val::Px(15.0),
                ..default()
            },
            BackgroundColor(Color::srgba(0.12, 0.12, 0.16, 0.7)),
            BorderRadius::all(Val::Px(20.0)),
        )).with_children(|panel| {
            // Warning banner
            panel.spawn((
                Node {
                    padding: UiRect::all(Val::Px(12.0)),
                    ..default()
                },
                BackgroundColor(Color::srgba(0.98, 0.6, 0.1, 0.1)),
                BorderRadius::all(Val::Px(10.0)),
            )).with_children(|warn| {
                warn.spawn((
                    Text::new("⚠ 请先设置你的游戏昵称"),
                    TextFont { font_size: 14.0, ..default() },
                    TextColor(Color::srgb(1.0, 0.7, 0.2)),
                ));
            });

            // Name label
            panel.spawn((
                Text::new("玩家昵称"),
                TextFont { font_size: 14.0, ..default() },
                TextColor(Color::srgb(0.6, 0.6, 0.7)),
            ));

            // Name input (visual placeholder)
            panel.spawn((
                NameInput,
                Node {
                    width: Val::Percent(100.0),
                    height: Val::Px(50.0),
                    padding: UiRect::all(Val::Px(12.0)),
                    justify_content: JustifyContent::FlexStart,
                    align_items: AlignItems::Center,
                    ..default()
                },
                BackgroundColor(Color::srgba(0.05, 0.05, 0.07, 0.8)),
                BorderRadius::all(Val::Px(10.0)),
            )).with_children(|input| {
                input.spawn((
                    Text::new("输入你的名字..."),
                    TextFont { font_size: 16.0, ..default() },
                    TextColor(Color::srgb(0.4, 0.4, 0.5)),
                ));
            });

            // Room list header
            panel.spawn(Node {
                flex_direction: FlexDirection::Row,
                justify_content: JustifyContent::SpaceBetween,
                align_items: AlignItems::Center,
                margin: UiRect::top(Val::Px(10.0)),
                ..default()
            }).with_children(|header| {
                header.spawn((
                    Text::new("🌐 在线房间列表"),
                    TextFont { font_size: 18.0, ..default() },
                    TextColor(Color::WHITE),
                ));
                // Refresh button
                header.spawn((
                    RefreshBtn,
                    Button,
                    Node {
                        padding: UiRect::axes(Val::Px(16.0), Val::Px(8.0)),
                        ..default()
                    },
                    BackgroundColor(Color::srgba(0.2, 0.2, 0.25, 0.8)),
                    BorderRadius::all(Val::Px(8.0)),
                )).with_children(|btn| {
                    btn.spawn((
                        Text::new("刷新"),
                        TextFont { font_size: 13.0, ..default() },
                        TextColor(Color::srgb(0.7, 0.7, 0.7)),
                    ));
                });
            });

            // Room list area
            panel.spawn((
                RoomListText,
                Node {
                    width: Val::Percent(100.0),
                    min_height: Val::Px(120.0),
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    ..default()
                },
                BackgroundColor(Color::srgba(0.0, 0.0, 0.0, 0.2)),
                BorderRadius::all(Val::Px(12.0)),
            )).with_children(|list| {
                list.spawn((
                    Text::new("目前没有任何可加入的房间"),
                    TextFont { font_size: 14.0, ..default() },
                    TextColor(Color::srgb(0.4, 0.4, 0.45)),
                ));
            });

            // Room code label
            panel.spawn((
                Text::new("快速加入"),
                TextFont { font_size: 14.0, ..default() },
                TextColor(Color::srgb(0.6, 0.6, 0.7)),
            ));

            // Room code row
            panel.spawn(Node {
                flex_direction: FlexDirection::Row,
                column_gap: Val::Px(10.0),
                ..default()
            }).with_children(|row| {
                // Room code input
                row.spawn((
                    RoomInput,
                    Node {
                        width: Val::Percent(70.0),
                        height: Val::Px(48.0),
                        padding: UiRect::all(Val::Px(12.0)),
                        align_items: AlignItems::Center,
                        ..default()
                    },
                    BackgroundColor(Color::srgba(0.05, 0.05, 0.07, 0.8)),
                    BorderRadius::all(Val::Px(10.0)),
                )).with_children(|inp| {
                    inp.spawn((
                        Text::new("房间代码..."),
                        TextFont { font_size: 15.0, ..default() },
                        TextColor(Color::srgb(0.4, 0.4, 0.5)),
                    ));
                });

                // Join button
                row.spawn((
                    JoinBtn,
                    Button,
                    Node {
                        width: Val::Percent(30.0),
                        height: Val::Px(48.0),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        ..default()
                    },
                    BackgroundColor(Color::srgba(0.2, 0.2, 0.25, 0.8)),
                    BorderRadius::all(Val::Px(10.0)),
                )).with_children(|btn| {
                    btn.spawn((
                        Text::new("加入私房"),
                        TextFont { font_size: 14.0, ..default() },
                        TextColor(Color::WHITE),
                    ));
                });
            });

            // Create room
            panel.spawn((
                CreateBtn,
                Button,
                Node {
                    width: Val::Percent(100.0),
                    height: Val::Px(52.0),
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    margin: UiRect::top(Val::Px(5.0)),
                    ..default()
                },
                BackgroundColor(Color::srgb(0.1, 0.55, 0.35)),
                BorderRadius::all(Val::Px(10.0)),
            )).with_children(|btn| {
                btn.spawn((
                    Text::new("+ 创建新房间"),
                    TextFont { font_size: 16.0, ..default() },
                    TextColor(Color::WHITE),
                ));
            });

            // Error text
            panel.spawn((
                ErrorText,
                Text::new(""),
                TextFont { font_size: 14.0, ..default() },
                TextColor(Color::srgb(1.0, 0.3, 0.3)),
            ));
        });
    });
}

pub fn cleanup_lobby(mut commands: Commands, q: Query<Entity, With<LobbyUI>>) {
    for e in &q {
        commands.entity(e).despawn_recursive();
    }
}

pub fn lobby_ui(
    channels: Option<Res<NetworkChannels>>,
    mut create_q: Query<(&Interaction, &mut BackgroundColor), (Changed<Interaction>, With<CreateBtn>)>,
    mut join_q: Query<(&Interaction, &mut BackgroundColor), (Changed<Interaction>, With<JoinBtn>, Without<CreateBtn>)>,
    mut refresh_q: Query<(&Interaction, &mut BackgroundColor), (Changed<Interaction>, With<RefreshBtn>, Without<CreateBtn>, Without<JoinBtn>)>,
    room_code: Res<RoomCodeInput>,
    mut error_msg: ResMut<ErrorMessage>,
    mut error_text_q: Query<&mut Text, With<ErrorText>>,
    keyboard: Res<ButtonInput<KeyCode>>,
    mut name_res: ResMut<PlayerName>,
) {
    let Some(channels) = channels else { return };

    // Create room button
    for (interaction, mut bg) in &mut create_q {
        match *interaction {
            Interaction::Pressed => {
                let name = name_res.0.trim().to_string();
                if name.is_empty() {
                    error_msg.0 = Some("请先输入你的昵称！".into());
                } else {
                    send_command(&channels, "CREATE_ROOM", serde_json::json!({
                        "playerName": name
                    }));
                }
            }
            Interaction::Hovered => {
                *bg = BackgroundColor(Color::srgb(0.15, 0.65, 0.42));
            }
            Interaction::None => {
                *bg = BackgroundColor(Color::srgb(0.1, 0.55, 0.35));
            }
        }
    }

    // Join room button
    for (interaction, mut bg) in &mut join_q {
        match *interaction {
            Interaction::Pressed => {
                let name = name_res.0.trim().to_string();
                let code = room_code.0.trim().to_string();
                if name.is_empty() {
                    error_msg.0 = Some("请先输入你的昵称！".into());
                } else if code.is_empty() {
                    error_msg.0 = Some("请输入房间代码！".into());
                } else {
                    send_command(&channels, "JOIN_ROOM", serde_json::json!({
                        "playerName": name,
                        "roomCode": code
                    }));
                }
            }
            Interaction::Hovered => {
                *bg = BackgroundColor(Color::srgba(0.3, 0.3, 0.35, 0.9));
            }
            Interaction::None => {
                *bg = BackgroundColor(Color::srgba(0.2, 0.2, 0.25, 0.8));
            }
        }
    }

    // Refresh
    for (interaction, mut bg) in &mut refresh_q {
        match *interaction {
            Interaction::Pressed => {
                send_command(&channels, "GET_ROOM_LIST", serde_json::Value::Null);
            }
            Interaction::Hovered => {
                *bg = BackgroundColor(Color::srgba(0.3, 0.3, 0.35, 0.9));
            }
            Interaction::None => {
                *bg = BackgroundColor(Color::srgba(0.2, 0.2, 0.25, 0.8));
            }
        }
    }

    // Update error text display
    if let Some(msg) = &error_msg.0 {
        for mut text in &mut error_text_q {
            **text = msg.clone();
        }
    }

    // Basic keyboard input for name (simplified, Bevy text input is complex)
    if keyboard.just_pressed(KeyCode::Backspace) {
        name_res.0.pop();
    }
}
