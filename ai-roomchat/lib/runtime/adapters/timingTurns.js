// Turn/Timing manager (skeleton)

export function createTurnTimer({ durations = [30,60,90], onTick = () => {}, onTimeout = () => {} } = {}) {
  let idx = 0; let remain = durations[0] || 30; let timer = 0;
  function start(){ stop(); timer = setInterval(() => { remain -= 1; onTick(remain); if (remain <= 0) { onTimeout(idx); next(); } }, 1000); }
  function next(){ idx = Math.min(idx+1, durations.length-1); remain = durations[idx] || 30; }
  function stop(){ if (timer) { clearInterval(timer); timer = 0; } }
  function dispose(){ stop(); }
  return { start, next, stop, dispose, get remain(){ return remain; }, get index(){ return idx; } };
}

