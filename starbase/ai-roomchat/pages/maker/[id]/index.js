// pages/maker/[id]/index.js
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import ReactFlow, {
  Background, Controls, MiniMap, addEdge,
  useEdgesState, useNodesState
} from 'reactflow'
import 'reactflow/dist/style.css'
import { supabase } from '../../../lib/supabase'

// 너가 쓰던 최신 컴포넌트 경로 유지
import PromptNode from '../../../components/maker/PromptNode'
import SidePanel from '../../../components/maker/SidePanel'

const nodeTypes = { prompt: PromptNode }

// ─────────────────────────────────────────────────────────────
// 유틸
function isMac() { return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform) }
function hot(e, key, { meta=true, ctrl=true } = {}) {
  if (key === 's') return (meta && (isMac() ? e.metaKey : e.ctrlKey))
  return false
}

// ─────────────────────────────────────────────────────────────
// 메인
export default function MakerEditor() {
  const router = useRouter()
  const { id: setId } = router.query

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [setInfo, setSetInfo] = useState(null)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [selectedEdge, setSelectedEdge] = useState(null)

  // flowNodeId(string) -> slot.id(uuid)
  const mapFlowToSlot = useRef(new Map())
  // UI 상태
  const [quickSlot, setQuickSlot] = useState('1')
  const [quickProp, setQuickProp] = useState('name')
  const [quickAbility, setQuickAbility] = useState('1')

  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  // ───────────────────────────────────────────────────────────
  // 초기 로드
  useEffect(() => {
    if (!setId) return
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }

      const { data: setRow, error: e1 } = await supabase.from('prompt_sets').select('*').eq('id', setId).single()
      if (e1 || !setRow) { alert('세트를 불러오지 못했습니다.'); router.replace('/maker'); return }
      setSetInfo(setRow)

      const { data: slotRows } = await supabase
        .from('prompt_slots')
        .select('*')
        .eq('set_id', setId)
        .order('slot_no', { ascending: true })

      const { data: bridgeRows } = await supabase
        .from('prompt_bridges')
        .select('*')
        .eq('from_set', setId)
        .order('priority', { ascending: false })

      const initNodes = (slotRows || []).map((s, idx) => {
        const nid = `n${s.id}`
        mapFlowToSlot.current.set(nid, s.id)
        return {
          id: nid,
          type: 'prompt',
          position: {
            x: 120 + (idx % 3) * 380,
            y: 120 + Math.floor(idx / 3) * 260
          },
          data: {
            template: s.template || '',
            slot_type: s.slot_type || 'ai',      // 'ai' | 'user_action' | 'system'
            slot_pick: s.slot_pick || '1',
            isStart: !!s.is_start,
            invisible: !!s.invisible,
            var_rules_global: s.var_rules_global || [],
            var_rules_local: s.var_rules_local || [],
            // PromptNode 콜백 연결
            onChange: (partial) => setNodes(nds => nds.map(n => n.id === nid ? { ...n, data: { ...n.data, ...partial } } : n)),
            onDelete: handleDeletePrompt,
            onSetStart: () => markAsStart(nid),
          }
        }
      })

      const initEdges = (bridgeRows || [])
        .filter(b => b.from_slot_id && b.to_slot_id)
        .map(b => {
          const lab = buildEdgeLabel(b)
          return {
            id: `e${b.id}`,
            source: `n${b.from_slot_id}`,
            target: `n${b.to_slot_id}`,
            label: lab,
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

  // ───────────────────────────────────────────────────────────
  // 엣지 라벨 생성(조건 요약)
  const rebuildEdgeLabel = useCallback((data) => {
    const parts = []
    const conds = data?.conditions || []
    conds.forEach(c => {
      if (c?.type === 'turn_gte' && (c.value ?? c.gte) != null) parts.push(`턴 ≥ ${c.value ?? c.gte}`)
      if (c?.type === 'turn_lte' && (c.value ?? c.lte) != null) parts.push(`턴 ≤ ${c.value ?? c.lte}`)
      if (c?.type === 'prev_ai_contains') parts.push(`이전응답 "${c.value}"`)
      if (c?.type === 'prev_prompt_contains') parts.push(`이전프롬프트 "${c.value}"`)
      if (c?.type === 'prev_ai_regex') parts.push(`이전응답 /${c.pattern}/${c.flags || ''}`)
      if (c?.type === 'visited_slot') parts.push(`경유 #${c.slot_id ?? '?'}`)
      if (c?.type === 'role_alive_gte') parts.push(`[${c.role}] 생존≥${c.count}`)
      if (c?.type === 'role_dead_gte') parts.push(`[${c.role}] 탈락≥${c.count}`)
      if (c?.type === 'custom_flag_on') parts.push(`변수:${c.name}=ON`)
      if (c?.type === 'fallback') parts.push('Fallback')
    })
    if (data?.probability != null && data.probability !== 1) parts.push(`확률 ${Math.round(Number(data.probability) * 100)}%`)
    if (data?.action && data.action !== 'continue') parts.push(`→ ${data.action}`)
    return parts.join(' | ')
  }, [])

  function buildEdgeLabel(b) { return rebuildEdgeLabel(b) }

  // ───────────────────────────────────────────────────────────
  // ReactFlow 이벤트(노드/엣지 생성·삭제·선택·연결)
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

  const onNodeClick = useCallback((_, node) => {
    setSelectedNodeId(node.id)
    setSelectedEdge(null)
  }, [])

  const onEdgeClick = useCallback((_, edge) => {
    setSelectedEdge(edge)
    setSelectedNodeId(null)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedEdge(null)
  }, [])

  // 선택 변화(드래그 박스 등)
  const onSelectionChange = useCallback(({ nodes: nSel, edges: eSel }) => {
    if (nSel?.length) {
      setSelectedNodeId(nSel[0].id)
      setSelectedEdge(null)
    } else if (eSel?.length) {
      setSelectedEdge(eSel[0])
      setSelectedNodeId(null)
    } else {
      setSelectedNodeId(null)
      setSelectedEdge(null)
    }
  }, [])

  // 삭제(키보드/컨텍스트) 시 DB 동기 삭제
  const onNodesDelete = useCallback(async (deleted) => {
    for (const dn of deleted) {
      const slotId = mapFlowToSlot.current.get(dn.id)
      if (slotId) {
        await supabase.from('prompt_bridges').delete().or(`from_slot_id.eq.${slotId},to_slot_id.eq.${slotId}`)
        await supabase.from('prompt_slots').delete().eq('id', slotId)
        mapFlowToSlot.current.delete(dn.id)
      }
    }
  }, [])

  const onEdgesDelete = useCallback(async (deleted) => {
    for (const de of deleted) {
      const id = de?.data?.bridgeId
      if (id) await supabase.from('prompt_bridges').delete().eq('id', id)
    }
  }, [])

  // 키보드 쇼트컷: ⌘/Ctrl+S 저장, Delete 삭제
  useEffect(() => {
    function onKey(e) {
      // Save
      if (hot(e, 's')) {
        e.preventDefault()
        saveAll()
        return
      }
      // Delete: 선택된 노드/엣지 삭제
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          handleDeletePrompt(selectedNodeId)
        } else if (selectedEdge) {
          // 화면/DB 동시 삭제
          setEdges(eds => eds.filter(x => x.id !== selectedEdge.id))
          const bid = selectedEdge?.data?.bridgeId
          if (bid) supabase.from('prompt_bridges').delete().eq('id', bid)
          setSelectedEdge(null)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNodeId, selectedEdge]) // eslint-disable-line

  // ───────────────────────────────────────────────────────────
  // 빠른 조작: 시작지정/Invisible/토큰삽입
  function markAsStart(flowNodeId) {
    setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, isStart: n.id === flowNodeId } })))
  }

  function toggleInvisible() {
    if (!selectedNodeId) return
    setNodes(nds => nds.map(n =>
      n.id === selectedNodeId ? ({ ...n, data: { ...n.data, invisible: !n.data.invisible } }) : n
    ))
  }

  function insertQuickToken() {
    if (!selectedNodeId) return
    const token = quickProp === 'ability'
      ? `{{slot${quickSlot}.ability${quickAbility}}}`
      : `{{slot${quickSlot}.${quickProp}}}`
    setNodes(nds => nds.map(n =>
      n.id === selectedNodeId ? ({ ...n, data: { ...n.data, template: (n.data.template || '') + token } }) : n
    ))
  }

  function insertHistoryToken(kind) {
    if (!selectedNodeId) return
    const token = kind === 'last1' ? '{{history.last1}}'
      : kind === 'last2' ? '{{history.last2}}'
      : '{{history.last5}}'
    setNodes(nds => nds.map(n =>
      n.id === selectedNodeId ? ({ ...n, data: { ...n.data, template: (n.data.template || '') + token } }) : n
    ))
  }

  // ───────────────────────────────────────────────────────────
  // 노드 추가/삭제
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

  async function handleDeletePrompt(flowNodeId) {
    setNodes(nds => nds.filter(n => n.id !== flowNodeId))
    setEdges(eds => eds.filter(e => e.source !== flowNodeId && e.target !== flowNodeId))
    setSelectedNodeId(null)
    const slotId = mapFlowToSlot.current.get(flowNodeId)
    if (slotId) {
      await supabase.from('prompt_bridges').delete().or(`from_slot_id.eq.${slotId},to_slot_id.eq.${slotId}`)
      await supabase.from('prompt_slots').delete().eq('id', slotId)
      mapFlowToSlot.current.delete(flowNodeId)
    }
  }

  // ───────────────────────────────────────────────────────────
  // 저장(Upsert)
  async function saveAll() {
    if (!setInfo || busy) return
    setBusy(true)
    try {
      // 1) slot_no 재부여(화면 순서)
      const slotNo = new Map()
      nodes.forEach((n, i) => slotNo.set(n.id, i + 1))

      // 2) 슬롯 저장/업데이트
      for (const n of nodes) {
        const slot_no = slotNo.get(n.id) || 1
        let slotId = mapFlowToSlot.current.get(n.id)

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
          if (ins.error || !ins.data) { console.error(ins.error); continue }
          slotId = ins.data.id
          mapFlowToSlot.current.set(n.id, slotId)
        } else {
          await supabase.from('prompt_slots').update(payload).eq('id', slotId)
        }
      }

      // 3) 브릿지 저장/동기화
      const { data: old } = await supabase
        .from('prompt_bridges')
        .select('id')
        .eq('from_set', setInfo.id)
      const keep = new Set()

      for (const e of edges) {
        const fromId = mapFlowToSlot.current.get(e.source)
        const toId = mapFlowToSlot.current.get(e.target)
        if (!fromId || !toId) continue

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

        let bridgeId = e.data?.bridgeId
        if (!bridgeId) {
          const ins = await supabase.from('prompt_bridges').insert(payload).select().single()
          if (ins.error || !ins.data) { console.error(ins.error); continue }
          bridgeId = ins.data.id
          e.data = { ...(e.data || {}), bridgeId }
        } else {
          await supabase.from('prompt_bridges').update(payload).eq('id', bridgeId)
        }
        keep.add(bridgeId)
      }

      for (const ob of (old || [])) {
        if (!keep.has(ob.id)) await supabase.from('prompt_bridges').delete().eq('id', ob.id)
      }

      alert('저장 완료')
    } finally {
      setBusy(false)
    }
  }

  // ───────────────────────────────────────────────────────────
  // 상단 툴바의 “퀵 빌더” 블록
  const quickTokenLabel = useMemo(() => {
    if (quickProp === 'ability') return `{{slot${quickSlot}.ability${quickAbility}}}`
    return `{{slot${quickSlot}.${quickProp}}}`
  }, [quickSlot, quickProp, quickAbility])

  if (loading) return <div style={{ padding: 20 }}>불러오는 중…</div>

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: 'auto auto 1fr' }}>
      {/* 상단 바 1: 네비/세트명/저장 */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50, background: '#fff',
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
          <button type="button" onClick={saveAll} disabled={busy} style={{ padding: '6px 10px', background: '#111827', color: '#fff', borderRadius: 8 }}>
            {busy ? '저장 중…' : '저장 (⌘/Ctrl+S)'}
          </button>
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

      {/* 상단 바 2: 선택 노드용 퀵 빌더(토큰/플래그/히스토리) */}
      <div style={{
        position: 'sticky', top: 52, zIndex: 45, background: '#f8fafc',
        padding: 8, borderBottom: '1px solid #e5e7eb',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>퀵 토큰</span>
          <select value={quickSlot} onChange={e => setQuickSlot(e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>슬롯{i+1}</option>)}
          </select>
          <select value={quickProp} onChange={e => setQuickProp(e.target.value)}>
            <option value="name">이름</option>
            <option value="description">설명</option>
            <option value="ability">능력</option>
          </select>
          {quickProp === 'ability' &&
            <select value={quickAbility} onChange={e => setQuickAbility(e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>능력{i+1}</option>)}
            </select>
          }
          <button onClick={insertQuickToken} disabled={!selectedNodeId} style={{ padding: '6px 10px' }}>
            {quickTokenLabel} 삽입
          </button>
          <button onClick={() => insertHistoryToken('last1')} disabled={!selectedNodeId} style={{ padding: '6px 10px' }}>{{/**/}}history.last1{{/**/}} 삽입</button>
          <button onClick={() => insertHistoryToken('last2')} disabled={!selectedNodeId} style={{ padding: '6px 10px' }}>history.last2 삽입</button>
          <button onClick={() => insertHistoryToken('last5')} disabled={!selectedNodeId} style={{ padding: '6px 10px' }}>history.last5 삽입</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>선택 노드</span>
          <button onClick={() => selectedNodeId && markAsStart(selectedNodeId)} disabled={!selectedNodeId} style={{ padding: '6px 10px' }}>시작 지정</button>
          <button onClick={toggleInvisible} disabled={!selectedNodeId} style={{ padding: '6px 10px' }}>Invisible 토글</button>
          <button onClick={() => selectedNodeId && handleDeletePrompt(selectedNodeId)} disabled={!selectedNodeId} style={{ padding: '6px 10px', color: '#ef4444' }}>삭제</button>
        </div>
      </div>

      {/* 본문: 플로우 + 사이드패널 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px' }}>
        <div style={{ position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onSelectionChange={onSelectionChange}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
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
          onInsertToken={(t) => {
            if (!selectedNodeId) return
            setNodes(nds => nds.map(n =>
              n.id === selectedNodeId ? ({ ...n, data: { ...n.data, template: (n.data.template || '') + t } }) : n
            ))
          }}
          rebuildEdgeLabel={rebuildEdgeLabel}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 내보내기/가져오기 - 컴포넌트 외부에 둬서 호이스팅 걱정 없이 사용
async function exportSet() {
  // 런타임에서 setInfo를 못 보니, 버튼 클릭 시 DOM에서 setId를 추출하거나
  // 간단히 location.pathname으로 id를 얻는다.
  const m = (typeof window !== 'undefined' ? window.location.pathname : '').match(/\/maker\/([^/]+)/)
  const setId = m?.[1]
  if (!setId) return alert('세트 ID를 파싱하지 못했습니다.')

  const [setRow, slots, bridges] = await Promise.all([
    supabase.from('prompt_sets').select('*').eq('id', setId).single(),
    supabase.from('prompt_slots').select('*').eq('set_id', setId).order('slot_no'),
    supabase.from('prompt_bridges').select('*').eq('from_set', setId),
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
  const { data: newSet } = await supabase.from('prompt_sets')
    .insert({ name: json.set?.name || '가져온 세트', owner_id: user.id })
    .select().single()

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
        from_slot_id: null,
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
  window.location.assign(`/maker/${newSet.id}`)
}
