'use client';

export function formatPlayNumber(value) {
  if (value == null) return '—';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('ko-KR');
  }
  return String(value);
}

export function formatPlayWinRate(summaryOrValue) {
  if (summaryOrValue == null) return '—';
  if (typeof summaryOrValue === 'number' && Number.isFinite(summaryOrValue)) {
    const normalized = summaryOrValue <= 1 ? summaryOrValue * 100 : summaryOrValue;
    const rounded = Number.isInteger(normalized) ? normalized : Number(normalized.toFixed(1));
    return `${rounded}%`;
  }
  if (typeof summaryOrValue === 'object' && summaryOrValue.rate != null) {
    return `${summaryOrValue.rate}%`;
  }
  return '—';
}

export function formatWinRateValue(value) {
  if (!Number.isFinite(value)) return '—';
  const normalized = value <= 1 ? value * 100 : value;
  const rounded = Number.isInteger(normalized) ? normalized : Number(normalized.toFixed(1));
  return `${rounded}%`;
}
