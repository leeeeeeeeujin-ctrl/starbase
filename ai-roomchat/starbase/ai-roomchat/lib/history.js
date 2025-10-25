// lib/history.js
// 세션별 히스토리를 저장하면서 슬롯별 가시성과 AI 메모리를 함께 관리합니다.

function normalizeSlots({ audience, slots, slotIndex }) {
  if (audience !== 'slots') return [];

  if (Array.isArray(slots)) {
    return Array.from(
      new Set(
        slots.map(value => Number(value)).filter(value => Number.isFinite(value) && value >= 0)
      )
    );
  }

  const parsed = Number(slotIndex);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return [parsed];
  }

  return [];
}

export function createAiHistory() {
  const rows = [];

  function beginSession() {
    rows.length = 0;
  }

  function push({
    role,
    content,
    public: pub = false,
    includeInAi = true,
    audience = 'all',
    slots = [],
    slotIndex = null,
    meta = {},
  }) {
    const entry = {
      role: role || 'assistant',
      content: String(content || ''),
      public: !!pub,
      includeInAi: includeInAi !== false,
      audience: audience === 'slots' ? 'slots' : 'all',
      slots: normalizeSlots({ audience, slots, slotIndex }),
      meta: meta && typeof meta === 'object' ? { ...meta } : {},
    };

    rows.push(entry);
    return entry;
  }

  function joinedText({ onlyPublic = false, last = null } = {}) {
    let source = rows;
    if (onlyPublic) {
      source = source.filter(entry => entry.public);
    }
    if (typeof last === 'number' && last > 0) {
      source = source.slice(-last);
    }
    return source.map(entry => entry.content).join('\n');
  }

  function getAll() {
    return rows.map((entry, index) => ({ ...entry, index }));
  }

  function getAiMemory({ last = null } = {}) {
    let source = rows.filter(entry => entry.includeInAi);
    if (typeof last === 'number' && last > 0) {
      source = source.slice(-last);
    }
    return source.map((entry, index) => ({ ...entry, index }));
  }

  function getVisibleForSlot(slot, { onlyPublic = true, last = null } = {}) {
    const target = Number(slot);
    if (!Number.isFinite(target) || target < 0) {
      return [];
    }

    let source = rows.filter(entry => {
      if (entry.audience === 'all') {
        return onlyPublic ? entry.public : true;
      }
      if (entry.audience === 'slots') {
        const visible = entry.slots.includes(target);
        if (!visible) return false;
        return onlyPublic ? entry.public : true;
      }
      return false;
    });

    if (typeof last === 'number' && last > 0) {
      source = source.slice(-last);
    }

    return source.map((entry, index) => ({ ...entry, index }));
  }

  return { beginSession, push, joinedText, getAll, getAiMemory, getVisibleForSlot };
}
