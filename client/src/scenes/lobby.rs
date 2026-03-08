use bevy::prelude::*;
use crate::{PlayerName, RoomCodeInput, ErrorMessage};
use crate::network::{NetworkChannels, send_command};
use crate::protocol::RoomInfo;

#[derive(Component)]
pub struct LobbyUI;

#[derive(Component)]
pub struct CreateBtn;

#[derive(Component)]
pub struct JoinBtn;

#[derive(Component)]
pub struct RefreshBtn;

#[derive(Component)]
pub struct NameInput;

#[derive(Component)]
pub struct RoomInput;

#[derive(Component)]
pub struct NameText;

#[derive(Component)]
pub struct RoomText;

#[derive(Component)]
pub struct RoomListText;

#[derive(Component)]
pub struct ErrorText;

#[derive(Resource, Default)]
pub struct ActiveInput(pub i32); // 0 = Name, 1 = Room

pub fn setup_lobby(mut commands: Commands) {
    commands.insert_resource(ActiveInput(0)); // Default to Name
    
    commands.spawn((
        LobbyUI,
        Node {
            width: Val::Percent(100.0), height: Val::Percent(100.0),
            flex_direction: FlexDirection::Row,
            justify_content: JustifyContent::Center,
            align_items: AlignItems::Center,
            ..default()
        },
    )).with_children(|parent| {
        // Left: Logo
        parent.spawn(Node {
            width: Val::Percent(45.0), height: Val::Percent(100.0),
            justify_content: JustifyContent::Center,
            align_items: AlignItems::Center,
            flex_direction: FlexDirection::Column,
            row_gap: Val::Px(20.0),
            ..default()
        }).with_children(|logo_area| {
            logo_area.spawn((Text::new("职场大逃杀"), TextFont { font_size: 70.0, ..default() }, TextColor(Color::srgb(0.9, 0.4, 0.4))));
            logo_area.spawn((Text::new("KPI 突围"), TextFont { font_size: 50.0, ..default() }, TextColor(Color::srgb(0.8, 0.7, 0.2))));
        });

        // Right: Panel
        parent.spawn((
            Node {
                width: Val::Px(480.0), min_height: Val::Px(600.0),
                flex_direction: FlexDirection::Column,
                padding: UiRect::all(Val::Px(30.0)),
                row_gap: Val::Px(15.0),
                ..default()
            },
            BackgroundColor(Color::srgba(0.12, 0.12, 0.16, 0.7)),
            BorderRadius::all(Val::Px(20.0)),
        )).with_children(|panel| {
            // Error text at top
            panel.spawn((ErrorText, Text::new(""), TextFont { font_size: 14.0, ..default() }, TextColor(Color::srgb(1.0, 0.3, 0.3))));

            panel.spawn((Text::new("打工人花名"), TextFont { font_size: 14.0, ..default() }, TextColor(Color::WHITE)));
            panel.spawn((
                NameInput, Button, // <== ADDED BUTTON TO MAKE IT CLICKABLE
                Node { width: Val::Percent(100.0), height: Val::Px(50.0), padding: UiRect::all(Val::Px(12.0)), border: UiRect::all(Val::Px(2.0)), ..default() },
                BackgroundColor(Color::srgba(0.05, 0.05, 0.07, 0.8)),
                BorderColor(Color::srgb(0.3, 0.3, 0.3)),
            )).with_children(|i| {
                i.spawn((NameText, Text::new("输入由纯拼音字母构成的全拼..."), TextColor(Color::WHITE)));
            });

            // Room logic
            panel.spawn(Node { justify_content: JustifyContent::SpaceBetween, width: Val::Percent(100.0), ..default() }).with_children(|row| {
                row.spawn((Text::new("当前内推机会 (大厅房间)"), TextColor(Color::WHITE)));
                row.spawn((RefreshBtn, Button, Node { padding: UiRect::all(Val::Px(5.0)), ..default() }, BackgroundColor(Color::srgb(0.3, 0.3, 0.3))))
                    .with_children(|b| { b.spawn((Text::new(" 刷 新 "), TextColor(Color::WHITE))); });
            });

            panel.spawn((
                Node { width: Val::Percent(100.0), min_height: Val::Px(100.0), padding: UiRect::all(Val::Px(10.0)), ..default() },
                BackgroundColor(Color::srgba(0.0, 0.0, 0.0, 0.3)),
            )).with_children(|l| {
                l.spawn((RoomListText, Text::new("暂无房间\n可直接输入拼音代码加入或新建..."), TextColor(Color::srgb(0.5, 0.5, 0.5))));
            });

            panel.spawn((Text::new("通过直推加入 (输入房间代码)"), TextColor(Color::WHITE)));
            panel.spawn(Node { flex_direction: FlexDirection::Row, column_gap: Val::Px(10.0), ..default() }).with_children(|row| {
                row.spawn((
                    RoomInput, Button, // <== ADDED BUTTON TO MAKE IT CLICKABLE
                    Node { width: Val::Percent(70.0), height: Val::Px(45.0), padding: UiRect::all(Val::Px(10.0)), border: UiRect::all(Val::Px(2.0)), ..default() },
                    BackgroundColor(Color::srgba(0.05, 0.05, 0.07, 0.8)),
                    BorderColor(Color::srgb(0.3, 0.3, 0.3)),
                )).with_children(|i| { i.spawn((RoomText, Text::new("代码..."), TextColor(Color::WHITE))); });

                row.spawn((JoinBtn, Button, Node { width: Val::Percent(30.0), justify_content: JustifyContent::Center, align_items: AlignItems::Center, ..default() }, BackgroundColor(Color::srgb(0.2, 0.4, 0.8))))
                    .with_children(|b| { b.spawn((Text::new("入 职"), TextColor(Color::WHITE))); });
            });

            panel.spawn((CreateBtn, Button, Node { width: Val::Percent(100.0), height: Val::Px(50.0), justify_content: JustifyContent::Center, align_items: AlignItems::Center, margin: UiRect::top(Val::Px(10.0)), ..default() }, BackgroundColor(Color::srgb(0.8, 0.3, 0.2))))
                .with_children(|b| { b.spawn((Text::new("成立新部门 (创建房间)"), TextColor(Color::WHITE), TextFont { font_size: 16.0, ..default() })); });
        });
    });
}

pub fn cleanup_lobby(mut commands: Commands, q: Query<Entity, With<LobbyUI>>) {
    for e in &q { commands.entity(e).despawn_recursive(); }
    commands.remove_resource::<ActiveInput>();
}

pub fn lobby_ui(
    channels: Option<Res<NetworkChannels>>,
    mut create_q: Query<(&Interaction, &mut BackgroundColor), (Changed<Interaction>, With<CreateBtn>)>,
    mut join_q: Query<(&Interaction, &mut BackgroundColor), (Changed<Interaction>, With<JoinBtn>, Without<CreateBtn>)>,
    mut refresh_q: Query<(&Interaction, &mut BackgroundColor), (Changed<Interaction>, With<RefreshBtn>, Without<CreateBtn>, Without<JoinBtn>)>,
    mut name_input_q: Query<(&Interaction, &mut BorderColor), (Changed<Interaction>, With<NameInput>)>,
    mut room_input_q: Query<(&Interaction, &mut BorderColor), (Changed<Interaction>, With<RoomInput>, Without<NameInput>)>,
    
    mut active_input: ResMut<ActiveInput>,
    mut name_res: ResMut<PlayerName>,
    mut room_code: ResMut<RoomCodeInput>,
    
    mut name_text_q: Query<&mut Text, With<NameText>>,
    mut room_text_q: Query<&mut Text, (With<RoomText>, Without<NameText>)>,
    mut room_list_text_q: Query<&mut Text, (With<RoomListText>, Without<NameText>, Without<RoomText>)>,
    mut error_text_q: Query<&mut Text, (With<ErrorText>, Without<NameText>, Without<RoomText>, Without<RoomListText>)>,
    
    mut error_msg: ResMut<ErrorMessage>,
    room_list: Res<crate::RoomListRes>,
    keyboard: Res<ButtonInput<KeyCode>>,
) {
    let Some(channels) = channels else { return };

    // Update Input Focus
    for (interaction, _) in &name_input_q {
        if *interaction == Interaction::Pressed { active_input.0 = 0; }
    }
    for (interaction, _) in &room_input_q {
        if *interaction == Interaction::Pressed { active_input.0 = 1; }
    }

    // Keyboard Typin
    if keyboard.just_pressed(KeyCode::Backspace) {
        if active_input.0 == 0 { name_res.0.pop(); }
        else { room_code.0.pop(); }
    }
    
    for k in keyboard.get_just_pressed() {
        let key_chars = vec![
            (KeyCode::KeyA, 'A'), (KeyCode::KeyB, 'B'), (KeyCode::KeyC, 'C'), (KeyCode::KeyD, 'D'),
            (KeyCode::KeyE, 'E'), (KeyCode::KeyF, 'F'), (KeyCode::KeyG, 'G'), (KeyCode::KeyH, 'H'),
            (KeyCode::KeyI, 'I'), (KeyCode::KeyJ, 'J'), (KeyCode::KeyK, 'K'), (KeyCode::KeyL, 'L'),
            (KeyCode::KeyM, 'M'), (KeyCode::KeyN, 'N'), (KeyCode::KeyO, 'O'), (KeyCode::KeyP, 'P'),
            (KeyCode::KeyQ, 'Q'), (KeyCode::KeyR, 'R'), (KeyCode::KeyS, 'S'), (KeyCode::KeyT, 'T'),
            (KeyCode::KeyU, 'U'), (KeyCode::KeyV, 'V'), (KeyCode::KeyW, 'W'), (KeyCode::KeyX, 'X'),
            (KeyCode::KeyY, 'Y'), (KeyCode::KeyZ, 'Z'),
            (KeyCode::Digit0, '0'), (KeyCode::Digit1, '1'), (KeyCode::Digit2, '2'), (KeyCode::Digit3, '3'),
            (KeyCode::Digit4, '4'), (KeyCode::Digit5, '5'), (KeyCode::Digit6, '6'), (KeyCode::Digit7, '7'),
            (KeyCode::Digit8, '8'), (KeyCode::Digit9, '9'),
        ];
        for (code, ch) in key_chars {
            if *k == code {
                if active_input.0 == 0 { name_res.0.push(ch); }
                else { room_code.0.push(ch); }
            }
        }
    }

    // Render Text
    if let Ok(mut text) = name_text_q.get_single_mut() {
        let cursor = if active_input.0 == 0 { "|" } else { "" };
        let content = if name_res.0.is_empty() { String::from("输入拼音/字母(仅限英文)...") } else { name_res.0.clone() };
        **text = format!("{}{}", content, cursor);
    }
    if let Ok(mut text) = room_text_q.get_single_mut() {
        let cursor = if active_input.0 == 1 { "|" } else { "" };
        let content = if room_code.0.is_empty() { String::from("点击此处输入代码...") } else { room_code.0.clone() };
        **text = format!("{}{}", content, cursor);
    }

    // Render Room List
    if let Ok(mut text) = room_list_text_q.get_single_mut() {
        if room_list.0.is_empty() {
            **text = String::from("暂无公开部门。\n你可以通过建立新部门来创造就业机会。");
        } else {
            let mut list_str = String::from("当前面试机会:\n");
            for r in &room_list.0 {
                let status = r.status.as_deref().unwrap_or("未知");
                let host = r.host_name.as_deref().unwrap_or("匿名HR");
                list_str.push_str(&format!("🔹[{}]{}的部门 ({}人) - {}\n", r.code, host, r.player_count, status));
            }
            **text = list_str;
        }
    }

    // Render Errors
    if let Some(msg) = &error_msg.0 {
        if let Ok(mut text) = error_text_q.get_single_mut() { **text = msg.clone(); }
    }

    // Handle Button Clicks
    for (interaction, mut bg) in &mut create_q {
        match *interaction {
            Interaction::Pressed => {
                let name = name_res.0.trim();
                if name.is_empty() { error_msg.0 = Some("必须有名字才能打工".into()); }
                else { send_command(&channels, "CREATE_ROOM", serde_json::json!({ "playerName": name })); }
            }
            Interaction::Hovered => *bg = BackgroundColor(Color::srgb(0.9, 0.4, 0.3)),
            Interaction::None => *bg = BackgroundColor(Color::srgb(0.8, 0.3, 0.2)),
        }
    }

    for (interaction, mut bg) in &mut join_q {
        match *interaction {
            Interaction::Pressed => {
                let name = name_res.0.trim();
                let code = room_code.0.trim();
                if name.is_empty() || code.is_empty() { error_msg.0 = Some("名字和房间代码不能为空!".into()); }
                else { send_command(&channels, "JOIN_ROOM", serde_json::json!({ "playerName": name, "roomCode": code })); }
            }
            Interaction::Hovered => *bg = BackgroundColor(Color::srgb(0.3, 0.5, 0.9)),
            Interaction::None => *bg = BackgroundColor(Color::srgb(0.2, 0.4, 0.8)),
        }
    }

    for (interaction, mut bg) in &mut refresh_q {
        match *interaction {
            Interaction::Pressed => { send_command(&channels, "GET_ROOM_LIST", serde_json::Value::Null); }
            Interaction::Hovered => *bg = BackgroundColor(Color::srgb(0.4, 0.4, 0.4)),
            Interaction::None => *bg = BackgroundColor(Color::srgb(0.3, 0.3, 0.3)),
        }
    }
}
