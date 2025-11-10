// Gamepad Input Adapter

export function attachGamepad(onAction, options = {}) {
  const deadzone = Number(options.deadzone || 0.2);
  let rafId = 0;
  function poll(){
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      // Simple mapping: axes to move, buttons[0] confirm
      const [axX = 0, axY = 0] = gp.axes || [];
      if (Math.abs(axX) > deadzone) onAction({ type: axX > 0 ? 'move_right' : 'move_left' });
      if (Math.abs(axY) > deadzone) onAction({ type: axY > 0 ? 'move_down' : 'move_up' });
      if (gp.buttons && gp.buttons[0] && gp.buttons[0].pressed) onAction({ type: 'confirm' });
    }
    rafId = requestAnimationFrame(poll);
  }
  rafId = requestAnimationFrame(poll);
  return { dispose(){ cancelAnimationFrame(rafId); } };
}

