// pages/maker/[id]/index.js
// Next.js pages 라우터 기준 (app 라우터 아님)
// React Flow 기반 프롬프트 세트 편집기: 노드(슬롯), 엣지(브릿지), 저장/불러오기

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { addEdge, useEdgesState, useNodesState } from 'reactflow'
import 'reactflow/dist/style.css'
import { supabase } from '@/lib/supabase'
import SidePanel from '@/components/maker/SidePanel'

// ReactFlow SSR 회피
const ReactFlow = dynamic(() => import('reactflow').then(m => m.default), { ssr: false })
const Background = dynamic(() => import('reactflow').then(m => m.Background), { ssr: false })
const Controls   = dynamic(() => import('reactflow').then(m => m.Controls), { ssr: false })
const MiniMap    = dynamic(() => import('reactflow').then(m => m.MiniMap), { ssr: false })

// 기본 Prompt Node (심플 카드)
function PromptNode({ id, data }) {
  const { template, slot_type, is_invisible, visible_slots, onChange, onDelete } = data
  return (
    <div style={{
      width: 320, border: '1px solid #e5e7eb', borderRadius: 12, padding: 10, background: '#fff',
      boxShadow: '0 1px 2px rgba(0,0,0,0.06)', display: 'grid', gap: 8
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <b>{slot_type?.toUpperCase?.() || 'AI'}</b>
        <div style={{ display:'flex', gap:6 }}>
          <span style={{ fontSize:12, color: is_invisible ? '#ef4444' : '#64748b' }}>
            {is_invisible ? 'Invisible' : 'Visible'}
          </span>
          <button onClick={() => onDelete?.(id)} style={{ fontSize:12, color:'#ef4444' }}>✕</button>
        </div>
      </div>
      <textarea
        rows={8}
        value={template || ''}
        onChange={e => onChange?.({ template: e.target.value })}
        placeholder="프롬프트 텍스트…  {{slot1.name}} / {{history.last2}} / {{slot.random}} 등"
        style={{ width:'100%', fontFamily:'monospace', fontSize:13 }}
      />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <label style={{ fontSize:12 }}>
          타입
          <select
            value={slot_type || 'ai'}
            onChange={e => onChange?.({ slot_type: e.target.value })}
            style={{ width:'100%' }}
          >
            <option value="ai">AI</option>
            <option value="user_action">유저입력</option>
            <option value="system">시스템</option>
          </select>
        </label>
        <label style={{ fontSize:12 }}>
          노출
          <select
            value={is_invisible ? '1' : '0'}
            onChange={e => onChange?.({ is_invisible: e.target.value === '1' })}
            style={{ width:'100%' }}
          >
            <option value="0">보임</option>
            <option value="1">숨김(인비저블)</option>
          </select>
        </label>
      </div>
      <label style={{ fontSize:12 }}>
        보이는 슬롯(콤마) — (예: 1,2,3) 비워두면 전체
        <input
          value={visible_slots || ''}
          onChange={e => onChange?.({ visible_slots: e.target.value })}
          placeholder=""
          style={{ width:'100%' }}
        />
      </label>
    </div>
  )
}

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

  // flowNodeId → slotId(실제 DB id) 매핑
  const idMapRef = useRef(new Map())

  // ===== 초기 로드 =====
  useEffect(() => {
    if (!setId) return
    ;(async () => {
      // 세트
      const { data: setRow, error: e1 } = await supabase
        .from('prompt_sets').select('*').eq('id', setId).single()
      if (e1) { alert('세트를 불러오는 중 오류'); router.replace('/maker'); return }
      setSetInfo(setRow)

      // 슬롯
      const { data: slotRows } = await supabase
        .from('prompt_slots')
        .select('*')
        .eq('set_id', setId)
        .order('slot_no', { ascending: true })

      // 브릿지
      const { data: bridgeRows } = await supabase
        .from('prompt_bridges')
        .select('*')
        .eq('from_set', setId)
        .order('priority', { ascending: true })

      // 노드 구성
      const initNodes = (slotRows || []).map((s, idx) => {
        const nid = `n${s.id}`
        idMapRef.current.set(nid, s.id)
        const options = s.options || {}
        return {
          id: nid,
          type: 'prompt',
          position: { x: 80 + (idx % 3)*360, y: 120 + Math.floor(idx/3)*260 },
          data: {
            template: s.template || '',
            slot_type: s.slot_type || 'ai',
            slot_pick: s.slot_pick || '1',
            is_invisible: !!s.is_invisible,
            visible_slots: (options.visible_slots || []).join(','),
            manual_vars_global: options.manual_vars_global || [],
            manual_vars_local:  options.manual_vars_local  || [],
            active_vars_global: options.active_vars_global || [],
            active_vars_local:  options.active_vars_local  || [],
            onChange: (partial) => setNodes(nds => nds.map(n => n.id===nid ? { ...n, data:{ ...n.data, ...partial } } : n)),
            onDelete: handleDeletePrompt
          }
        }
      })

      // 엣지 구성
      const initEdges = (bridgeRows || []).filter(b => b.from_slot_id && b.to_slot_id).map(b => {
        const labelParts = []
        if (b.trigger_words?.length) labelParts.push(b.trigger_words.join(', '))
        if (b.conditions?.length)   labelParts.push(`cond:${b.conditions.length}`)
        if (b.probability != null && b.probability !== 1) labelParts.push(`p=${b.probability}`)
        if (b.fallback) labelParts.push('fallback')
        if (b.action && b.action !== 'continue') labelParts.push(b.action)
        return {
          id: `e${b.id}`,
          source: `n${b.from_slot_id}`,
          target: `n${b.to_slot_id}`,
          label: labelParts.join(' | '),
          data: {
            bridgeId: b.id,
            trigger_words: b.trigger_words || [],
            conditions: b.conditions || [],
            priority: b.priority ?? 0,
            probability: b.probability ?? 1.0,
            fallback: !!b.fallback,
            action: b.action || 'continue'
          }
        }
      })

      setNodes(initNodes)
      setEdges(initEdges)
      setLoading(false)
    })()
  }, [setId, router, setNodes, setEdges])

  // ===== 연결(엣지) 추가 =====
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
        slot_pick: '1',
        is_invisible: false,
        visible_slots: '',
        manual_vars_global: [],
        manual_vars_local:  [],
        active_vars_global: [],
        active_vars_local:  [],
        onChange: (partial) => setNodes(nds => nds.map(n => n.id===nid ? { ...n, data:{ ...n.data, ...partial } } : n)),
        onDelete: handleDeletePrompt
      }
    }])
    setSelectedNodeId(nid)
  }

  // 노드 삭제(+ 연결 브릿지 DB/화면 동시 삭제)
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

  // 토큰 팔레트에서 선택 노드 텍스트에 삽입
  function insertTokenToSelected(token) {
    if (!selectedNodeId) return
    setNodes(nds => nds.map(n => n.id===selectedNodeId
      ? { ...n, data:{ ...n.data, template:(n.data.template||'') + token } }
      : n))
  }

  // ===== 저장(노드/엣지) =====
  async function saveAll() {
    if (!setInfo) return

    // 1) 화면상의 노드 순서를 slot_no로 사용
    const slotNoMap = new Map()
    nodes.forEach((n, idx) => slotNoMap.set(n.id, idx + 1)) // 1..N

    // 2) 노드 저장/업데이트
    for (const n of nodes) {
      const slot_no = slotNoMap.get(n.id) || 1
      let slotId = idMapRef.current.get(n.id)

      // 옵션 JSON (variables/visibility 통합)
      const options = {
        visible_slots: (n.data.visible_slots || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
        manual_vars_global: n.data.manual_vars_global || [],
        manual_vars_local:  n.data.manual_vars_local  || [],
        active_vars_global: n.data.active_vars_global || [],
        active_vars_local:  n.data.active_vars_local  || []
      }

      if (!slotId) {
        const ins = await supabase
          .from('prompt_slots')
          .insert({
            set_id: setInfo.id,
            slot_no,
            slot_type: n.data.slot_type || 'ai',
            slot_pick: n.data.slot_pick || '1',
            template: n.data.template || '',
            is_invisible: !!n.data.is_invisible,
            options
          })
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
          .update({
            slot_no,
            slot_type: n.data.slot_type || 'ai',
            slot_pick: n.data.slot_pick || '1',
            template: n.data.template || '',
            is_invisible: !!n.data.is_invisible,
            options
          })
          .eq('id', slotId)
          .select()
          .single()

        if (upd.error) {
          alert('슬롯 업데이트 실패: ' + upd.error.message)
          console.error('prompt_slots update error', upd.error)
        }
      }
    }

    // 3) 엣지 저장/업데이트
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
      {/* 헤더바 */}
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
          <button onClick={()=>addPromptNode('ai')}           style={{ padding:'6px 10px', background:'#2563eb', color:'#fff', borderRadius:8 }}>+ 프롬프트</button>
          <button onClick={()=>addPromptNode('user_action')}  style={{ padding:'6px 10px', background:'#0ea5e9', color:'#fff', borderRadius:8 }}>+ 유저 행동</button>
          <button onClick={()=>addPromptNode('system')}       style={{ padding:'6px 10px', background:'#6b7280', color:'#fff', borderRadius:8 }}>+ 시스템</button>
          <button type="button" onClick={saveAll}             style={{ padding:'6px 10px', background:'#111827', color:'#fff', borderRadius:8 }}>저장</button>
        </div>
      </div>

      {/* 본문: Flow + 사이드패널 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px' }}>
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
