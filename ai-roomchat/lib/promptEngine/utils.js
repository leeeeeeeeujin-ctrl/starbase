export function safeStr(value) {
  return value == null ? '' : String(value);
}

export function linesOf(text = '') {
  return String(text || '').split(/\r?\n/);
}

export function lastLines(text = '', count = 1) {
  if (!count || count <= 0) return '';
  const parts = linesOf(text);
  if (parts.length === 0) return '';
  return parts.slice(-count).join('\n');
}
