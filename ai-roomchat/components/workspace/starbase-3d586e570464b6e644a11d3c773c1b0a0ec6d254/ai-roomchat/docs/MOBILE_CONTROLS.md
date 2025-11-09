# Mobile Controls

Component
- `components/game/controls/VirtualControls.jsx`
- D‑pad (Arrow keys) + actions (Space, KeyX) emitted as `onInput({ type: 'keydown'|'keyup', key })`

Usage (overlay in a slot/container)
```jsx
import VirtualControls from "../../components/game/controls/VirtualControls.jsx";
<div style={{ position:'relative', width:'100%', height:'100%' }}>
  {/* ... your GameCanvasSlot here ... */}
  <VirtualControls onInput={(ev) => adapter?.onInput?.(ev)} />
<\/div>
```

Notes
- Pointer events are captured; keys mirror desktop mapping (ArrowUp/Down/Left/Right, Space, KeyX).
- Style/positions can be customized or hidden on desktop via CSS.

