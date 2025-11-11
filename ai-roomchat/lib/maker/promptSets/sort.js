function safeTimestamp(row) {
  const fallback = row?.created_at || 0;
  const source = row?.updated_at || fallback;
  const time = new Date(source).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function sortPromptSets(rows = []) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const deduped = [];
  const idIndex = new Map();

  rows.forEach(row => {
    if (!row || typeof row !== 'object') return;
    const id = row.id != null ? String(row.id) : null;
    if (id && idIndex.has(id)) {
      const existingIdx = idIndex.get(id);
      const current = deduped[existingIdx];
      deduped[existingIdx] = safeTimestamp(row) >= safeTimestamp(current) ? row : current;
      return;
    }
    const nextIndex = deduped.length;
    if (id) {
      idIndex.set(id, nextIndex);
    }
    deduped.push(row);
  });

  deduped.sort((a, b) => safeTimestamp(b) - safeTimestamp(a));
  return deduped;
}
