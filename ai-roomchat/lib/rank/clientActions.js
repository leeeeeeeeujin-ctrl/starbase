// ai-roomchat/lib/rank/clientActions.js
// Client-side, whitelist-style action runner for local execution in the app.
// Keep these functions small, deterministic, and safe (no network or DB writes).

// Helper: run sync (in main thread)
function _runSync(actionName, { payload = {}, participants = [], actorContext = null } = {}) {
  if (!actionName) return { ok: false, error: 'missing_action' };

  switch (actionName) {
    case 'award_xp': {
      const ownerId = payload?.ownerId || payload?.owner_id || null;
      const amount = Number(payload?.amount ?? payload?.xp ?? 0) || 0;
      if (!ownerId || amount === 0) return { ok: false, error: 'invalid_payload' };

      const updated = Array.isArray(participants)
        ? participants.map(p => {
            try {
              const owner = p?.owner_id || p?.ownerId || p?.owner || null;
              if (owner && String(owner) === String(ownerId)) {
                const meta = { ...(p.meta || {}), xp: (Number(p.meta?.xp) || 0) + amount };
                return { ...p, meta };
              }
              return p;
            } catch (e) {
              return p;
            }
          })
        : participants;

      return { ok: true, changes: { participants: updated }, summary: `Awarded ${amount} XP to ${ownerId}` };
    }

    case 'give_item': {
      // payload: { ownerId, itemId }
      const ownerId = payload?.ownerId || payload?.owner_id || null;
      const itemId = payload?.itemId || payload?.item_id || null;
      if (!ownerId || !itemId) return { ok: false, error: 'invalid_payload' };

      const updated = Array.isArray(participants)
        ? participants.map(p => {
            try {
              const owner = p?.owner_id || p?.ownerId || p?.owner || null;
              if (owner && String(owner) === String(ownerId)) {
                const meta = { ...(p.meta || {}) };
                const items = Array.isArray(meta.items) ? meta.items.slice() : [];
                items.push(String(itemId));
                meta.items = items;
                return { ...p, meta };
              }
              return p;
            } catch (e) {
              return p;
            }
          })
        : participants;

      return { ok: true, changes: { participants: updated }, summary: `Gave item ${itemId} to ${ownerId}` };
    }

    case 'toggle_flag': {
      // payload: { ownerId, flag }
      const ownerId = payload?.ownerId || payload?.owner_id || null;
      const flag = payload?.flag || null;
      if (!ownerId || !flag) return { ok: false, error: 'invalid_payload' };

      const updated = Array.isArray(participants)
        ? participants.map(p => {
            try {
              const owner = p?.owner_id || p?.ownerId || p?.owner || null;
              if (owner && String(owner) === String(ownerId)) {
                const meta = { ...(p.meta || {}) };
                const flags = meta.flags && typeof meta.flags === 'object' ? { ...meta.flags } : {};
                flags[flag] = !Boolean(flags[flag]);
                meta.flags = flags;
                return { ...p, meta };
              }
              return p;
            } catch (e) {
              return p;
            }
          })
        : participants;

      return { ok: true, changes: { participants: updated }, summary: `Toggled ${flag} for ${ownerId}` };
    }

    default:
      return { ok: false, error: 'unknown_action' };
  }
}

// If payload is large or explicitly requested, run inside a transient WebWorker to avoid blocking UI.
export async function runClientAction(actionName, { payload = {}, participants = [], actorContext = null } = {}) {
  try {
    const payloadStr = JSON.stringify(payload || {});
    const useWorker = payload?._useWorker === true || (typeof payloadStr === 'string' && payloadStr.length > 2000);
    if (!useWorker || typeof window === 'undefined' || typeof Worker === 'undefined') {
      return _runSync(actionName, { payload, participants, actorContext });
    }

    // Build a small worker script that supports the same whitelist logic (POC: award_xp)
    const workerSrc = `
      self.onmessage = function(e) {
        try {
          const { actionName, payload, participants } = e.data || {};
          // award_xp
          if (actionName === 'award_xp') {
            const ownerId = payload?.ownerId || payload?.owner_id || null;
            const amount = Number(payload?.amount ?? payload?.xp ?? 0) || 0;
            if (!ownerId || amount === 0) {
              self.postMessage({ ok: false, error: 'invalid_payload' });
              return;
            }
            const updated = Array.isArray(participants)
              ? participants.map(p => {
                  try {
                    const owner = p?.owner_id || p?.ownerId || p?.owner || null;
                    if (owner && String(owner) === String(ownerId)) {
                      const meta = Object.assign({}, (p.meta||{}));
                      meta.xp = (Number(p.meta?.xp) || 0) + amount;
                      return Object.assign({}, p, { meta });
                    }
                    return p;
                  } catch (err) { return p; }
                })
              : participants;
            self.postMessage({ ok: true, changes: { participants: updated }, summary: 'Awarded '+amount+' XP to '+ownerId });
            return;
          }
          // give_item
          if (actionName === 'give_item') {
            const ownerId = payload?.ownerId || payload?.owner_id || null;
            const itemId = payload?.itemId || payload?.item_id || null;
            if (!ownerId || !itemId) { self.postMessage({ ok: false, error: 'invalid_payload' }); return; }
            const updated = Array.isArray(participants)
              ? participants.map(p => {
                  try {
                    const owner = p?.owner_id || p?.ownerId || p?.owner || null;
                    if (owner && String(owner) === String(ownerId)) {
                      const meta = Object.assign({}, (p.meta||{}));
                      const items = Array.isArray(meta.items) ? meta.items.slice() : [];
                      items.push(String(itemId));
                      meta.items = items;
                      return Object.assign({}, p, { meta });
                    }
                    return p;
                  } catch (err) { return p; }
                })
              : participants;
            self.postMessage({ ok: true, changes: { participants: updated }, summary: 'Gave item '+itemId+' to '+ownerId });
            return;
          }
          // toggle_flag
          if (actionName === 'toggle_flag') {
            const ownerId = payload?.ownerId || payload?.owner_id || null;
            const flag = payload?.flag || null;
            if (!ownerId || !flag) { self.postMessage({ ok: false, error: 'invalid_payload' }); return; }
            const updated = Array.isArray(participants)
              ? participants.map(p => {
                  try {
                    const owner = p?.owner_id || p?.ownerId || p?.owner || null;
                    if (owner && String(owner) === String(ownerId)) {
                      const meta = Object.assign({}, (p.meta||{}));
                      const flags = meta.flags && typeof meta.flags === 'object' ? Object.assign({}, meta.flags) : {};
                      flags[flag] = !Boolean(flags[flag]);
                      meta.flags = flags;
                      return Object.assign({}, p, { meta });
                    }
                    return p;
                  } catch (err) { return p; }
                })
              : participants;
            self.postMessage({ ok: true, changes: { participants: updated }, summary: 'Toggled '+flag+' for '+ownerId });
            return;
          }
          self.postMessage({ ok: false, error: 'unknown_action' });
        } catch (err) {
          self.postMessage({ ok: false, error: err?.message || 'worker_error' });
        }
      }`;

    const blob = new Blob([workerSrc], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    return await new Promise(resolve => {
      const timer = setTimeout(() => {
        try { worker.terminate(); } catch (_) {}
        resolve({ ok: false, error: 'worker_timeout' });
      }, 5000);

      worker.onmessage = function(ev) {
        clearTimeout(timer);
        try { worker.terminate(); } catch (_) {}
        resolve(ev.data || { ok: false, error: 'no_data' });
      };

      worker.postMessage({ actionName, payload, participants });
    });
  } catch (err) {
    return { ok: false, error: err?.message || 'client_action_error' };
  }
}

