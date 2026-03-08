use crossbeam_channel::{Receiver, Sender, unbounded};
use bevy::prelude::*;
use crate::protocol::ServerMessage;

// Messages FROM server TO bevy
#[derive(Debug, Clone)]
pub enum NetEvent {
    Connected,
    Message(ServerMessage),
    Disconnected(String),
}

// Messages FROM bevy TO server
#[derive(Debug, Clone)]
pub struct NetCommand {
    pub msg_type: String,
    pub payload: serde_json::Value,
}

#[derive(Resource)]
pub struct NetworkChannels {
    pub event_rx: Receiver<NetEvent>,
    pub command_tx: Sender<NetCommand>,
}

#[derive(Resource, Default)]
pub struct LocalClientId(pub Option<String>);

pub fn spawn_ws_thread(server_url: String) -> NetworkChannels {
    let (event_tx, event_rx) = unbounded::<NetEvent>();
    let (command_tx, command_rx) = unbounded::<NetCommand>();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        rt.block_on(async move {
            ws_loop(server_url, event_tx, command_rx).await;
        });
    });

    NetworkChannels {
        event_rx,
        command_tx,
    }
}

async fn ws_loop(
    url: String,
    event_tx: Sender<NetEvent>,
    command_rx: Receiver<NetCommand>,
) {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::connect_async;

    let connect_result = connect_async(&url).await;
    let (ws_stream, _) = match connect_result {
        Ok(v) => v,
        Err(e) => {
            let _ = event_tx.send(NetEvent::Disconnected(format!("Connect failed: {e}")));
            return;
        }
    };

    let _ = event_tx.send(NetEvent::Connected);
    let (mut write, mut read) = ws_stream.split();

    // Spawn reader
    let event_tx2 = event_tx.clone();
    let reader = tokio::spawn(async move {
        while let Some(msg) = read.next().await {
            match msg {
                Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                    if let Ok(server_msg) = serde_json::from_str::<ServerMessage>(&text) {
                        let _ = event_tx2.send(NetEvent::Message(server_msg));
                    }
                }
                Err(e) => {
                    let _ = event_tx2.send(NetEvent::Disconnected(format!("{e}")));
                    break;
                }
                _ => {}
            }
        }
    });

    // Spawn writer
    let writer = tokio::spawn(async move {
        loop {
            match command_rx.try_recv() {
                Ok(cmd) => {
                    let msg = ServerMessage {
                        msg_type: cmd.msg_type,
                        payload: cmd.payload,
                    };
                    if let Ok(json) = serde_json::to_string(&msg) {
                        let ws_msg = tokio_tungstenite::tungstenite::Message::Text(json.into());
                        if write.send(ws_msg).await.is_err() {
                            break;
                        }
                    }
                }
                Err(crossbeam_channel::TryRecvError::Empty) => {
                    tokio::time::sleep(std::time::Duration::from_millis(16)).await;
                }
                Err(crossbeam_channel::TryRecvError::Disconnected) => break,
            }
        }
    });

    let _ = tokio::join!(reader, writer);
    let _ = event_tx.send(NetEvent::Disconnected("Connection closed".into()));
}

// Bevy system: poll network events each frame
pub fn poll_network_events(
    channels: Option<Res<NetworkChannels>>,
    mut client_id: ResMut<LocalClientId>,
    mut game_state: ResMut<crate::GameStateRes>,
    mut room_list: ResMut<crate::RoomListRes>,
    mut app_state: ResMut<NextState<crate::AppState>>,
    mut error_msg: ResMut<crate::ErrorMessage>,
) {
    let Some(channels) = channels else { return };

    while let Ok(event) = channels.event_rx.try_recv() {
        match event {
            NetEvent::Connected => {
                info!("WebSocket connected!");
            }
            NetEvent::Message(msg) => {
                match msg.msg_type.as_str() {
                    "INIT" => {
                        if let Ok(init) = serde_json::from_value::<crate::protocol::InitPayload>(msg.payload) {
                            info!("Got client ID: {}", init.id);
                            client_id.0 = Some(init.id);
                            // Request room list
                            let _ = channels.command_tx.send(NetCommand {
                                msg_type: "GET_ROOM_LIST".into(),
                                payload: serde_json::Value::Null,
                            });
                        }
                    }
                    "UPDATE_STATE" => {
                        if let Ok(sp) = serde_json::from_value::<crate::protocol::StatePayload>(msg.payload) {
                            let status = sp.state.status.clone();
                            game_state.0 = Some(sp.state);
                            // Auto-switch scenes based on status
                            match status.as_str() {
                                "lobby" => { app_state.set(crate::AppState::Room); }
                                "playing" => { app_state.set(crate::AppState::InGame); }
                                "ended" => { app_state.set(crate::AppState::GameOver); }
                                _ => {}
                            }
                        }
                    }
                    "ROOM_LIST" => {
                        if let Ok(rl) = serde_json::from_value::<crate::protocol::RoomListPayload>(msg.payload) {
                            room_list.0 = rl.rooms;
                        }
                    }
                    "ERROR" => {
                        if let Ok(ep) = serde_json::from_value::<crate::protocol::ErrorPayload>(msg.payload) {
                            error_msg.0 = Some(ep.message);
                        }
                    }
                    _ => {
                        info!("Unhandled message: {}", msg.msg_type);
                    }
                }
            }
            NetEvent::Disconnected(reason) => {
                warn!("Disconnected: {reason}");
            }
        }
    }
}

pub fn send_command(channels: &NetworkChannels, msg_type: &str, payload: serde_json::Value) {
    let _ = channels.command_tx.send(NetCommand {
        msg_type: msg_type.to_string(),
        payload,
    });
}
