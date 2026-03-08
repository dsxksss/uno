use bevy::prelude::*;
use crate::network::{NetworkChannels, send_command};
// use crate::GameStateRes;

#[derive(Component)]
pub struct RoomUI;

#[derive(Component)]
pub struct ReadyBtn;

#[derive(Component)]
pub struct StartBtn;

#[derive(Component)]
pub struct DeptBtn(pub String);

pub fn setup_room(mut commands: Commands) {
    commands.spawn((
        RoomUI,
        Node {
            width: Val::Percent(100.0),
            height: Val::Percent(100.0),
            flex_direction: FlexDirection::Column,
            align_items: AlignItems::Center,
            justify_content: JustifyContent::Center,
            row_gap: Val::Px(20.0),
            ..default()
        },
    )).with_children(|parent| {
        parent.spawn((Text::new("等待会议开始..."), TextFont { font_size: 40.0, ..default() }, TextColor(Color::WHITE)));
        
        parent.spawn((
            Text::new("选择你的部门 (改变终端形态)"), 
            TextColor(Color::srgb(0.8, 0.8, 0.8))
        ));

        parent.spawn(Node { flex_direction: FlexDirection::Row, column_gap: Val::Px(15.0), ..default() }).with_children(|row| {
            let depts = [
                ("dev", "开发部", Color::srgb(0.2, 0.6, 0.8)),
                ("business", "业务部", Color::srgb(0.8, 0.6, 0.2)),
                ("admin", "行政部", Color::srgb(0.2, 0.8, 0.3)),
                ("mgmt", "管理部", Color::srgb(0.6, 0.2, 0.8)),
            ];

            for (id, name, color) in depts {
                row.spawn((
                    DeptBtn(id.to_string()),
                    Button,
                    Node { padding: UiRect::all(Val::Px(15.0)), ..default() },
                    BackgroundColor(color),
                )).with_children(|b| { b.spawn((Text::new(name), TextColor(Color::WHITE))); });
            }
        });

        parent.spawn((ReadyBtn, Button, Node { padding: UiRect::all(Val::Px(15.0)), margin: UiRect::top(Val::Px(30.0)), ..default() }, BackgroundColor(Color::srgb(0.3, 0.8, 0.4))))
            .with_children(|b| { b.spawn((Text::new("准备就绪"), TextColor(Color::WHITE), TextFont { font_size: 24.0, ..default() })); });
            
        parent.spawn((StartBtn, Button, Node { padding: UiRect::all(Val::Px(15.0)), ..default() }, BackgroundColor(Color::srgb(0.8, 0.3, 0.3))))
            .with_children(|b| { b.spawn((Text::new("开始优化 (仅房主)"), TextColor(Color::WHITE), TextFont { font_size: 24.0, ..default() })); });
    });
}

pub fn cleanup_room(mut commands: Commands, q: Query<Entity, With<RoomUI>>) {
    for e in &q { commands.entity(e).despawn_recursive(); }
}

pub fn room_ui(
    channels: Option<Res<NetworkChannels>>,
    mut ready_q: Query<(&Interaction, &mut BackgroundColor), (Changed<Interaction>, With<ReadyBtn>)>,
    mut start_q: Query<(&Interaction, &mut BackgroundColor), (Changed<Interaction>, With<StartBtn>, Without<ReadyBtn>)>,
    dept_q: Query<(&Interaction, &DeptBtn), (Changed<Interaction>,)>,
) {
    let Some(channels) = channels else { return };

    for (inter, _) in &mut ready_q {
        if *inter == Interaction::Pressed { send_command(&channels, "TOGGLE_READY", serde_json::Value::Null); }
    }
    for (inter, _) in &mut start_q {
        if *inter == Interaction::Pressed { send_command(&channels, "START_GAME", serde_json::Value::Null); }
    }
    for (inter, btn) in &dept_q {
        if *inter == Interaction::Pressed {
            send_command(&channels, "SELECT_DEPT", serde_json::json!({ "department": btn.0 }));
        }
    }
}
