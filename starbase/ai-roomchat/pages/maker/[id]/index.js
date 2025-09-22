// pages/maker/[id]/index.js
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import ReactFlow, { Background, Controls, MiniMap, addEdge, useEdgesState, useNodesState } from 'reactflow'
import 'reactflow/dist/style.css'
import { supabase } from '@/lib/supabase'
import PromptNode from '../../../components/maker/PromptNode'
import SidePanel from '@/components/maker/SidePanel'

const nodeTypes = { prompt: PromptNode }
const isGlobalOptionsRow = (row) => row?.options && row.options.kind === 'global_options'

export default function MakerEditor() {
  const router = useRouter()
  const { id: setId } = router.query

  const [loading, setLoading] = useState(true)
  const [setInfo, setSetInfo] = useState(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const idMapRef = useRef(new Map()) // flowNodeId -> DB slot.id
  const globalRowRef = useRef(null)   // 숨은 전역옵션 슬롯 원본(row)
  const [globalOpts, setGlobalOpts] = useState({ manual_vars_global: [], active_vars_global: [] })

  // 초기 로드
  useEffect(() => {
    if (!setId) return
    ;(async () => {
      const { data: setRow, error: e1 } = await supabase.from('prompt_sets').select('*').eq('id', setId).single()
      if (e1) { alert('세트를 불러오지 못했습니다.'); router.replace('/maker'); return }
      setSetInfo(setRow)

      const { data: slotRows } = await supabase.from('prompt_slots').select('*').eq('set_id', setId).order('id')
      const { data: bridgeRows } = await supabase.from('prompt_bridges').select('*').eq('from_set', setId).order('id')

      // 전역옵션 슬롯 추출
      const globals = (slotRows || []).find(isGlobalOptionsRow) || null
      globalRowRef.current = globals
      if (globals?.options) {
        setGlobalOpts({
          manual_vars_global: globals.options.manual_vars_global || [],
          active_vars_global: globals.options.active_vars_global || []
        })
      }

      // 일반 슬롯만 노드로 구성
      const normalSlots = (slotRows || []).filter(r => !isGlobalOptionsRow(r))
      const initNodes = normalSlots.map((s, idx) => {
        const nid = `n${s.id}`
        idMapRef.current.set(nid, s.id)
        return {
          id: nid,
          type: 'prompt',
          position: { x: 80 + (idx % 4)*380, y: 120 + Math.floor(idx/4)*260 },
          data: {
            template: s.template || '',
            slot_type: s.slot_type || 'ai',
            isStart: !!s.is_start,
            options: s.options || {},
            onChange: (partial) => setNodes(nds => nds.map(n => n.id===nid ? { ...n, data:{ ...n.data, ...partial } } : n)),
            onDelete: handleDeletePrompt,
            onSetStart: () => markAsStart(nid),
          }
        }
      })

      const initEdges = (bridgeRows || []).filter(b => b.from_slot_id && b.to_slot_id).map(b => ({
        id: `e${b.id}`,
        source: `n${b.from_slot_id}`,
        target: `n${b.to_slot_id}`,
        label: labelFromEdgeData(b),
        data: {
          bridgeId: b.id,
          trigger_words: b.trigger_words || [],
          conditions: b.conditions || [],
          priority: b.priority ?? 0,
          probability: b.probability ?? 1.0,
          fallback: !!b.fallback,
          action: b.action || 'continue'
        }
      }))

      setNodes(initNodes)
      setEdges(initEdges)
      setLoading(false)
    })()
  }, [setId, router, setNodes, setEdges])

  const onConnect = useCallback((params) => {
    setEdges(eds => addEdge({
      ...params,
      type: 'default',
      data: { trigger_words: [], conditions: [], priority:0, probability:1.0, fallback:false, action:'continue' }
    }, eds))
  }, [setEdges])

  const onNodeClick = useCallback((_, node) => { setSelectedNodeId(node.id); setSelectedEdge(null) }, [])
  const onEdgeClick = useCallback((_, edge) => { setSelectedEdge(edge); setSelectedNodeId(null) }, [])

  function insertTokenToSelected(token) {
    if (!selectedNodeId) return
    setNodes(nds => nds.map(n => n.id===selectedNodeId ? { ...n, data:{ ...n.data, template:(n.data.template||'') + token } } : n))
  }

  function addPromptNode(type='ai') {
    const nid = `tmp_${Date.now()}`
    setNodes(nds => [...nds, {
      id: nid, type: 'prompt', position: { x: 120, y: 80 },
      data: {
        template: '', slot_type: type, isStart:false, options:{},
        onChange: (partial) => setNodes(nds => nds.map(n => n.id===nid ? { ...n, data:{ ...n.data, ...partial } } : n)),
        onDelete: handleDeletePrompt, onSetStart: () => markAsStart(nid)
      }
    }])
    setSelectedNodeId(nid)
  }

  function markAsStart(flowNodeId) {
    setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, isStart: n.id === flowNodeId } })))
  }

  async function handleDeletePrompt(flowNodeId) {
    setNodes(nds => nds.filter(n => n.id !== flowNodeId))
    setEdges(eds => eds.filter(e => e.source !== flowNodeId && e.target !== flowNodeId))
    setSelectedNodeId(null)
    const slotId = idMapRef.current.get(flowNodeId)
    if (slotId) {
      await supabase.from('prompt_bridges').delete().or(`from_slot_id.eq.${slotId},to_slot_id.eq.${slotId}`)
      await supabase.from('prompt_slots').delete().eq('id', slotId)
      idMapRef.current.delete(flowNodeId)
    }
  }

  function updateNodeOptions(nodeId, patch) {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n
      return { ...n, data: { ...n.data, options: { ...(n.data.options||{}), ...patch } } }
    }))
  }

  async function saveAll() {
    if (!setInfo) return
    const slotNoMap = new Map()
    nodes.forEach((n, idx) => slotNoMap.set(n.id, idx + 1))

    // 1) 전역옵션 슬롯 업서트(숨김 슬롯)
    const globalPayload = {
      set_id: setInfo.id,
      slot_no: 0,
      slot_type: 'system',
      slot_pick: '1',
      template: '',
      is_start: false,
      options: {
        kind: 'global_options',
        manual_vars_global: globalOpts.manual_vars_global || [],
        active_vars_global: globalOpts.active_vars_global || []
      }
    }
    if (globalRowRef.current?.id) {
      const upd = await supabase.from('prompt_slots').update(globalPayload).eq('id', globalRowRef.current.id).select().single()
      if (upd.error) console.error('전역옵션 업데이트 실패', upd.error)
    } else {
      const ins = await supabase.from('prompt_slots').insert(globalPayload).select().single()
      if (ins.error) console.error('전역옵션 생성 실패', ins.error)
      else globalRowRef.current = ins.data
    }

    // 2) 일반 노드 업서트
    for (const n of nodes) {
      const slot_no = slotNoMap.get(n.id) || 1
      let slotId = idMapRef.current.get(n.id)
      const payload = {
        set_id: setInfo.id,
        slot_no,
        slot_type: n.data.slot_type || 'ai',
        slot_pick: n.data.slot_pick || '1',
        template: n.data.template || '',
        options: n.data.options || {},
        is_start: !!n.data.isStart
      }
      if (!slotId) {
        const ins = await supabase.from('prompt_slots').insert(payload).select().single()
        if (ins.error || !ins.data) { alert('슬롯 저장 실패'); console.error(ins.error); continue }
        slotId = ins.data.id
        idMapRef.current.set(n.id, slotId)
      } else {
        const upd = await supabase.from('prompt_slots').update(payload).eq('id', slotId).select().single()
        if (upd.error) { alert('슬롯 업데이트 실패'); console.error(upd.error) }
      }
    }

    // 3) 브릿지 업서트
    const { data: oldBridges } = await supabase.from('prompt_bridges').select('id').eq('from_set', setInfo.id)
    const keep = new Set()
    for (const e of edges) {
      const fromId = idMapRef.current.get(e.source)
      const toId   = idMapRef.current.get(e.target)
      if (!fromId || !toId) continue
      let bridgeId = e.data?.bridgeId
      const payload = {
        from_set: setInfo.id, from_slot_id: fromId, to_slot_id: toId,
        trigger_words: e.data?.trigger_words || [],
        conditions: e.data?.conditions || [],
        priority: e.data?.priority ?? 0,
        probability: e.data?.probability ?? 1.0,
        fallback: !!e.data?.fallback,
        action: e.data?.action || 'continue'
      }
      if (!bridgeId) {
        const ins = await supabase.from('prompt_bridges').insert(payload).select().single()
        if (ins.error || !ins.data) { console.error('브릿지 저장 실패', ins.error); continue }
        bridgeId = ins.data.id
        e.data = { ...(e.data||{}), bridgeId }
      } else {
        const upd = await supabase.from('prompt_bridges').update(payload).eq('id', bridgeId).select().single()
        if (upd.error) { console.error('브릿지 업데이트 실패', upd.error) }
      }
      keep.add(bridgeId)
    }
    for (const ob of (oldBridges || [])) if (!keep.has(ob.id)) await supabase.from('prompt_bridges').delete().eq('id', ob.id)

    alert('저장 완료')
  }

  if (loading) return <div style={{ padding:20 }}>불러오는 중…</div>

  const selectedNode = selectedNodeId ? nodes.find(n=>n.id===selectedNodeId) : null

  return (
    <div style={{ height:'100vh', display:'grid', gridTemplateRows:'auto 1fr' }}>
      {/* 상단 바 */}
      <div style={{ position:'sticky', top:0, zIndex:40, background:'#fff',
        padding:10, borderBottom:'1px solid #e5e7eb',
        display:'grid', gridTemplateColumns:'1fr auto auto', gap:8 }}>
        <div>
          <button onClick={()=>router.push('/maker')} style={{ padding:'6px 10px' }}>← 목록</button>
          <b style={{ marginLeft:10 }}>{setInfo?.name}</b>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>addPromptNode('ai')} style={{ padding:'6px 10px', background:'#2563eb', color:'#fff', borderRadius:8 }}>+ 프롬프트</button>
          <button onClick={()=>addPromptNode('user_action')} style={{ padding:'6px 10px', background:'#0ea5e9', color:'#fff', borderRadius:8 }}>+ 유저 행동</button>
          <button onClick={()=>addPromptNode('system')} style={{ padding:'6px 10px', background:'#6b7280', color:'#fff', borderRadius:8 }}>+ 시스템</button>
          <button type="button" onClick={saveAll} style={{ padding:'6px 10px', background:'#111827', color:'#fff', borderRadius:8 }}>저장</button>
        </div>
      </div>

      {/* 본문: 캔버스 + 사이드 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 360px' }}>
        <div style={{ position:'relative' }}>
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onNodeClick={(_,n)=>{ setSelectedNodeId(n.id); setSelectedEdge(null) }}
            onEdgeClick={(_,e)=>{ setSelectedEdge(e); setSelectedNodeId(null) }}
            fitView
          >
            <MiniMap /><Controls /><Background />
          </ReactFlow>
        </div>

        <SidePanel
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          setEdges={setEdges}
          onInsertToken={(tok)=>insertTokenToSelected(tok)}
          globalOpts={globalOpts}
          setGlobalOpts={setGlobalOpts}
          updateNodeOptions={(nodeId, patch)=>updateNodeOptions(nodeId, patch)}
        />
      </div>
    </div>
  )
}

// ★ 엣지 라벨 생성: 조건들을 사람이 읽기 쉽게 합쳐 표시
function buildEdgeLabel(data) {
  const parts = []
  const conds = data?.conditions || []

  conds.forEach(c => {
    if (c?.type === 'turn_gte') {
      parts.push(`턴 ≥ ${c.value}`)
    } else if (c?.type === 'turn_lte') {
      parts.push(`턴 ≤ ${c.value}`)
    } else if (c?.type === 'prev_ai_contains') {
      parts.push(`이전응답 "${c.value}"`)
    } else if (c?.type === 'prev_prompt_contains') {
      parts.push(`이전프롬프트 "${c.value}"`)
    } else if (c?.type === 'prev_ai_regex') {
      parts.push(`이전응답 /${c.pattern}/${c.flags || ''}`)
    } else if (c?.type === 'visited_slot') {
      parts.push(`경유 #${c.slot_id ?? '?'}`)
    } else if (c?.type === 'var_on') {
      const scope = c.scope || 'both'
      const mode  = c.mode  || 'any'
      const names = (c.names || []).join(' ')
      parts.push(`변수(${scope}) ${mode}: ${names}`)
    } else if (c?.type === 'count') {
      const who    = c.who    || 'all'
      const status = c.status || 'alive'
      const cmp    = c.cmp    || 'gte'
      const value  = c.value ?? 0
      const role   = c.role ? ` @${c.role}` : ''
      parts.push(`카운트(${who}/${status}) ${cmp} ${value}${role}`)
    } else if (c?.type === 'fallback') {
      parts.push('Fallback')
    }
  })

  const p = data?.probability
  if (p != null && p !== 1) {
    parts.push(`확률 ${Math.round(Number(p) * 100)}%`)
  }
  if (data?.action && data.action !== 'continue') {
    parts.push(data.action)
  }
  if (data?.fallback) {
    parts.push('Fallback')
  }

  return parts.join(' | ')
}
