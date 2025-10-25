import { normalizeRealtimeMode, REALTIME_MODES } from './realtimeModes';

const DEFAULT_SCORE_MIN = 20;
const DEFAULT_SCORE_MAX = 40;

function normalizeRoleName(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed || '';
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeSlots(slots) {
  if (!Array.isArray(slots)) {
    return { error: '최소 1개의 슬롯을 활성화하고 역할을 지정하세요.' };
  }

  const sanitized = [];
  const slotCountMap = new Map();
  let activeCount = 0;

  slots.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      return;
    }

    const slotIndexRaw = raw.slot_index ?? raw.slotIndex ?? index;
    const slotIndex = Number.isFinite(Number(slotIndexRaw)) ? Number(slotIndexRaw) : index;

    const roleName = normalizeRoleName(raw.role ?? raw.role_name ?? raw.roleName);
    const active = raw.active === false ? false : !!raw.active;

    if (active && roleName) {
      activeCount += 1;
      slotCountMap.set(roleName, (slotCountMap.get(roleName) || 0) + 1);
    }

    sanitized.push({
      slot_index: slotIndex,
      role: roleName,
      active,
    });
  });

  sanitized.sort((a, b) => a.slot_index - b.slot_index);

  if (activeCount === 0) {
    return { error: '최소 1개의 슬롯을 활성화하고 역할을 지정하세요.' };
  }

  return { slots: sanitized, slotCountMap };
}

function sanitizeRole(role, slotCountMap) {
  const baseName = normalizeRoleName(role?.name);
  const name = baseName || '역할';

  const mappedSlotCount = slotCountMap?.get(name);
  const slotCount = Math.max(
    0,
    Math.round(
      toFiniteNumber(
        mappedSlotCount != null ? mappedSlotCount : role?.slot_count,
        mappedSlotCount != null ? mappedSlotCount : 0
      )
    )
  );
  const minScore = Math.max(0, toFiniteNumber(role?.score_delta_min, DEFAULT_SCORE_MIN));
  const maxScore = Math.max(minScore, toFiniteNumber(role?.score_delta_max, DEFAULT_SCORE_MAX));

  return {
    name,
    slot_count: slotCount,
    score_delta_min: minScore,
    score_delta_max: maxScore,
  };
}

function sanitizeRules(rules) {
  if (!rules || typeof rules !== 'object') {
    return null;
  }

  const clone = { ...rules };
  if (clone.brawl_rule === 'allow-brawl') {
    const rawEnd = clone.end_condition_variable;
    const trimmed = typeof rawEnd === 'string' ? rawEnd.trim() : '';
    if (!trimmed) {
      return { error: '난입 허용 시 종료 조건 변수를 입력해야 합니다.' };
    }
    clone.end_condition_variable = trimmed;
  }

  return { value: clone };
}

export function prepareRegistrationPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: '잘못된 요청입니다.' };
  }

  const promptSetId = raw.prompt_set_id;
  if (!promptSetId) {
    return { ok: false, error: '프롬프트 세트를 선택하세요.' };
  }

  const sanitizedRules = sanitizeRules(raw.rules);
  if (sanitizedRules?.error) {
    return { ok: false, error: sanitizedRules.error };
  }

  const sanitizedSlots = sanitizeSlots(raw.slots ?? raw.slot_map);
  if (sanitizedSlots?.error) {
    return { ok: false, error: sanitizedSlots.error };
  }

  const trimmedName = typeof raw.name === 'string' ? raw.name.trim() : '';
  const trimmedDescription = typeof raw.description === 'string' ? raw.description.trim() : '';
  const imageUrl = typeof raw.image_url === 'string' ? raw.image_url : '';
  const realtime = normalizeRealtimeMode(raw.realtime_match ?? REALTIME_MODES.OFF);

  const roleList = Array.isArray(raw.roles) ? raw.roles : [];
  const sanitizedRoles = roleList.map(role => sanitizeRole(role, sanitizedSlots.slotCountMap));

  const roleNameOrder = [];
  const roleNameSet = new Set();
  sanitizedRoles.forEach(role => {
    if (!roleNameSet.has(role.name)) {
      roleNameSet.add(role.name);
      roleNameOrder.push(role.name);
    }
  });

  const rulesPrefix =
    typeof raw.rules_prefix === 'string' && raw.rules_prefix.trim()
      ? raw.rules_prefix.trim()
      : null;

  const gameInsert = {
    name: trimmedName || '새 게임',
    description: trimmedDescription || '',
    image_url: imageUrl,
    prompt_set_id: promptSetId,
    realtime_match: realtime,
    roles: roleNameOrder.length ? roleNameOrder : null,
    rules: sanitizedRules?.value ?? null,
    rules_prefix: rulesPrefix,
  };

  return {
    ok: true,
    game: gameInsert,
    roles: sanitizedRoles,
    slots: sanitizedSlots.slots,
  };
}
