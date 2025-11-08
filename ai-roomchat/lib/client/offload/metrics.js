// Simple in-memory offload metrics aggregator (client-side only)

const _state = {
  counts: { sandbox: 0, worker: 0, inline: 0, skipped: 0 },
  durations: {
    sandbox: { n: 0, sum: 0 },
    worker: { n: 0, sum: 0 },
    inline: { n: 0, sum: 0 },
  },
  reasons: {}, // skip reasons counts
};

export function recordRun({ method, durationMs }) {
  if (!method) return;
  const m = String(method);
  if (_state.counts[m] == null) _state.counts[m] = 0;
  _state.counts[m] += 1;
  if (Number.isFinite(durationMs)) {
    if (!_state.durations[m]) _state.durations[m] = { n: 0, sum: 0 };
    _state.durations[m].n += 1;
    _state.durations[m].sum += durationMs;
  }
}

export function recordSkip(reason) {
  _state.counts.skipped += 1;
  const r = reason ? String(reason) : 'unknown';
  if (!_state.reasons[r]) _state.reasons[r] = 0;
  _state.reasons[r] += 1;
}

export function getMetricsSnapshot() {
  const avg = {};
  for (const k of Object.keys(_state.durations)) {
    const { n, sum } = _state.durations[k];
    avg[k] = n > 0 ? Math.round((sum / n) * 10) / 10 : 0;
  }
  return {
    counts: { ..._state.counts },
    avgDurationMs: avg,
    reasons: { ..._state.reasons },
  };
}

export function resetMetrics() {
  _state.counts = { sandbox: 0, worker: 0, inline: 0, skipped: 0 };
  _state.durations = {
    sandbox: { n: 0, sum: 0 },
    worker: { n: 0, sum: 0 },
    inline: { n: 0, sum: 0 },
  };
  _state.reasons = {};
}
