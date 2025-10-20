import { z } from 'zod'

import { sanitizeVariableRules } from '../../variableRules'

const metaSchema = z
  .object({
    variableRulesVersion: z.coerce.number().int().nonnegative().optional(),
    version: z.coerce.number().int().nonnegative().optional(),
  })
  .catchall(z.unknown())
  .optional()

const setSchema = z
  .object({
    name: z.union([z.string(), z.number()]).optional(),
    description: z.union([z.string(), z.number()]).optional(),
  })
  .catchall(z.unknown())
  .optional()

const slotSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    slot_id: z.union([z.string(), z.number()]).optional(),
    slotId: z.union([z.string(), z.number()]).optional(),
    slot_no: z.union([z.number(), z.string()]).optional(),
    slotNo: z.union([z.number(), z.string()]).optional(),
    slot_index: z.union([z.number(), z.string()]).optional(),
    slotIndex: z.union([z.number(), z.string()]).optional(),
    slot_type: z.string().optional(),
    slotType: z.string().optional(),
    slot_pick: z.string().optional(),
    slotPick: z.string().optional(),
    template: z.union([z.string(), z.number()]).optional(),
    is_start: z.boolean().optional(),
    isStart: z.boolean().optional(),
    invisible: z.boolean().optional(),
    visible_slots: z.array(z.union([z.number(), z.string()])).optional(),
    visibleSlots: z.array(z.union([z.number(), z.string()])).optional(),
    canvas_x: z.union([z.number(), z.string()]).optional(),
    canvas_y: z.union([z.number(), z.string()]).optional(),
    position: z
      .object({
        x: z.union([z.number(), z.string()]).optional(),
        y: z.union([z.number(), z.string()]).optional(),
      })
      .optional(),
    var_rules_global: z.record(z.any()).optional(),
    varRulesGlobal: z.record(z.any()).optional(),
    var_rules_local: z.record(z.any()).optional(),
    varRulesLocal: z.record(z.any()).optional(),
  })
  .passthrough()

const bridgeSchema = z
  .object({
    from_slot_id: z.union([z.string(), z.number()]).optional(),
    fromSlotId: z.union([z.string(), z.number()]).optional(),
    to_slot_id: z.union([z.string(), z.number()]).optional(),
    toSlotId: z.union([z.string(), z.number()]).optional(),
    trigger_words: z.array(z.any()).optional(),
    triggerWords: z.array(z.any()).optional(),
    conditions: z.array(z.any()).optional(),
    priority: z.union([z.number(), z.string()]).optional(),
    probability: z.union([z.number(), z.string()]).optional(),
    fallback: z.boolean().optional(),
    action: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough()

const bundleSchema = z
  .object({
    meta: metaSchema,
    set: setSchema,
    slots: z.array(slotSchema).optional(),
    bridges: z.array(bridgeSchema).optional(),
  })
  .catchall(z.unknown())

function toNumber(value) {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeTemplate(value) {
  if (typeof value === 'string') return value
  if (value == null) return ''
  if (typeof value === 'number') return String(value)
  return ''
}

function toBoolean(value) {
  return value === true || value === 'true'
}

function sanitizeVisibleSlots(slot) {
  const list = slot.visible_slots ?? slot.visibleSlots
  if (!Array.isArray(list)) return []
  return list
    .map((entry) => toNumber(entry))
    .filter((entry) => entry != null)
}

function sanitizeVariableRulesField(value) {
  if (!value || typeof value !== 'object') return {}
  return sanitizeVariableRules(value)
}

function sanitizeMeta(meta = {}) {
  const sanitized = { ...meta }
  if (sanitized.variableRulesVersion != null) {
    const version = toNumber(sanitized.variableRulesVersion)
    sanitized.variableRulesVersion = version != null ? version : undefined
  }
  if (sanitized.version != null) {
    const version = toNumber(sanitized.version)
    sanitized.version = version != null ? version : undefined
  }
  Object.keys(sanitized).forEach((key) => {
    if (sanitized[key] === undefined) {
      delete sanitized[key]
    }
  })
  return sanitized
}

function sanitizeSet(set = {}) {
  const sanitized = { ...set }
  if (sanitized.name != null) {
    sanitized.name = String(sanitized.name).trim()
  }
  if (sanitized.description != null) {
    sanitized.description = String(sanitized.description)
  }
  return sanitized
}

function buildSlotIdentifier(value) {
  if (value == null) return null
  if (typeof value === 'number') {
    return `number:${value}`
  }
  return `string:${String(value)}`
}

function sanitizeSlot(slot, index, issues) {
  const sanitized = { ...slot }

  const slotNumber =
    toNumber(slot.slot_no ?? slot.slotNo) ??
    toNumber(slot.slot_index ?? slot.slotIndex) ??
    index
  if (!Number.isFinite(slotNumber)) {
    issues.push(`슬롯 ${index + 1}: slot_no 정보를 찾지 못해 인덱스로 대체했습니다.`)
  }
  const resolvedSlotNumber = Number.isFinite(slotNumber) ? slotNumber : index

  sanitized.slot_no = resolvedSlotNumber
  sanitized.slotNo = resolvedSlotNumber
  sanitized.slot_index = resolvedSlotNumber
  sanitized.slotIndex = resolvedSlotNumber

  const slotType =
    (typeof slot.slot_type === 'string' && slot.slot_type.trim()) ||
    (typeof slot.slotType === 'string' && slot.slotType.trim()) ||
    'ai'
  sanitized.slot_type = slotType
  sanitized.slotType = slotType

  const slotPick =
    (typeof slot.slot_pick === 'string' && slot.slot_pick.trim()) ||
    (typeof slot.slotPick === 'string' && slot.slotPick.trim()) ||
    '1'
  sanitized.slot_pick = slotPick
  sanitized.slotPick = slotPick

  const template = normalizeTemplate(slot.template)
  if (!template) {
    issues.push(`슬롯 ${index + 1}: 프롬프트가 비어 있어 빈 문자열로 처리했습니다.`)
  }
  sanitized.template = template

  const isStart = toBoolean(slot.is_start) || toBoolean(slot.isStart)
  sanitized.is_start = isStart
  sanitized.isStart = isStart

  sanitized.invisible = toBoolean(slot.invisible)

  const visibleSlots = sanitizeVisibleSlots(slot)
  sanitized.visible_slots = visibleSlots
  sanitized.visibleSlots = visibleSlots

  const canvasX =
    toNumber(slot.canvas_x) ??
    toNumber(slot.canvasX) ??
    toNumber(slot.position?.x)
  const canvasY =
    toNumber(slot.canvas_y) ??
    toNumber(slot.canvasY) ??
    toNumber(slot.position?.y)
  sanitized.canvas_x = canvasX
  sanitized.canvas_y = canvasY

  const globalRules = sanitizeVariableRulesField(slot.var_rules_global ?? slot.varRulesGlobal)
  sanitized.var_rules_global = globalRules
  sanitized.varRulesGlobal = globalRules

  const localRules = sanitizeVariableRulesField(slot.var_rules_local ?? slot.varRulesLocal)
  sanitized.var_rules_local = localRules
  sanitized.varRulesLocal = localRules

  const identifier = slot.id ?? slot.slot_id ?? slot.slotId ?? null
  if (identifier != null) {
    sanitized.id = identifier
    sanitized.slot_id = identifier
    sanitized.slotId = identifier
  }

  Object.keys(sanitized).forEach((key) => {
    if (sanitized[key] === undefined) {
      delete sanitized[key]
    }
  })

  return sanitized
}

function sanitizeBridge(bridge, index, knownIdentifiers, issues) {
  const sanitized = { ...bridge }

  const fromRef = bridge.from_slot_id ?? bridge.fromSlotId ?? null
  const toRef = bridge.to_slot_id ?? bridge.toSlotId ?? null

  if (fromRef == null || toRef == null) {
    issues.push(`브리지 ${index + 1}: 연결 대상이 부족해 무시했습니다.`)
    return null
  }

  const fromKey = buildSlotIdentifier(fromRef)
  const toKey = buildSlotIdentifier(toRef)
  if (!knownIdentifiers.has(fromKey) || !knownIdentifiers.has(toKey)) {
    issues.push(`브리지 ${index + 1}: 존재하지 않는 슬롯을 참조해 제외했습니다.`)
    return null
  }

  sanitized.from_slot_id = fromRef
  sanitized.fromSlotId = fromRef
  sanitized.to_slot_id = toRef
  sanitized.toSlotId = toRef

  const triggerWords = Array.isArray(bridge.trigger_words ?? bridge.triggerWords)
    ? (bridge.trigger_words ?? bridge.triggerWords).map((value) => String(value))
    : []
  sanitized.trigger_words = triggerWords
  sanitized.triggerWords = triggerWords

  sanitized.conditions = Array.isArray(bridge.conditions) ? [...bridge.conditions] : []

  const priority = toNumber(bridge.priority)
  if (priority != null) {
    sanitized.priority = priority
  }

  const probability = toNumber(bridge.probability)
  if (probability != null) {
    const clamped = Math.max(0, Math.min(probability, 1))
    sanitized.probability = clamped
  }

  sanitized.fallback = toBoolean(bridge.fallback)
  const action = bridge.action != null ? String(bridge.action).trim() : 'continue'
  sanitized.action = action || 'continue'

  Object.keys(sanitized).forEach((key) => {
    if (sanitized[key] === undefined) {
      delete sanitized[key]
    }
  })

  return sanitized
}

export function parsePromptSetImportBundle(raw) {
  const issues = []
  const parsed = bundleSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error('프롬프트 세트 JSON 구조가 올바르지 않습니다.')
  }

  const meta = sanitizeMeta(parsed.data.meta || {})
  if (
    meta.variableRulesVersion == null &&
    meta.version == null
  ) {
    issues.push('meta.variableRulesVersion 값이 없어 기본값으로 처리했습니다.')
  }

  const set = sanitizeSet(parsed.data.set || {})
  const rawSlots = parsed.data.slots || []
  const sanitizedSlots = rawSlots.map((slot, index) => sanitizeSlot(slot, index, issues))

  const identifierSet = new Set()
  sanitizedSlots.forEach((slot) => {
    const idKey = buildSlotIdentifier(slot.id ?? slot.slot_id ?? slot.slotId)
    if (idKey) {
      identifierSet.add(idKey)
    }
    if (slot.slot_no != null) {
      identifierSet.add(buildSlotIdentifier(slot.slot_no))
    }
    if (slot.slot_index != null) {
      identifierSet.add(buildSlotIdentifier(slot.slot_index))
    }
  })

  const rawBridges = parsed.data.bridges || []
  const sanitizedBridges = rawBridges
    .map((bridge, index) => sanitizeBridge(bridge, index, identifierSet, issues))
    .filter(Boolean)

  return {
    bundle: {
      meta,
      set,
      slots: sanitizedSlots,
      bridges: sanitizedBridges,
    },
    warnings: issues,
  }
}
