// Keyboard Input Adapter (contract skeleton)

/**
 * @typedef {{
 *  dispose?: ()=>void,
 * }} KeyboardAdapter
 */

/**
 * Map keyboard events to onAction callback.
 * @param {(action: { type:string, payload?:any })=>void} onAction
 * @param {{ map?: Record<string,string> }} [options]
 * @returns {KeyboardAdapter}
 */
export function attachKeyboard(onAction, options = {}) {
  const map = Object.assign({
    ArrowUp: 'move_up', ArrowDown: 'move_down', ArrowLeft: 'move_left', ArrowRight: 'move_right',
    Enter: 'confirm', Escape: 'cancel',
  }, options.map || {});
  const handler = (e) => {
    const act = map[e.key];
    if (act) { e.preventDefault(); onAction({ type: act }); }
  };
  window.addEventListener('keydown', handler);
  return { dispose(){ window.removeEventListener('keydown', handler); } };
}

