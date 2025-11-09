# In‑Game Chat (Session‑Scoped)

Components
- Provider: `components/game/chat/InGameChatProvider.jsx`
- Overlay: `components/game/chat/InGameChatOverlay.jsx` (render per channel)

Channels
- `party`: visible to session participants
- `ai`: system/AI messages for gameplay progression

Guarantees
- Not indexed by global chat and intended only for the active game session.

Usage
```jsx
import { InGameChatProvider } from "../../components/game/chat/InGameChatProvider.jsx";
import InGameChatOverlay from "../../components/game/chat/InGameChatOverlay.jsx";

export default function GameShell({ children, sessionId, gameId, network, user, character }) {
  return (
    <InGameChatProvider sessionId={sessionId} gameId={gameId} networkAdapter={network} currentUser={user}>
      {children}
      <InGameChatOverlay channel="ai" />
      <InGameChatOverlay channel="party" />
    </InGameChatProvider>
  );
}
```

Network bridge
- If a `networkAdapter` is provided, `send('chat', { channel, msg })` is called, and incoming `onMessage('chat', payload)` is consumed.

