// pages/maker/[id]/index.js
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import ReactFlow, { Background, Controls, MiniMap, addEdge, useEdgesState, useNodesState } from 'reactflow'
import 'reactflow/dist/style.css'
import { supabase } from '../../../lib/supabase'
import PromptNode from '../../../components/maker/PromptNode'
import SidePanel from '../../../components/maker/SidePanel'

const nodeTypes = { prompt: PromptNode }

export default function MakerEditor() {
  const router = useRouter()
  const { id: setId } = router.query

  const [loading, setLoading] = useState(true)
  const [setInfo, setSetInfo] = useState(null)
  const [globalRules, setGlobalRules] = useState([])
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const idMapRef = useRef(new Map()) // flowNodeId -> DB slot.id

  // 전역 변수 규칙 (세트 단위)
  const [globalRules, setGlobalRules] = useState([])

  // 초기 로드
  useEffect(() => {
    if (!setId) return
    ;(async () => {
      // 세트 정보
      const { data: setRow, error: e1 } = await supabase
        .from('prompt_sets')
        .select('*')
        .eq('id', setId)
        .single()
      if (e1) { alert('세트를 불러오지 못했습니다.'); router.replace('/maker'); return }
      setSetInfo(setRow)
      setGlobalRules(Array.isArray(setRow.var_rules_global) ? setRow.var_rules_global : [])

      // 슬롯 / 브릿지
      const { data: slotRows } = await supabase
        .from('prompt_slots')
        .select('*')
        .eq('set_id', setId)
        .order('id')

      const { data: bridgeRows } = await supabase
        .from('prompt_bridges')
        .select('*')
        .eq('from_set', setId)
        .order('id')

      const initNodes = (slotRows || []).map((s, idx) => {
        const nid = `n${s.id}`
        idMapRef.current.set(nid, s.id)
        return {
          id: nid,
          type: 'prompt',
          position: { x: 80 + (idx % 4)*380, y: 120 + Math.floor(idx/4)*260 },
          data: {
            template: s.template || '',
            slot_type: s.slot_type || 'ai',
            var_rules_local: Array.isArray(s.var_rules_local) ? s.var_rules_local : [],
            onChange: (partial) => setNodes(nds => nds.map(n => n.id===nid ? { ...n, data:{ ...n.data, ...partial } } : n)),
            onDelete: handleDeletePrompt,
            isStart: !!s.is_start,
            onSetStart: () => markAsStart(nid)
          }
        }
      })

      const initEdges = (bridgeRows || []).filter(b => b.from_slot_id && b.to_slot_id).map(b => ({
        id: `e${b.id}`,
        source: `n${b.from_slot_id}`,
        target: `n${b.to_slot_id}`,
        label: [
          (b.trigger_words || []).join(', '),
          (b.conditions && b.conditions.length ? 'cond' : null),
          (b.probability !== 1 ? `p=${b.probability}` : null),
          (b.fallback ? 'fallback' : null),
          (b.action && b.action !== 'continue' ? b.action : null)
        ].filter(Boolean).join(' | '),
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
      animated: false,
      data: { trigger_words: [], conditions: [], priority:0, probability:1.0, fallback:false, action:'continue' }
    }, eds))
  }, [setEdges])

  // 선택 이벤트
  const onNodeClick = useCallback((_, node) => { setSelectedNodeId(node.id); setSelectedEdge(null) }, [])
  const onEdgeClick = useCallback((_, edge) => { setSelectedEdge(edge); setSelectedNodeId(null) }, [])

  // 시작 지정
  function markAsStart(flowNodeId) {
    setNodes(nds => nds.map(n => {
      const isTarget = n.id === flowNodeId
      return { ...n, data: { ...n.data, isStart: isTarget } }
    }))
  }

  // 노드 삭제(+연결 브릿지 DB/화면 동시 삭제)
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

  // ===== 저장(전역/로컬 규칙 포함) =====
  async function saveAll() {
    if (!setInfo) return

    // A) 전역 규칙: prompt_sets 업데이트
    const upSet = await supabase
      .from('prompt_sets')
      .update({ var_rules_global: globalRules || [] })
      .eq('id', setInfo.id)
      .select()
      .single()
    if (upSet.error) {
      alert('세트(전역 규칙) 저장 실패: ' + upSet.error.message)
      console.error('prompt_sets update error', upSet.error)
      return
    }
    setSetInfo(upSet.data)

    // B) 화면상의 노드 순서를 slot_no로 사용
    const slotNoMap = new Map()
    nodes.forEach((n, idx) => slotNoMap.set(n.id, idx + 1)) // 1..N

    // C) 슬롯 업서트 (로컬 규칙 포함)
    for (const n of nodes) {
      const slot_no = slotNoMap.get(n.id) || 1
      let slotId = idMapRef.current.get(n.id)

      const payload = {
        set_id: setInfo.id,
        slot_no,
        slot_type: n.data.slot_type || 'ai',
        slot_pick: n.data.slot_pick || '1',
        template: n.data.template || '',
        is_start: !!n.data.isStart,
        var_rules_local: Array.isArray(n.data.var_rules_local) ? n.data.var_rules_local : [],
        transform_code: n.data.transform_code ?? ''
      }
      // 세트 전역 규칙 저장
 await supabase.from('prompt_sets')
   .update({ var_rules_global: Array.isArray(globalRules) ? globalRules : [] })
   .eq('id', setInfo.id)

      if (!slotId) {
        const ins = await supabase
          .from('prompt_slots')
          .insert(payload)
          .select()
          .single()
        if (ins.error || !ins.data) {
          alert('슬롯 저장 실패: ' + (ins.error?.message ?? 'unknown'))
          console.error('prompt_slots insert error', ins.error)
          continue
        }
        slotId = ins.data.id
        idMapRef.current.set(n.id, slotId)
      } else {
        const upd = await supabase
          .from('prompt_slots')
          .update(payload)
          .eq('id', slotId)
          .select()
          .single()
        if (upd.error) {
          alert('슬롯 업데이트 실패: ' + upd.error.message)
          console.error('prompt_slots update error', upd.error)
        }
      }
    }

    // D) 브릿지 업서트(기존 로직 유지)
    const { data: oldBridges } = await supabase
      .from('prompt_bridges')
      .select('id')
      .eq('from_set', setInfo.id)

    const keep = new Set()
    for (const e of edges) {
      const fromId = idMapRef.current.get(e.source)
      const toId   = idMapRef.current.get(e.target)
      if (!fromId || !toId) continue

      let bridgeId = e.data?.bridgeId
      const payload = {
        from_set: setInfo.id,
        from_slot_id: fromId,
        to_slot_id: toId,
        trigger_words: e.data?.trigger_words || [],
        conditions: e.data?.conditions || [],
        priority: e.data?.priority ?? 0,
        probability: e.data?.probability ?? 1.0,
        fallback: !!e.data?.fallback,
        action: e.data?.action || 'continue'
      }

      if (!bridgeId) {
        const ins = await supabase.from('prompt_bridges').insert(payload).select().single()
        if (ins.error || !ins.data) {
          alert('브릿지 저장 실패: ' + (ins.error?.message ?? 'unknown'))
          console.error('prompt_bridges insert error', ins.error)
          continue
        }
        bridgeId = ins.data.id
        e.data = { ...(e.data || {}), bridgeId }
      } else {
        const upd = await supabase.from('prompt_bridges').update(payload).eq('id', bridgeId).select().single()
        if (upd.error) {
          alert('브릿지 업데이트 실패: ' + upd.error.message)
          console.error('prompt_bridges update error', upd.error)
        }
      }
      keep.add(bridgeId)
    }
    for (const ob of (oldBridges || [])) {
      if (!keep.has(ob.id)) await supabase.from('prompt_bridges').delete().eq('id', ob.id)
    }

    alert('저장 완료')
    
  }

  if (loading) return <div style={{ padding:20 }}>불러오는 중…</div>

  return (
    <div style={{ height:'100vh', display:'grid', gridTemplateRows:'auto 1fr' }}>
      {/* 상단 툴바 */}
      <div style={{ position:'sticky', top:0, zIndex:40, background:'#fff',
            padding:10, borderBottom:'1px solid #e5e7eb',
            display:'grid', gridTemplateColumns:'1fr auto auto', gap:8 }}>
        <div>
          <button onClick={()=>router.push('/maker')} style={{ padding:'6px 10px' }}>← 목록</button>
          <b style={{ marginLeft:10 }}>{setInfo?.name}</b>
        </div>
        <div className="node-drag-handle" style={{ display:'flex', gap:8 }}>
          <button onClick={()=>addPromptNode('ai')} style={{ padding:'6px 10px', background:'#2563eb', color:'#fff', borderRadius:8 }}>+ 프롬프트</button>
          <button onClick={()=>addPromptNode('user_action')} style={{ padding:'6px 10px', background:'#0ea5e9', color:'#fff', borderRadius:8 }}>+ 유저 행동</button>
          <button onClick={()=>addPromptNode('system')} style={{ padding:'6px 10px', background:'#6b7280', color:'#fff', borderRadius:8 }}>+ 시스템</button>
          <button type="button" onClick={saveAll} style={{ padding:'6px 10px', background:'#111827', color:'#fff', borderRadius:8 }}>저장</button>
        </div>
      </div>

      {/* 본문 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px' }}>
        <div style={{ position:'relative', zIndex:0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            fitView
            nodeDragHandle=".node-drag-handle"
          >
            <MiniMap /><Controls /><Background />
          </ReactFlow>
        </div>

<SidePanel
  selectedNodeId={selectedNodeId}
  selectedEdge={selectedEdge}
  setEdges={setEdges}
  setNodes={setNodes}
  onInsertToken={insertTokenToSelected}
  globalRules={globalRules}        // ★ 추가
  setGlobalRules={setGlobalRules}  // ★ 추가
  selectedNodeData={nodes.find(n => n.id===selectedNodeId)?.data}
/>
      </div>
    </div>
  )

  function addPromptNode(type='ai') {
    const nid = `tmp_${Date.now()}`
    setNodes(nds => [...nds, {
      id: nid,
      type: 'prompt',
      position: { x: 120, y: 80 },
      data: {
        template: '',
        slot_type: type,
        var_rules_local: [],            // ★ 새 노드 초기값
        onChange: (partial) => setNodes(nds => nds.map(n => n.id===nid ? { ...n, data:{ ...n.data, ...partial } } : n)),
        onDelete: handleDeletePrompt,
        isStart: false,
        onSetStart: () => markAsStart(nid)
      }
    }])
    setSelectedNodeId(nid)
  }
  await supabase
  .from('prompt_sets')
  .update({ var_rules_global: globalRules })
  .eq('id', setId)
}
