// components/maker/SidePanel.js
// 선택된 노드/엣지에 따라 편집 패널 표시
// - 노드: 토큰 팔레트 등
// - 엣지: 조건 빌더, 트리거 단어, 우선순위/확률/fallback/액션

import { useEffect, useState } from 'react';
import ConditionBuilder from './ConditionBuilder';
import TokenPalette from './TokenPalette';

/* =========================
 *  사이드 패널 본체
 * ========================= */
export default function SidePanel({
  selectedNodeId,
  selectedEdge,
  setEdges,
  setNodes,
  onInsertToken,
}) {
  const [edgeForm, setEdgeForm] = useState({
    trigger_words: '',
    conditions: '[]',
    priority: 0,
    probability: 1.0,
    fallback: false,
    action: 'continue',
  });

  useEffect(() => {
    if (!selectedEdge) return;
    setEdgeForm({
      trigger_words: (selectedEdge.data?.trigger_words || []).join(','),
      conditions: JSON.stringify(selectedEdge.data?.conditions || []),
      priority: selectedEdge.data?.priority ?? 0,
      probability: selectedEdge.data?.probability ?? 1.0,
      fallback: !!selectedEdge.data?.fallback,
      action: selectedEdge.data?.action || 'continue',
    });
  }, [selectedEdge]);

  // 라벨 재생성
  function rebuildLabel(data) {
    const parts = [];
    const conds = data?.conditions || [];
    conds.forEach(c => {
      if (c?.type === 'turn_gte') parts.push(`턴 ≥ ${c.value}`);
      if (c?.type === 'turn_lte') parts.push(`턴 ≤ ${c.value}`);
      if (c?.type === 'prev_ai_contains') parts.push(`이전응답 "${c.value}"`);
      if (c?.type === 'prev_prompt_contains') parts.push(`이전프롬프트 "${c.value}"`);
      if (c?.type === 'prev_ai_regex') parts.push(`이전응답 /${c.pattern}/${c.flags || ''}`);
      if (c?.type === 'visited_slot') parts.push(`경유 #${c.slot_id ?? '?'}`);
      if (c?.type === 'var_on')
        parts.push(`var_on(${c.scope || 'both'}:${(c.names || []).join('|')})`);
      if (c?.type === 'count') parts.push(`count ${c.cmp} ${c.value}`);
      if (c?.type === 'fallback') parts.push('Fallback');
    });
    const p = data?.probability;
    if (p != null && p !== 1) parts.push(`확률 ${Math.round(Number(p) * 100)}%`);
    return parts.join(' | ');
  }

  // 엣지 적용
  function applyEdge() {
    if (!selectedEdge) return;
    let cond = [];
    try {
      cond = JSON.parse(edgeForm.conditions || '[]');
    } catch (_) {
      cond = [];
    }

    const trigger_words = edgeForm.trigger_words
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const priority = parseInt(edgeForm.priority) || 0;
    const probability = Math.max(0, Math.min(1, parseFloat(edgeForm.probability) || 0));
    const fallback = !!edgeForm.fallback;
    const action = edgeForm.action;

    setEdges(eds =>
      eds.map(e => {
        if (e.id !== selectedEdge.id) return e;
        const data = {
          ...(e.data || {}),
          trigger_words,
          conditions: cond,
          priority,
          probability,
          fallback,
          action,
        };
        return { ...e, data, label: rebuildLabel(data) };
      })
    );
  }

  // ConditionBuilder → 텍스트폼에 즉시 반영
  function pushToForm(json) {
    setEdgeForm(f => {
      let arr = [];
      try {
        arr = JSON.parse(f.conditions || '[]');
      } catch {}
      arr.push(json);
      return { ...f, conditions: JSON.stringify(arr) };
    });
  }

  if (selectedNodeId) {
    // 노드 패널
    return (
      <div style={{ padding: 12, display: 'grid', gap: 12 }}>
        <div style={{ fontWeight: 700 }}>프롬프트 편집</div>
        <div style={{ color: '#64748b', fontSize: 12 }}>
          카드에서 바로 텍스트를 수정하고, 아래에서 변수·토큰을 다듬어 보세요.
        </div>

        <div
          style={{ borderTop: '1px solid #eee', paddingTop: 10, fontSize: 12, color: '#6b7280' }}
        >
          세부 전역/로컬 변수 규칙은 화면 우측의 <b>변수</b> 버튼을 눌러 전용 패널에서 편집하세요.
        </div>

        {/* 토큰 팔레트 */}
        <TokenPalette onInsert={onInsertToken} />
      </div>
    );
  }

  if (selectedEdge) {
    // 엣지 패널
    return (
      <div style={{ padding: 12, display: 'grid', gap: 12 }}>
        <h3 style={{ marginTop: 0 }}>브릿지 조건</h3>
        <ConditionBuilder selectedEdge={selectedEdge} setEdges={setEdges} pushToForm={pushToForm} />

        {/* JSON 직접 편집 */}
        <div style={{ marginTop: 6, borderTop: '1px solid #eee', paddingTop: 10 }}>
          <label style={{ fontSize: 12 }}>조건(JSON 배열) 고급 편집</label>
          <textarea
            value={edgeForm.conditions}
            onChange={e => setEdgeForm(f => ({ ...f, conditions: e.target.value }))}
            rows={5}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
        </div>

        {/* 기타 속성 */}
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 12 }}>
            트리거 단어(콤마)
            <input
              value={edgeForm.trigger_words}
              onChange={e => setEdgeForm(f => ({ ...f, trigger_words: e.target.value }))}
              style={{ width: '100%', marginTop: 4 }}
              placeholder="예) 시작, 출발"
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ fontSize: 12 }}>
              우선순위
              <input
                type="number"
                value={edgeForm.priority}
                onChange={e => setEdgeForm(f => ({ ...f, priority: e.target.value }))}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 12 }}>
              확률(0~1)
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={edgeForm.probability}
                onChange={e => setEdgeForm(f => ({ ...f, probability: e.target.value }))}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={edgeForm.fallback}
              onChange={e => setEdgeForm(f => ({ ...f, fallback: e.target.checked }))}
            />
            Fallback (다른 조건이 모두 불일치 시 사용)
          </label>

          <label style={{ fontSize: 12 }}>
            액션
            <select
              value={edgeForm.action}
              onChange={e => setEdgeForm(f => ({ ...f, action: e.target.value }))}
              style={{ width: '100%', marginTop: 4 }}
            >
              <option value="continue">continue</option>
              <option value="stop">stop</option>
            </select>
          </label>

          <button
            type="button"
            onClick={applyEdge}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: '#111827',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            브릿지 적용
          </button>
        </div>
      </div>
    );
  }

  return <div style={{ padding: 12, color: '#64748b' }}>편집할 노드나 연결선을 선택하세요.</div>;
}
