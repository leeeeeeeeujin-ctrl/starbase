# Network Adapters

Goal: let users bring their own realtime server (Colyseus, Socket.IO, custom WS) without touching core UI.

Factory: `lib/game/network/types.js` → `createNetworkAdapter(impl)`

Methods
- Required: `connect({ url, token, roomId })`, `send(type, payload)`, `disconnect()`
- Optional callbacks: `onMessage(cb)`, `onState(cb)`, `onPlayers(cb)`, `onError(cb)`

Suggested protocol
- client→server: `join`, `input`, `cmd`, `chat`
- server→client: `state`, `patch`, `event`, `chat`, `players`

In‑game chat bridge
- `components/game/chat/InGameChatProvider.jsx` listens for `type="chat"` and routes to channels (`party`, `ai`).
- These channels are session‑scoped and never indexed in global chat.

Security note
- Do not expose admin endpoints. Use JWT or signed cookies for room auth. Validate message sizes and rate‑limit inputs on server.

