# UNO Multiplayer Backend (Golang)

I have implemented a Golang backend for your UNO game. This backend handles:
- Room creation and joining.
- Real-time multiplayer via WebSockets.
- Core game logic (shuffling, stacking, special cards, jump-in).
- State synchronization across all players.

## Backend Structure

- `types.go`: Data structures matching your TypeScript types.
- `game.go`: Game rules and helper functions.
- `main.go`: WebSocket server and room management.
- `room_logic.go`: High-level game actions (Start, Play, Draw, Choose Color).

## How to Run

1.  Navigate to the `backend` directory:
    ```bash
    cd backend
    ```
2.  Install dependencies:
    ```bash
    go mod tidy
    ```
3.  Start the server:
    ```bash
    go run .
    ```
    The server will start on `localhost:8080`.

## Connecting the Frontend

To switch your frontend from local-first to multiplayer, you'll need to modify `App.tsx`:

### 1. Initialize WebSocket

```typescript
useEffect(() => {
  const socket = new WebSocket('ws://localhost:8080/ws');
  
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'UPDATE_STATE') {
      setGameState(message.payload.state);
    }
  };

  setWs(socket);
  return () => socket.close();
}, []);
```

### 2. Replace Local Actions with Socket Sends

Instead of calling `setGameState` directly, send messages:

```typescript
// CREATE_ROOM
ws.send(JSON.stringify({
  type: 'CREATE_ROOM',
  payload: { playerName }
}));

// PLAY_CARD
ws.send(JSON.stringify({
  type: 'PLAY_CARD',
  payload: { cardId }
}));
```

### 3. Update State Handling

Since the server now manages the state, most of your `useEffect` hooks for AI and timers should be moved to the server (or synchronized). The backend I implemented handles the core play/draw flow.
