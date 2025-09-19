// pages/maker/[id]/index.js
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import ReactFlow, { Background, Controls, MiniMap, addEdge, useEdgesState, useNodesState } from 'reactflow'
import 'reactflow/dist/style.css'
import { supabase } from '../../../lib/supabase'
import PromptNode from '../../../components/maker/PromptNode.js'
import SidePanel  from '../../../components/maker/SidePanel.js'

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

  // flow node id → DB slot.id
  const idMapRef = useRef(new Map())

  // 초기 로드
  useEffect(() => {
    if (!setId) return
    ;(async () => {
      const { data: setRow, error: e1 } = await supabase.from('prompt_sets').select('*').eq('id', setId).single()
      if (e1) { alert('세트를 불러오지 못했습니다.'); router.replace('/maker'); return }
      setSetInfo(setRow)

      const { data: slotRows } = await supabase.from('prompt_slots').select('*').eq('set_id', setId).order('id')
      const { data: bridgeRows } = await supabase.from('prompt_bridges').select('*').eq('from_set', setId).order('id')

      const initNodes = (slotRows || []).map((s, idx) => {
        const nid = `n${s.id}`
        idMapRef.current.set(nid, s.id)
        return {
          id: nid,
          type: 'prompt',
          position: { x: 80 + (idx % 4) * 380, y: 120 + Math.floor(idx / 4) * 260 },
          data: {
            template: s.template || '',
            slot_type: s.slot_type || 'ai',
            onChange: (partial) => {
              setNodes(nds => nds.map(n => n.id === nid ? { ...n, data: { ...n.data, ...partial } } : n))
            },
            onDelete: handleDeletePrompt
          }
        }
      })

      const initEdges = (bridgeRows || [])
        .filter(b => b.from_slot_id && b.to_slot_id)
        .map((b) => ({
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

  // 엣지 연결
  const onConnect = useCallback((params) => {
    setEdges(eds => addEdge({
      ...params,
      type: 'default',
      animated: false,
      data: { trigger_words: [], conditions: [], priority: 0, probability: 1.0, fallback: false, action: 'continue' }
    }, eds))
  }, [setEdges])

  // 토큰 삽입: 선택 노드 템플릿에 append
  const insertTokenToSelected = useCallback((token) => {
    if (!selectedNodeId) return
    setNodes(nds => nds.map(n => {
      if (n.id !== selectedNodeId) return n
      const prev = n.data?.template || ''
      return { ...n, data: { ...n.data, template: prev + token } }
    }))
  }, [selectedNodeId, setNodes])

  // 노드 삭제(+연결 브릿지 DB/화면 동시 정리)
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

  // 선택 엣지 삭제 버튼
  const deleteSelectedEdge = useCallback(async () => {
    if (!selectedEdge) return
    const bridgeId = selectedEdge.data?.bridgeId
    setEdges(eds => eds.filter(e => e.id !== selectedEdge.id))
    if (bridgeId) await supabase.from('prompt_bridges').delete().eq('id', bridgeId)
    setSelectedEdge(null)
  }, [selectedEdge, setEdges])

  // 저장(노드/엣지 업서트)
  async function saveAll() {
    if (!setInfo) return
    // 1) slots
    for (const n of nodes) {
      let slotId = idMapRef.current.get(n.id)
      if (!slotId) {
        const ins = await supabase.from('prompt_slots')
          .insert({ set_id: setInfo.id, slot_type: n.data.slot_type || 'ai', slot_pick: '1', template: n.data.template || '' })
          .select().single()
        slotId = ins.data.id
        idMapRef.current.set(n.id, slotId)
      } else {
        await supabase.from('prompt_slots')
          .update({ slot_type: n.data.slot_type || 'ai', template: n.data.template || '' })
          .eq('id', slotId)
      }
    }
    // 2) bridges
    const { data: oldBridges } = await supabase.from('prompt_bridges').select('id').eq('from_set', setInfo.id)
    const keep = new Set()
    for (const e of edges) {
      const fromId = idMapRef.current.get(e.source)
      const toId = idMapRef.current.get(e.target)
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
        bridgeId = ins.data.id
        e.data = { ...(e.data || {}), bridgeId }
      } else {
        await supabase.from('prompt_bridges').update(payload).eq('id', bridgeId)
      }
      keep.add(bridgeId)
    }
    for (const ob of (oldBridges || [])) {
      if (!keep.has(ob.id)) await supabase.from('prompt_bridges').delete().eq('id', ob.id)
    }
    alert('저장 완료')
  }

  if (loading) return <div style={{ padding: 20 }}>불러오는 중…</div>

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      {/* 상단 바 */}
      <div style={{ padding: 10, borderBottom: '1px solid #e5e7eb', display:'flex', alignItems:'center', gap:8 }}>
        <button onClick={() => router.push('/maker')} style={{ padding: '6px 10px', borderRadius:8, background:'#e5e7eb' }}>
          ← 목록
        </button>
        <span style={{ fontWeight: 800 }}>{setInfo?.name}</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={() => setSelectedNodeId(null) || setSelectedEdge(null)} style={{ padding:'6px 10px', borderRadius:8, background:'#f3f4f6' }}>
            선택 해제
          </button>
          <button onClick={() => setNodes(nds => [...nds, {
            id: `tmp_${Date.now()}`,
            type:'prompt',
            position:{ x:120, y:80 },
            data:{ template:'', slot_type:'ai', onChange:(partial)=>{}, onDelete:handleDeletePrompt }
          }])} style={{ padding:'6px 10px', borderRadius:8, background:'#2563eb', color:'#fff' }}>
            + 프롬프트(임시)
          </button>
          <button onClick={saveAll} style={{ padding:'6px 10px', borderRadius:8, background:'#111827', color:'#fff' }}>
            저장
          </button>
        </div>
      </div>

      {/* 에디터 + 우측 패널 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px' }}>
        <div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdge(null) }}
            onEdgeClick={(_, edge) => { setSelectedEdge(edge); setSelectedNodeId(null) }}
            fitView
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
        </div>

        <SidePanel
          selectedNodeId={selectedNodeId}
          selectedEdge={selectedEdge}
          setEdges={setEdges}
          onDeleteEdge={deleteSelectedEdge}
          onInsertToken={insertTokenToSelected}
        />
      </div>
    </div>
  )
}
