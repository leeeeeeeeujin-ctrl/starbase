// pages/maker/[id].js
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import ReactFlow, {
  Background, Controls, MiniMap, addEdge,
  useEdgesState, useNodesState, Handle, Position
} from 'reactflow'
import 'reactflow/dist/style.css'
import { supabase } from '../../lib/supabase'

const edgeDefault = { type: 'default', animated: false }

function TokenPalette({ onInsert }) {
  const [slot, setSlot] = useState('1')
  const [prop, setProp] = useState('name')
  const [ability, setAbility] = useState('1')

  const token = useMemo(() => {
    if (prop === 'ability') return `{{slot${slot}.ability${ability}}}`
    return `{{slot${slot}.${prop}}}`
  }, [slot, prop, ability])

  return (
    <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
      <select value={slot} onChange={e=>setSlot(e.target.value)} style={{ padding:6 }}>
        {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>슬롯{i+1}</option>)}
      </select>
      <select value={prop} onChange={e=>setProp(e.target.value)} style={{ padding:6 }}>
        <option value="name">이름</option>
        <option value="description">설명</option>
        <option value="ability">능력</option>
      </select>
      {prop==='ability' && (
        <select value={ability} onChange={e=>setAbility(e.target.value)} style={{ padding:6 }}>
          {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>능력{i+1}</option>)}
        </select>
      )}
      <button onClick={()=>onInsert(token)} style={{ padding:'6px 10px', borderRadius:8, background:'#e5e7eb' }}>토큰 삽입</button>
      <span style={{ fontSize:12, color:'#64748b' }}>{token}</span>
      <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
        <button onClick={()=>onInsert('{{slot.random}}')} style={{ padding:'6px 10px', borderRadius:8, background:'#f3f4f6' }}>랜덤 슬롯</button>
        <button onClick={()=>onInsert('{{random.slot.name}}')} style={{ padding:'6px 10px', borderRadius:8, background:'#f3f4f6' }}>랜덤 슬롯 이름</button>
        <button onClick={()=>onInsert('{{random.choice:A|B|C}}')} style={{ padding:'6px 10px', borderRadius:8, background:'#f3f4f6' }}>임의 선택</button>
        <button onClick={()=>onInsert('{{history.last1}}')} style={{ padding:'6px 10px', borderRadius:8, background:'#f3f4f6' }}>마지막 줄</button>
        <button onClick={()=>onInsert('{{history.last2}}')} style={{ padding:'6px 10px', borderRadius:8, background:'#f3f4f6' }}>마지막 2줄</button>
      </div>
    </div>
  )
}

function PromptNode({ data }) {
  return (
    <div style={{ width:320, background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, boxShadow:'0 1px 2px rgba(0,0,0,0.04)' }}>
      {/* 타겟 핸들(왼쪽) */}
      <Handle type="target" position={Position.Left} />
      <div style={{ padding:'8px 10px', borderBottom:'1px solid #e5e7eb', fontWeight:700, background:'#f9fafb' }}>
        프롬프트
      </div>
      <textarea
        value={data.template || ''}
        placeholder="여기에 템플릿을 입력하세요"
        onChange={(e)=>data.onChange && data.onChange({ template: e.target.value })}
        onBlur={(e)=>data.onBlur && data.onBlur()}
        rows={8}
        style={{ width:'100%', padding:10, border:'none', outline:'none', resize:'vertical', borderRadius:'0 0 12px 12px' }}
      />
      {/* 소스 핸들(오른쪽) */}
      <Handle type="source" position={Position.Right} />
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

  const [selectedEdge, setSelectedEdge] = useState(null)
  const [edgeForm, setEdgeForm] = useState({ trigger_words:'', action:'continue' })
  const [selectedNodeId, setSelectedNodeId] = useState(null)

  // flowNodeId -> slotId(DB) 매핑
  const idMapRef = useRef(new Map())

  useEffect(() => {
    if (!setId) return
    ;(async () => {
      const { data: setRow, error: setErr } = await supabase.from('prompt_sets').select('*').eq('id', setId).single()
      if (setErr) { alert(setErr.message); router.push('/maker'); return }
      setSetInfo(setRow)

      const { data: slotRows } = await supabase.from('prompt_slots').select('*').eq('set_id', setId).order('created_at', { ascending: true })
      const { data: bridgeRows } = await supabase.from('prompt_bridges').select('*').eq('from_set', setId).order('created_at', { ascending: true })

      const initNodes = (slotRows || []).map((s, idx) => {
        const nid = `n${s.id}`
        idMapRef.current.set(nid, s.id)
        return {
          id: nid,
          type: 'prompt',
          position: { x: 80 + (idx % 4)*360, y: 120 + Math.floor(idx/4)*240 },
          data: {
            template: s.template || '',
            onChange: (partial) => {
              setNodes(nds => nds.map(n => n.id===nid ? { ...n, data: { ...n.data, ...partial } } : n))
            },
            onBlur: () => { /* 필요하면 포커스 아웃 시 추가 처리 */ }
          }
        }
      })

      const initEdges = (bridgeRows || [])
        .filter(b => b.from_slot_id && b.to_slot_id)
        .map((b) => ({
          id: `e${b.id}`,
          source: `n${b.from_slot_id}`,
          target: `n${b.to_slot_id}`,
          label: (b.trigger_words || []).join(', ') + (b.action && b.action!=='continue' ? ` | ${b.action}` : ''),
          data: { bridgeId: b.id, trigger_words: b.trigger_words || [], action: b.action || 'continue' }
        }))

      setNodes(initNodes)
      setEdges(initEdges)
      setLoading(false)
    })()
  }, [setId, router, setNodes, setEdges])

  // 새 엣지 연결(화면에만 추가; 저장 시 DB 반영)
  const onConnect = useCallback((params) => {
    setEdges(eds => addEdge({ ...params, ...edgeDefault, data: { trigger_words: [], action:'continue' } }, eds))
  }, [setEdges])

  const onEdgeClick = useCallback((_, edge) => {
    setSelectedEdge(edge)
    setEdgeForm({
      trigger_words: (edge.data?.trigger_words || []).join(','),
      action: edge.data?.action || 'continue'
    })
  }, [])

  // 노드 선택 → 토큰 삽입 대상 고정
  const onNodeClick = useCallback((_, node) => {
    setSelectedNodeId(node.id)
    setSelectedEdge(null) // 엣지 선택 해제
  }, [])

  // 팔레트에서 “토큰 삽입” 누르면 → 선택 노드 템플릿에 append
  function insertTokenToSelected(token) {
    if (!selectedNodeId) return
    setNodes(nds => nds.map(n => {
      if (n.id !== selectedNodeId) return n
      const prev = n.data?.template || ''
      return { ...n, data: { ...n.data, template: prev + token } }
    }))
  }

  async function addPromptNode() {
    const nid = `tmp_${Date.now()}`
    setNodes(nds => [...nds, {
      id: nid,
      type: 'prompt',
      position: { x: 80, y: 80 },
      data: {
        template: '',
        onChange: (partial) => setNodes(nds => nds.map(n => n.id===nid ? { ...n, data:{ ...n.data, ...partial } } : n)),
        onBlur: () => {}
      }
    }])
    setSelectedNodeId(nid)
  }

  async function deleteSelected() {
    if (selectedEdge) {
      if (selectedEdge.data?.bridgeId) {
        await supabase.from('prompt_bridges').delete().eq('id', selectedEdge.data.bridgeId)
      }
      setEdges(eds => eds.filter(e => e.id !== selectedEdge.id))
      setSelectedEdge(null)
      return
    }
    // (선택된 노드 삭제까지 구현하려면 onSelectionChange 등으로 확장 가능)
  }

  async function saveAll() {
    if (!setInfo) return

    // 1) 노드 업서트
    for (const n of nodes) {
      let slotId = idMapRef.current.get(n.id)
      if (!slotId) {
        const ins = await supabase.from('prompt_slots')
          .insert({ set_id: setInfo.id, slot_type:'custom', slot_pick:'1', template: n.data.template || '' })
          .select().single()
        if (ins.error) { alert(ins.error.message); return }
        slotId = ins.data.id
        idMapRef.current.set(n.id, slotId)
      } else {
        const up = await supabase.from('prompt_slots').update({ template: n.data.template || '' }).eq('id', slotId)
        if (up.error) { alert(up.error.message); return }
      }
    }

    // 2) 엣지 업서트
    const { data: oldBridges, error: oldErr } = await supabase
      .from('prompt_bridges').select('id').eq('from_set', setInfo.id)
    if (oldErr) { alert(oldErr.message); return }
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
        trigger_words: (e.data?.trigger_words || []).map(s=>String(s)),
        action: e.data?.action || 'continue'
      }
      if (!bridgeId) {
        const ins = await supabase.from('prompt_bridges').insert(payload).select().single()
        if (ins.error) { alert(ins.error.message); return }
        bridgeId = ins.data.id
        e.data = { ...(e.data||{}), bridgeId }
      } else {
        const up = await supabase.from('prompt_bridges').update(payload).eq('id', bridgeId)
        if (up.error) { alert(up.error.message); return }
      }
      keep.add(bridgeId)
    }

    // 3) 화면에 없는 브릿지 삭제
    for (const ob of (oldBridges || [])) {
      if (!keep.has(ob.id)) {
        const del = await supabase.from('prompt_bridges').delete().eq('id', ob.id)
        if (del.error) { alert(del.error.message); return }
      }
    }

    alert('저장 완료')
  }

  function applyEdgeForm() {
    if (!selectedEdge) return
    const trigger_words = edgeForm.trigger_words.split(',').map(s=>s.trim()).filter(Boolean)
    const action = edgeForm.action
    setEdges(eds => eds.map(e => e.id===selectedEdge.id
      ? { ...e,
          label: (trigger_words.join(', ') + (action!=='continue' ? ` | ${action}` : '')),
          data:{ ...(e.data||{}), trigger_words, action }
        }
      : e
    ))
  }

  if (loading) return <div style={{ padding:20 }}>불러오는 중…</div>

  return (
    <div style={{ height:'100vh', display:'grid', gridTemplateRows:'auto 1fr' }}>
      {/* 상단 바 */}
      <div style={{ padding:10, borderBottom:'1px solid #e5e7eb', display:'grid', gridTemplateColumns:'1fr auto auto', gap:8, alignItems:'center' }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={()=>router.push('/maker')} style={{ padding:'6px 10px', borderRadius:8, background:'#e5e7eb' }}>← 목록</button>
          <div style={{ fontWeight:800 }}>{setInfo?.name}</div>
        </div>
        <TokenPalette onInsert={insertTokenToSelected} />
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={addPromptNode} style={{ padding:'6px 10px', borderRadius:8, background:'#2563eb', color:'#fff' }}>+ 프롬프트</button>
          <button onClick={deleteSelected} disabled={!selectedEdge} style={{ padding:'6px 10px', borderRadius:8, background:'#ef4444', color:'#fff', opacity: selectedEdge?1:0.5 }}>
            선택 삭제
          </button>
          <button onClick={saveAll} style={{ padding:'6px 10px', borderRadius:8, background:'#111827', color:'#fff' }}>저장</button>
        </div>
      </div>

      {/* 에디터 + 우측 패널 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px' }}>
        <div>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            onNodeClick={onNodeClick}
            fitView
          >
            <MiniMap />
            <Controls />
            <Background />
          </ReactFlow>
        </div>

        {/* 엣지(브릿지) 속성 패널 */}
        <div style={{ borderLeft:'1px solid #e5e7eb', padding:12 }}>
          <h3 style={{ marginTop:0 }}>브릿지(엣지) 설정</h3>
          {!selectedEdge ? (
            <div style={{ color:'#64748b' }}>엣지를 클릭하면 여기서 조건을 편집할 수 있어요.</div>
          ) : (
            <>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:8 }}>
                From <b>{selectedEdge.source}</b> → To <b>{selectedEdge.target}</b>
              </div>
              <label style={{ fontSize:12 }}>트리거 단어(쉼표로 구분)</label>
              <input
                value={edgeForm.trigger_words}
                onChange={e=>setEdgeForm(f=>({ ...f, trigger_words: e.target.value }))}
                style={{ width:'100%', padding:8, border:'1px solid #e5e7eb', borderRadius:8, margin:'4px 0 10px' }}
              />
              <label style={{ fontSize:12 }}>액션</label>
              <select
                value={edgeForm.action}
                onChange={e=>setEdgeForm(f=>({ ...f, action: e.target.value }))}
                style={{ width:'100%', padding:8, border:'1px solid #e5e7eb', borderRadius:8, margin:'4px 0 10px' }}
              >
                <option value="continue">일반 진행</option>
                <option value="win">승리</option>
                <option value="lose">패배</option>
                <option value="goto_set">다른 세트로 이동(후속 확장)</option>
              </select>
              <button
                onClick={applyEdgeForm}
                disabled={!selectedEdge}
                style={{ padding:'8px 12px', borderRadius:8, background:'#2563eb', color:'#fff', fontWeight:700, opacity: selectedEdge?1:0.5 }}
              >
                엣지 라벨 반영
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
