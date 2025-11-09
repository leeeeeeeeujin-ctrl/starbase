// Web Worker fallback runner for rule simulation using an inline Blob.

function buildWorkerSource() {
  return `
    self.onmessage = function(e){
      try {
        const data = e.data || {}; 
        if (data && data.cmd === 'ruleSim.run') {
          const state = data.state || {}; 
          const units = Array.isArray(state.units) ? state.units : [];
          let seed = 0; 
          const seedStr = String(state.sessionId || 'seed');
          for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
          function rand(){ seed = (seed * 1664525 + 1013904223) >>> 0; return (seed & 0xffff) / 0xffff; }
          let scoreA = 0, scoreB = 0; 
          for (const u of units){
            const atk = Number(u && u.attack) || 0; 
            const def = Number(u && u.defense) || 0; 
            const power = (atk + def) * (1 + rand() * 0.05);
            if ((u && u.team) === 'A') scoreA += power; else scoreB += power;
          }
          const winner = scoreA === scoreB ? 'draw' : (scoreA > scoreB ? 'A' : 'B');
          self.postMessage({ ok: true, result: { simulated: true, winner, scoreA: Math.round(scoreA), scoreB: Math.round(scoreB) } });
        } else {
          self.postMessage({ ok: false, error: 'unknown_cmd' });
        }
      } catch (err) {
        self.postMessage({ ok: false, error: String(err && err.message || err) });
      }
    };
  `;
}

export async function runRuleSimInWorker(state, { timeout = 1800 } = {}) {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    throw new Error('worker_unavailable');
  }
  const source = buildWorkerSource();
  const blob = new Blob([source], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { worker.terminate(); } catch {}
      reject(new Error('worker_timeout'));
    }, timeout);

    worker.onmessage = (e) => {
      clearTimeout(timer);
      const data = e.data || {};
      try { worker.terminate(); } catch {}
      if (data.ok) resolve(data.result); else reject(new Error(data.error || 'worker_error'));
    };

    worker.onerror = (err) => {
      clearTimeout(timer);
      try { worker.terminate(); } catch {}
      reject(new Error(String(err && err.message || err)));
    };

    worker.postMessage({ cmd: 'ruleSim.run', state });
  });
}
