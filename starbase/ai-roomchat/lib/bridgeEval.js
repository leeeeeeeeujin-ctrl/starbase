// lib/bridgeEval.js
function hitProb(p){const x=Math.random();return Number.isFinite(p)?x<Math.max(0,Math.min(1,p)):true}
function stringify(v){return (v??'')+''}

export function chooseNext({ bridgesFromSlot=[], aiText='', prevPrompt='', ctx, turnIndex=0, visitedSlotIds=[] }) {
  const text = stringify(aiText)
  const prev = stringify(prevPrompt)

  // 우선순위 desc → 동일순 무작위
  const sorted = [...bridgesFromSlot].sort((a,b)=>(b.priority??0)-(a.priority??0))

  const checkCond = (c) => {
    if(!c || !c.type) return true
    if(c.type==='random') return hitProb(c.p ?? 1)
    if(c.type==='turn_gte') return turnIndex >= (c.value ?? c.gte ?? 0)
    if(c.type==='turn_lte') return turnIndex <= (c.value ?? c.lte ?? 1e9)
    if(c.type==='prev_ai_contains'){
      const scope = c.scope || 'last2'
      const lines = text.split(/\r?\n/)
      const target = scope==='all' ? text :
                     scope==='last1' ? lines.slice(-1).join('\n') :
                     scope==='last5' ? lines.slice(-5).join('\n') :
                     lines.slice(-2).join('\n')
      return target.includes(c.value ?? '')
    }
    if(c.type==='prev_prompt_contains'){
      const scope = c.scope || 'last1'
      const lines = prev.split(/\r?\n/)
      const target = scope==='all' ? prev :
                     scope==='last2' ? lines.slice(-2).join('\n') :
                     lines.slice(-1).join('\n')
      return target.includes(c.value ?? '')
    }
    if(c.type==='prev_ai_regex'){
      try{
        const r = new RegExp(c.pattern || '', c.flags || '')
        const scope = c.scope || 'last1'
        const lines = text.split(/\r?\n/)
        const target = scope==='all' ? text :
                       scope==='last2' ? lines.slice(-2).join('\n') :
                       lines.slice(-1).join('\n')
        return r.test(target)
      }catch{ return false }
    }
    if(c.type==='visited_slot'){
      return visitedSlotIds.includes(c.slot_id)
    }
    if(c.type==='fallback') return true
    return true
  }

  for(const br of sorted){
    if(br.probability != null && !hitProb(br.probability)) continue
    const conds = br.conditions || []
    const ok = conds.every(checkCond)
    if(ok) return { nextSlotId: br.to_slot_id || null, action: br.action || 'continue' }
  }
  // 전부 불발: fallback 있으면 그쪽, 없으면 null
  const fb = sorted.find(b => (b.conditions||[]).some(c => c.type==='fallback'))
  return fb ? { nextSlotId: fb.to_slot_id || null, action: fb.action || 'continue' } : { nextSlotId: null, action: 'continue' }
}
