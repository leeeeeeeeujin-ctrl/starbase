// pages/maker/[id]/index.js
'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import ReactFlow, { Background, Controls, MiniMap, addEdge, useEdgesState, useNodesState } from 'reactflow'
import 'reactflow/dist/style.css'
import { supabase } from '../../../lib/supabase'

// 최신 컴포넌트 경로에 맞춰 조정하세요.
import PromptNode from '../../../components/maker/PromptNode'
import SidePanel from '../../../components/maker/SidePanel'

const nodeTypes = { prompt: PromptNode }

export default function MakerEditor() {
  const router = useRouter()
  const { id: setId } = router.query

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [setInfo, setSetInfo] = useState(null)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)

  // flowNodeId(string) -> slot.id(uuid)
  const idMapRef = useRef(new Map())

  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  // ===== 초기 로드 =====
  useEffect(() => {
    if (!setId) return
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }

      // 세트
      const { data: setRow, error: e1 } = await supabase.from('prompt_sets').select('*').eq('id', setId).single()
      if (e1 || !setRow) { alert('세트를 불러오지 못했습니다.'); router.replace('/maker'); return }
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
        .order('priority', { ascending: false })

      // 화면 노드 구성
      const initNodes = (slotRows || []).map((s, idx) => {
        const nid = `n${s.id}`
        idMapRef.current.set(nid, s.id)
        return {
          id: nid,
          type: 'prompt',
          position: { x: 120 + (idx % 3) * 380, y: 120 + Math.floor(idx / 3) * 260 },
          data: {
            template: s.template || '',
            slot_type: s.slot_type || 'ai',
            slot_pick: s.slot_pick || '1',
            isStart: !!s.is_start,
            invisible: !!s.invisible,
            var_rules_global: s.var_rules_global || [],
            var_rules_local: s.var_rules_local || [],

            // PromptNode가 호출할 핸들러들
            onChange: (partial) => setNodes(nds => nds.map(n => n.id === nid ? { ...n, data: { ...n.data, ...partial } } : n)),
            onDelete: handleDeletePrompt,
            onSetStart: () => markAsStart(nid),
          }
        }
      })

      // 화면 간선 구성
      const initEdges = (bridgeRows || [])
        .filter(b => b.from_slot_id && b.to_slot_id)
        .map(b => {
          const labelParts = []
          const conds = b.conditions || []
          conds.forEach(c => {
            if (c?.type === 'turn_gte' && (c.value ?? c.gte) != null) labelParts.push(`턴 ≥ ${c.value ?? c.gte}`)
            if (c?.type === 'turn_lte' && (c.value ?? c.lte) != null) labelParts.push(`턴 ≤ ${c.value ?? c.lte}`)
            if (c?.type === 'prev_ai_contains') labelParts.push(`이전응답 "${c.value}"`)
            if (c?.type === 'prev_prompt_contains') labelParts.push(`이전프롬프트 "${c.value}"`)
            if (c?.type === 'prev_ai_regex') labelParts.push(`이전응답 /${c.pattern}/${c.flags || ''}`)
            if (c?.type === 'visited_slot') labelParts.push(`경유 #${c.slot_id ?? '?'}`)
            if (c?.type === 'role_alive_gte') labelParts.push(`[${c.role}] 생존≥${c.count}`)
            if (c?.type === 'role_dead_gte') labelParts.push(`[${c.role}] 탈락≥${c.count}`)
            if (c?.type === 'custom_flag_on') labelParts.push(`변수:${c.name}=ON`)
            if (c?.type === 'fallback') labelParts.push('Fallback')
          })
          if (b.probability != null && b.probability !== 1) labelParts.push(`확률 ${Math.round(Number(b.probability) * 100)}%`)
          if (b.action && b.action !== 'continue') labelParts.push(`→ ${b.action}`)

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
              action: b.action || 'continue',
            }
          }
        })

      setNodes(initNodes)
      setEdges(initEdges)
      setLoading(false)
    })()
  }, [setId, router, setNodes, setEdges])

  // ===== 연결 생성 =====
  const onConnect = useCallback((params) => {
    setEdges(eds =>
      addEdge({
        ...params,
        type: 'default',
        animated: false,
        data: { trigger_words: [], conditions: [], priority: 0, probability: 1.0, fallback: false, action: 'continue' }
      }, eds)
    )
  }, [setEdges])

  // ===== 선택 이벤트 =====
  const onNodeClick = useCallback((_, node) => { setSelectedNodeId(node.id); setSelectedEdge(null) }, [])
  const onEdgeClick = useCallback((_, edge) => { setSelectedEdge(edge); setSelectedNodeId(null) }, [])

  // ===== 토큰 삽입(선택 노드 템플릿 뒤에 append) =====
  function insertTokenToSelected(token) {
    if (!selectedNodeId) return
    setNodes(nds => nds.map(n =>
      n.id === selectedNodeId ? { ...n, data: { ...n.data, template: (n.data.template || '') + token } } : n
    ))
  }

  // ===== 노드 추가 =====
  function addPromptNode(type = 'ai') {
    const nid = `tmp_${Date.now()}`
    setNodes(nds => [...nds, {
      id: nid,
      type: 'prompt',
      position: { x: 160, y: 120 },
      data: {
        template: '',
        slot_type: type,         // 'ai' | 'user_action' | 'system'
        slot_pick: '1',
        isStart: false,
        invisible: false,
        var_rules_global: [],
        var_rules_local: [],
        onChange: (partial) => setNodes(nds => nds.map(n => n.id === nid ? { ...n, data: { ...n.data, ...partial } } : n)),
        onDelete: handleDeletePrompt,
        onSetStart: () => markAsStart(nid),
      }
    }])
    setSelectedNodeId(nid)
  }

  // 시작지점 지정(단 하나만 true)
  function markAsStart(flowNodeId) {
    setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, isStart: n.id === flowNodeId } })))
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

  // ===== 저장(노드/엣지 upsert) =====
  async function saveAll() {
    if (!setInfo) return

    // 1) 화면 노드 순서 → slot_no
    const slotNoMap = new Map()
    nodes.forEach((n, idx) => slotNoMap.set(n.id, idx + 1)) // 1..N

    // 2) 노드 저장/업데이트
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
        invisible: !!n.data.invisible,
        var_rules_global: n.data.var_rules_global || [],
        var_rules_local: n.data.var_rules_local || [],
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

    // 3) 간선 저장/업데이트
    const { data: oldBridges } = await supabase
      .from('prompt_bridges')
      .select('id')
      .eq('from_set', setInfo.id)

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
        action: e.data?.action || 'continue',
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

  // ===== 내보내기/가져오기 =====
  async function exportSet() {
    if (!setInfo) return
    const [setRow, slots, bridges] = await Promise.all([
      supabase.from('prompt_sets').select('*').eq('id', setInfo.id).single(),
      supabase.from('prompt_slots').select('*').eq('set_id', setInfo.id).order('slot_no'),
      supabase.from('prompt_bridges').select('*').eq('from_set', setInfo.id),
    ])
    const payload = { set: setRow.data, slots: slots.data || [], bridges: bridges.data || [] }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `promptset-${setRow.data?.name || 'export'}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importSet(e) {
    const file = e.target.files?.[0]; if (!file) return
    const text = await file.text()
    const json = JSON.parse(text)
    const { data: { user } } = await supabase.auth.getUser()
    // 새 세트 생성
    const { data: newSet } = await supabase.from('prompt_sets')
      .insert({ name: json.set?.name || '가져온 세트', owner_id: user.id })
      .select().single()
    // 슬롯/브릿지 삽입
    if (json.slots?.length) {
      await supabase.from('prompt_slots').insert(
        json.slots.map(s => ({
          set_id: newSet.id,
          slot_no: s.slot_no ?? 1,
          slot_type: s.slot_type ?? 'ai',
          slot_pick: s.slot_pick ?? '1',
          template: s.template ?? '',
          is_start: !!s.is_start,
          invisible: !!s.invisible,
          var_rules_global: s.var_rules_global ?? [],
          var_rules_local: s.var_rules_local ?? [],
        }))
      )
    }
    if (json.bridges?.length) {
      await supabase.from('prompt_bridges').insert(
        json.bridges.map(b => ({
          from_set: newSet.id,
          from_slot_id: null, // 연결은 가져온 뒤 수동 수정 필요
          to_slot_id: null,
          trigger_words: b.trigger_words ?? [],
          conditions: b.conditions ?? [],
          priority: b.priority ?? 0,
          probability: b.probability ?? 1.0,
          fallback: b.fallback ?? false,
          action: b.action ?? 'continue',
        }))
      )
    }
    e.target.value = ''
    router.replace(`/maker/${newSet.id}`)
  }

  if (loading) return <div style={{ padding: 20 }}>불러오는 중…</div>

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      {/* 상단 바 */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40, background: '#fff',
        padding: 10, borderBottom: '1px solid #e5e7eb',
        display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/maker')} style={{ padding: '6px 10px' }}>← 목록</button>
          <b style={{ marginLeft: 4 }}>{setInfo?.name}</b>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => addPromptNode('ai')} style={{ padding: '6px 10px', background: '#2563eb', color: '#fff', borderRadius: 8 }}>+ 프롬프트</button>
          <button onClick={() => addPromptNode('user_action')} style={{ padding: '6px 10px', background: '#0ea5e9', color: '#fff', borderRadius: 8 }}>+ 유저 행동</button>
          <button onClick={() => addPromptNode('system')} style={{ padding: '6px 10px', background: '#6b7280', color: '#fff', borderRadius: 8 }}>+ 시스템</button>
          <button type="button" onClick={saveAll} style={{ padding: '6px 10px', background: '#111827', color: '#fff', borderRadius: 8 }}>저장</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportSet} style={{ padding: '6px 10px' }}>내보내기</button>
          <label style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer' }}>
            가져오기
            <input type="file" accept="application/json" onChange={importSet} style={{ display: 'none' }} />
          </label>
          <button onClick={() => router.push('/rank')} style={{ padding: '6px 10px' }}>로비로</button>
        </div>
      </div>

      {/* 본문: 캔버스 + 사이드 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px' }}>
        <div style={{ position: 'relative', zIndex: 0 }}>
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
