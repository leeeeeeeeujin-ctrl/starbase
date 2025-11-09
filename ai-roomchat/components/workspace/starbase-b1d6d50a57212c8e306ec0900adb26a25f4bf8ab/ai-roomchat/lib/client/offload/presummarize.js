// Lightweight client-side pre-summarization to reduce model context size.
// Heuristics only; safe to prepend to system prompt and reduce history length.

function clamp(n, min, max){
  return Math.max(min, Math.min(max, n));
}

export function presummarizeHistory(historyArray, { maxChars = 800, maxItems = 24 } = {}) {
  const items = Array.isArray(historyArray) ? historyArray.slice(-maxItems) : [];
  if (items.length === 0) return { summaryText: '' };

  // Collapse consecutive same-role, trim, and elide long lines
  const lines = [];
  let lastRole = null;
  for (const it of items) {
    const role = (it.role || 'user').toLowerCase();
    let content = String(it.content || '').trim();
    if (!content) continue;
    // Keep first line, collapse whitespace
    content = content.replace(/\s+/g, ' ').slice(0, 240);
    if (role === lastRole && lines.length) {
      // append short continuation
      const prev = lines.pop();
      const merged = prev + ' | ' + content;
      lines.push(merged);
    } else {
      lines.push(`${role}: ${content}`);
      lastRole = role;
    }
  }

  // Greedy pack into maxChars
  const out = [];
  let used = 0;
  for (const ln of lines) {
    const need = ln.length + 1;
    if (used + need > maxChars) break;
    out.push(ln);
    used += need;
  }
  const summaryText = out.join('\n');
  return { summaryText };
}
