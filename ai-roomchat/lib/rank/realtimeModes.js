export const REALTIME_MODES = {
  OFF: 'off',
  STANDARD: 'standard',
  PULSE: 'pulse',
};

const PULSE_TOKENS = ['pulse', 'pulse-mode', 'pulse_mode'];
const STANDARD_TOKENS = [
  'true',
  '1',
  'yes',
  'on',
  'standard',
  'live',
  'enabled',
  'enable',
  'realtime',
  'real-time',
  'realtime_only',
  'realtime-only',
];
const OFF_TOKENS = ['false', '0', 'no', 'off', 'disabled', 'disable', 'none'];

function coerceCandidate(value) {
  if (value == null) return null;
  if (typeof value === 'object') {
    if (typeof value.mode !== 'undefined') return value.mode;
    if (typeof value.value !== 'undefined') return value.value;
  }
  return value;
}

export function normalizeRealtimeMode(value) {
  const candidate = coerceCandidate(value);
  if (candidate == null) {
    return REALTIME_MODES.OFF;
  }

  if (typeof candidate === 'boolean') {
    return candidate ? REALTIME_MODES.STANDARD : REALTIME_MODES.OFF;
  }

  if (typeof candidate === 'number') {
    if (!Number.isFinite(candidate)) return REALTIME_MODES.OFF;
    return candidate !== 0 ? REALTIME_MODES.STANDARD : REALTIME_MODES.OFF;
  }

  if (typeof candidate === 'string') {
    const trimmed = candidate.trim().toLowerCase();
    if (!trimmed) return REALTIME_MODES.OFF;
    if (PULSE_TOKENS.includes(trimmed)) return REALTIME_MODES.PULSE;
    if (STANDARD_TOKENS.includes(trimmed)) return REALTIME_MODES.STANDARD;
    if (OFF_TOKENS.includes(trimmed)) return REALTIME_MODES.OFF;
    if (trimmed === REALTIME_MODES.PULSE) return REALTIME_MODES.PULSE;
    if (trimmed === REALTIME_MODES.STANDARD) return REALTIME_MODES.STANDARD;
    if (trimmed === REALTIME_MODES.OFF) return REALTIME_MODES.OFF;
    return REALTIME_MODES.OFF;
  }

  return REALTIME_MODES.OFF;
}

export function isRealtimeEnabled(mode) {
  return normalizeRealtimeMode(mode) !== REALTIME_MODES.OFF;
}

export function isPulseRealtime(mode) {
  return normalizeRealtimeMode(mode) === REALTIME_MODES.PULSE;
}
