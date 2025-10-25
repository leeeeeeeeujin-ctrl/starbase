import DrawerShell from './DrawerShell';
import VisibilitySection from './VisibilitySection';
import ScopeSection from './ScopeSection';

function VariableDrawer({
  open,
  onClose,
  selectedNode,
  globalRules,
  localRules,
  commitGlobalRules,
  commitLocalRules,
  availableNames,
  slotSuggestions,
  characterSuggestions,
  visibility,
  onVisibilityChange,
  onToggleInvisible,
}) {
  if (!open) {
    return null;
  }

  const ready = Boolean(selectedNode && globalRules && localRules);

  return (
    <DrawerShell onClose={onClose}>
      {ready ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <VisibilitySection
            visibility={visibility}
            onChange={onVisibilityChange}
            onToggleInvisible={onToggleInvisible}
            slotSuggestions={slotSuggestions}
          />
          <ScopeSection
            scopeKey={`${scopeKeyPrefix(selectedNode?.id)}-global`}
            label="전역 변수 규칙"
            rules={globalRules}
            onCommit={commitGlobalRules}
            availableNames={availableNames}
            slotSuggestions={slotSuggestions}
            characterSuggestions={characterSuggestions}
          />
          <ScopeSection
            scopeKey={`${scopeKeyPrefix(selectedNode?.id)}-local`}
            label="로컬 변수 규칙"
            rules={localRules}
            onCommit={commitLocalRules}
            availableNames={availableNames}
            slotSuggestions={slotSuggestions}
            characterSuggestions={characterSuggestions}
          />
        </div>
      ) : (
        <div
          style={{
            padding: '24px 16px',
            borderRadius: 12,
            border: '1px dashed #cbd5f5',
            background: '#f8fafc',
            color: '#475569',
            lineHeight: 1.5,
          }}
        >
          편집할 프롬프트를 먼저 선택하면 전역/로컬 변수 규칙을 설정할 수 있습니다.
        </div>
      )}
      <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>
        AI 응답 가이드: 마지막 줄에는 승·패·탈락 결과를, 마지막에서 두 번째 줄에는 조건을 만족한
        변수명만 기재하고, 필요하다면 그 위 줄들은 공란으로 비워 두세요.
      </p>
    </DrawerShell>
  );
}

function scopeKeyPrefix(nodeId) {
  if (!nodeId) return 'node';
  return String(nodeId);
}

export default VariableDrawer;

//
