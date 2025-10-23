import { sanitizeVariableRules, VARIABLE_RULES_VERSION } from '../../../../lib/variableRules';

function extractVersion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const parsed = Number(raw.version);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasRuleEntries(raw) {
  if (!raw) return false;
  if (Array.isArray(raw)) {
    return raw.length > 0;
  }
  if (typeof raw === 'object') {
    if (Array.isArray(raw.auto) && raw.auto.length) return true;
    if (Array.isArray(raw.manual) && raw.manual.length) return true;
    if (Array.isArray(raw.active) && raw.active.length) return true;
  }
  return false;
}

const COMPARATOR_LABEL = { gte: '이상', lte: '이하', eq: '정확히' };
const OUTCOME_LABEL = { win: '승리', lose: '패배', draw: '무승부' };
const STATUS_LABEL = { alive: '생존', dead: '탈락', won: '승리', lost: '패배' };

function formatAutoInstruction(rule) {
  const name = String(rule?.variable || '').trim();
  if (!name) return null;

  const comparator = COMPARATOR_LABEL[rule?.comparator] || COMPARATOR_LABEL.gte;
  const count = Number.isFinite(Number(rule?.count)) ? Number(rule.count) : 1;
  const outcome = OUTCOME_LABEL[rule?.outcome] || OUTCOME_LABEL.win;

  if (rule?.status === 'flag_on') {
    const flagName = String(rule?.flag || '').trim();
    if (!flagName) return null;
    return `변수 ${flagName}가 활성화되면 응답 마지막 줄을 "${outcome}"로 선언하라.`;
  }

  const subject = rule?.subject;
  let subjectText = '지정한 역할';
  if (subject === 'same') subjectText = '같은 편 역할';
  else if (subject === 'other') subjectText = '상대편 역할';
  else if (subject === 'specific' && rule?.role) subjectText = `${rule.role} 역할`;

  const statusText = STATUS_LABEL[rule?.status] || STATUS_LABEL.alive;

  return `${subjectText} 중 ${statusText} 상태인 인원이 ${count}명${comparator}이면 응답 마지막 줄을 "${outcome}"로 선언하라.`;
}

function convertScopeRules(
  rawRules,
  { scopeLabel = '전역', slotLabel = null, warnings = [] } = {}
) {
  const sanitized = sanitizeVariableRules(rawRules);
  const sourceVersion = extractVersion(rawRules);
  const legacyStructure = Array.isArray(rawRules);
  const hadEntries = hasRuleEntries(rawRules);

  if (hadEntries) {
    const slotPrefix = slotLabel ? `슬롯 ${slotLabel} ` : '';
    if (sourceVersion == null && legacyStructure) {
      warnings.push(
        `${slotPrefix}${scopeLabel} 변수 규칙이 구버전 형식이라 안전한 기본 파서로 불러왔습니다. 제작기에서 세트를 다시 저장해 주세요.`
      );
    } else if (sourceVersion != null && sourceVersion !== VARIABLE_RULES_VERSION) {
      warnings.push(
        `${slotPrefix}${scopeLabel} 변수 규칙 버전(${sourceVersion})이 최신(${VARIABLE_RULES_VERSION})과 달라 안전한 기본값으로 복원했습니다. 제작기에서 세트를 다시 저장해 주세요.`
      );
    }
  }

  const manual = [];
  const active = [];

  for (const rule of sanitized.manual) {
    const name = String(rule.variable || '').trim();
    if (!name) continue;
    manual.push({ name, instruction: rule.condition || '' });
  }

  for (const rule of sanitized.auto) {
    const name = String(rule.variable || '').trim();
    if (!name) continue;
    const instruction = formatAutoInstruction(rule);
    if (instruction) {
      manual.push({ name, instruction });
    }
  }

  for (const rule of sanitized.active) {
    const directive = String(rule.directive || '').trim();
    if (!directive) continue;
    const entry = { directive };
    if (rule.condition) entry.condition = rule.condition;
    if (rule.variable) entry.name = rule.variable;
    active.push(entry);
  }

  return { manual, active };
}

export function createNodeFromSlot(slot) {
  const warnings = [];
  const slotLabel = slot?.slot_no != null ? `#${slot.slot_no}` : null;
  const globalRules = convertScopeRules(slot?.var_rules_global, {
    scopeLabel: '전역',
    slotLabel,
    warnings,
  });
  const localRules = convertScopeRules(slot?.var_rules_local, {
    scopeLabel: '로컬',
    slotLabel,
    warnings,
  });

  return {
    id: String(slot.id),
    slot_no: slot.slot_no ?? null,
    template: slot.template || '',
    slot_type: slot.slot_type || 'ai',
    is_start: !!slot.is_start,
    options: {
      invisible: !!slot.invisible,
      visible_slots: Array.isArray(slot.visible_slots)
        ? slot.visible_slots.map(value => Number(value))
        : [],
      manual_vars_global: globalRules.manual,
      manual_vars_local: localRules.manual,
      active_vars_global: globalRules.active,
      active_vars_local: localRules.active,
    },
    warnings,
  };
}

export function extractVariableRules(slot) {
  return {
    global: convertScopeRules(slot?.var_rules_global),
    local: convertScopeRules(slot?.var_rules_local),
  };
}

//
