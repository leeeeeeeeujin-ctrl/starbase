// lib/bridgeEval.js
export function chooseNext({ currentSlotId, edges = [], context }) {
// TODO: 조건/우선순위/확률 평가
const e = edges.find(x => x.source === currentSlotId)
return e?.target || null
}