// components/maker/PromptNode.js
import { Handle, Position } from 'reactflow'

export default function PromptNode({ id, data = {}, selected }) {
  const slot_type = data.slot_type || 'ai'
  const template  = data.template  || ''
  const isStart   = !!data.isStart

  return (
    <div
      style={{
        width: 340,
        background: '#fff',
        border: isStart ? '2px solid #16a34a' : '1px solid #e5e7eb',
        borderRadius: 12,
        boxShadow: selected ? '0 0 0 2px #60a5fa' : '0 1px 2px rgba(0,0,0,0.04)',
        position: 'relative'
      }}
    >
      {/* 연결 핸들 */}
      <Handle type="target" position={Position.Left} />

      {/* 헤더: 타입 선택 + 시작 배지 + 삭제 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 6,
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb'
        }}
      >
        <select
          value={slot_type}
          onChange={(e) => data.onChange?.({ slot_type: e.target.value })}
          style={{
            padding: '4px 6px',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            fontWeight: 700
          }}
        >
          <option value="ai">AI 프롬프트</option>
          <option value="user_action">유저 행동</option>
          <option value="system">시스템 설명</option>
        </select>

        {isStart && (
          <span
            style={{
              marginLeft: 8,
              padding: '2px 6px',
              borderRadius: 999,
              background: '#dcfce7',
              color: '#166534',
              fontSize: 12,
              fontWeight: 700
            }}
          >
            시작
          </span>
        )}

        <button
          onClick={() => data.onDelete?.(id)}
          title="프롬프트와 연결된 브릿지 삭제"
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'transparent',
            color: '#ef4444',
            fontWeight: 900,
            fontSize: 16,
            cursor: 'pointer'
          }}
        >
          ✕
        </button>
      </div>

      {/* 툴바: 시작 지정 버튼 */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '6px 10px',
          borderBottom: '1px solid #f1f5f9'
        }}
      >
        <button
          onClick={() => data.onSetStart?.(id)}
          title="이 노드를 시작 지점으로 지정"
          style={{
            padding: '4px 8px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            background: '#fff',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          이 노드를 시작으로
        </button>
      </div>

      {/* 본문 */}
      {slot_type === 'user_action' ? (
        <div style={{ padding: 10, color: '#6b7280', fontStyle: 'italic' }}>
          유저 입력 단계입니다. (플레이 시 사용자가 직접 문장을 입력하게 됩니다)
        </div>
      ) : slot_type === 'system' ? (
        <div style={{ padding: 10, color: '#374151' }}>
          {template || '시스템 설명을 입력하세요.'}
        </div>
      ) : (
        <textarea
          value={template}
          onChange={(e) => data.onChange?.({ template: e.target.value })}
          placeholder="여기에 템플릿을 입력하세요"
          rows={8}
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            padding: 10,
            resize: 'vertical'
          }}
        />
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  )
}
