import { evaluateBridge } from '../../../../lib/promptEngine'

export function pickNextEdge(edges, context) {
  if (!Array.isArray(edges) || edges.length === 0) {
    return null
  }

  const sorted = [...edges].sort(
    (a, b) => (b.data?.priority ?? 0) - (a.data?.priority ?? 0),
  )

  let fallback = null

  for (const edge of sorted) {
    if (!edge.to) continue
    if (edge.data?.fallback) {
      if (
        !fallback ||
        (edge.data?.priority ?? 0) > (fallback.data?.priority ?? 0)
      ) {
        fallback = edge
      }
      continue
    }

    if (evaluateBridge(edge.data, context)) {
      return edge
    }
  }

  return fallback
}

//
