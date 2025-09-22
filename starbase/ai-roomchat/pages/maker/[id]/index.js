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
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)
  const idMapRef = useRef(new Map()) // flowNodeId -> DB slot.id

  // 초기 로드
  useEffect(() => {
    if (!setId) return
    ;(async () => {
      const { data: setRow, error: e1 } = await supabase.from('prompt_sets').select('*').eq('id', setId).single()
      if (e1) { alert('세트를 불러오지 못했습니다.'); router.replace('/maker'); return }
      setSetInfo(setRow)

      const { data: slotRows } = await supabase.from('prompt_slots').select('*').eq('set_id', setId).order('slot_no, id')
      const { data: bridgeRows } = await supabase.from('prompt_bridges').select('*').eq('from_set', setId).order('id')

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
            options: s.options || {},             // ★ options 로드
            onChange: (partial) => setNodes(nds => nds.map(n => n.id===nid ? { ...n, data:{ ...n.data, ...partial } } : n)),
            onDelete: handleDeletePrompt,
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
  const onNodeClick = useCallback((_, node) => {
    setSelectedNodeId(node.id)
    setSelectedEdge(null)
    // 사이드패널에서 현재 노드 옵션을 표시할 수 있도록 스냅샷
    if (typeof window !== 'undefined') window.__RF_NODE_DATA = node.data
  }, [])
  const onEdgeClick = useCallback((_, edge) => {
    setSelectedEdge(edge)
    setSelectedNodeId(null)
  }, [])

  // 토큰 → 선택 노드 템플릿에 append
  function insertTokenToSelected(token) {
    if (!selectedNodeId) return
    setNodes(nds => nds.map(n => n.id===selectedNodeId
      ? { ...n, data:{ ...n.data, template:(n.data.template||'') + token } }
      : n))
    if (typeof window !== 'undefined' && window.__RF_NODE_DATA) {
      window.__RF_NODE_DATA = {
        ...window.__RF_NODE_DATA,
        template: (window.__RF_NODE_DATA.template || '') + token
      }
    }
  }

  // 노드 추가
  function addPromptNode(type='ai') {
    const nid = `tmp_${Date.now()}`
    setNodes(nds => [...nds, {
      id: nid,
      type: 'prompt',
      position: { x: 120, y: 80 },
      data: {
        template: '',
        slot_type: type,
        options: {}, // 새 옵션 컨테이너
        onChange: (partial) => setNodes(nds => nds.map(n => n.id===nid ? { ...n, data:{ ...n.data, ...partial } } : n)),
        onDelete: handleDeletePrompt,
      }
    }])
    setSelectedNodeId(nid)
    setSelectedEdge(null)
    if (typeof window !== 'undefined') window.__RF_NODE_DATA = { template:'', slot_type:type, options:{} }
  }

  // 노드 삭제(+연결 브릿지 DB/화면 동시 삭제)
  async function handleDeletePrompt(flowNodeId) {
    setNodes(nds => nds.filter(n => n.id !== flowNodeId))
    setEdges(eds => eds.filter(e => e.source !== flowNodeId && e.target !== flowNodeId))
    setSelectedNodeId(null)
    setSelectedEdge(null)
    const slotId = idMapRef.current.get(flowNodeId)
    if (slotId) {
      await supabase.from('prompt_bridges').delete().or(`from_slot_id.eq.${slotId},to_slot_id.eq.${slotId}`)
      await supabase.from('prompt_slots').delete().eq('id', slotId)
      idMapRef.current.delete(flowNodeId)
    }
  }

  // 저장(노드/엣지 upsert)
  async function saveAll() {
    if (!setInfo) return

    // 1) 화면상의 노드 순서를 slot_no로 사용
    const slotNoMap = new Map()
    nodes.forEach((n, idx) => slotNoMap.set(n.id, idx + 1)) // 1..N

    // 2) 노드 저장/업데이트 (options 포함!)
    for (const n of nodes) {
      const slot_no = slotNoMap.get(n.id) || 1
      let slotId = idMapRef.current.get(n.id)
      const payload = {
        set_id: setInfo.id,
        slot_no,
        slot_type: n.data.slot_type || 'ai',
        slot_pick: n.data.slot_pick || '1',
        template: n.data.template || '',
        options: n.data.options || {} // ★ 중요
      }

      if (!slotId) {
        const ins = await supabase.from('prompt_slots').insert(payload).select().single()
        if (ins.error || !ins.data) {
          alert('슬롯 저장 실패: ' + (ins.error?.message ?? 'unknown'))
          console.error('prompt_slots insert error', ins.error)
          continue
        }
        slotId = ins.data.id
        idMapRef.current.set(n.id, slotId)
      } else {
        const upd = await supabase.from('prompt_slots').update(payload).eq('id', slotId).select().single()
        if (upd.error) {
          alert('슬롯 업데이트 실패: ' + upd.error.message)
          console.error('prompt_slots update error', upd.error)
        }
      }
    }

    // 3) 엣지 저장/업데이트
    const { data: oldBridges } = await supabase.from('prompt_bridges').select('id').eq('from_set', setInfo.id)
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
      {/* 상단 바 */}
      <div style={{
        position:'sticky', top:0, zIndex:40, background:'#fff',
        padding:10, borderBottom:'1px solid #e5e7eb',
        display:'grid', gridTemplateColumns:'1fr auto auto', gap:8
      }}>
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

      {/* 본문: 캔버스 + 사이드패널 */}
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
        />
      </div>
    </div>
  )
}
