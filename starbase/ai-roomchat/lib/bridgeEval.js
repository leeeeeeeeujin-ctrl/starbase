// lib/bridgeEval.js
import { evaluateBridge } from './promptEngine'

function normalizeSlotId(value) {
  if (value == null) return null
  if (typeof value === 'number') return value
  const str = String(value)
  if (str.startsWith('n')) {
    const num = Number(str.slice(1))
    return Number.isFinite(num) ? num : str
  }
  const num = Number(str)
  return Number.isFinite(num) ? num : str
}

function slotKey(value) {
  const normalized = normalizeSlotId(value)
  return typeof normalized === 'number' ? normalized : String(normalized)
}

function normalizeEdge(edge) {
  if (!edge) return null
  const data = edge.data || edge
  const source = edge.from_slot_id ?? edge.source ?? data.from_slot_id
  const target = edge.to_slot_id ?? edge.target ?? data.to_slot_id
  return {
    original: edge,
    data,
    sourceKey: slotKey(source),
    target,
  }
}

export function chooseNext({ currentSlotId, edges = [], context = {} }) {
  const currentKey = slotKey(currentSlotId)
  if (currentKey == null) return null

  const candidates = edges
    .map((edge) => normalizeEdge(edge))
    .filter((edge) => edge && edge.sourceKey != null && edge.sourceKey === currentKey)

  if (candidates.length === 0) return null

  candidates.sort((a, b) => (a.data?.priority ?? 0) - (b.data?.priority ?? 0))

  let fallbackCandidate = null

  for (const candidate of candidates) {
    const data = candidate.data || {}
    if (data.fallback && !fallbackCandidate) {
      fallbackCandidate = candidate
    }

    if (!evaluateBridge(data, context)) {
      continue
    }

    const probability = data.probability
    const ratio = probability == null ? 1 : Number(probability)
    const bounded = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0

    if (bounded >= 1 || Math.random() <= bounded) {
      return {
        nextSlotId: normalizeSlotId(candidate.target),
        action: data.action || 'continue',
        edge: candidate.original,
      }
    }
  }

  if (fallbackCandidate) {
    const data = fallbackCandidate.data || {}
    return {
      nextSlotId: normalizeSlotId(fallbackCandidate.target),
      action: data.action || 'continue',
      edge: fallbackCandidate.original,
    }
  }

  return null
}

//
