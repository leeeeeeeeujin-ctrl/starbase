function LogCard({ entry }) {
  return (
    <div
      style={{
        border: '1px solid rgba(148, 163, 184, 0.3)',
        borderRadius: 14,
        padding: 14,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'grid',
        gap: 6,
        fontSize: 13,
        color: '#e2e8f0',
      }}
    >
      <div style={{ fontWeight: 700 }}>
        턴 {entry.turn} · 노드 {entry.nodeId}
      </div>
      {entry.actors && entry.actors.length ? (
        <div style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.75)' }}>
          주역: {entry.actors.join(', ')}
        </div>
      ) : null}
      <div style={{ whiteSpace: 'pre-wrap', color: '#f8fafc' }}>{entry.response}</div>
      <div style={{ color: 'rgba(226, 232, 240, 0.7)' }}>
        결론: {entry.outcome || '미확인'}
      </div>
      <div style={{ color: 'rgba(226, 232, 240, 0.7)' }}>
        활성 변수: {entry.variables.length ? entry.variables.join(', ') : '없음'}
      </div>
      {entry.variableRules ? (
        <div
          style={{
            borderTop: '1px solid rgba(148, 163, 184, 0.25)',
            paddingTop: 8,
            fontSize: 12,
            color: 'rgba(226, 232, 240, 0.75)',
            whiteSpace: 'pre-wrap',
          }}
        >
          변수 규칙 안내{':\n'}{entry.variableRules}
        </div>
      ) : null}
      <div style={{ color: 'rgba(226, 232, 240, 0.7)' }}>
        다음 노드: {entry.next ? entry.next : '없음'} ({entry.action || 'continue'})
      </div>
    </div>
  )
}

function HistoryEntryList({ entries, emptyText }) {
  if (!entries.length) {
    return <div style={{ color: 'rgba(226, 232, 240, 0.6)', fontSize: 12 }}>{emptyText}</div>
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {entries.map((entry) => {
        const key = entry.index ?? `${entry.role}-${entry.content.slice(0, 12)}`
        const audienceLabel =
          entry.audience === 'slots'
            ? `대상 슬롯 ${entry.slots.map((slot) => slot + 1).join(', ')}`
            : '전체 공개'
        const roleLabel =
          entry.role === 'user'
            ? '플레이어 행동'
            : entry.role === 'assistant'
            ? 'AI 응답'
            : entry.role === 'system'
            ? '시스템'
            : entry.role
        return (
          <div
            key={key}
            style={{
              border: '1px solid rgba(148, 163, 184, 0.35)',
              borderRadius: 12,
              padding: 12,
              background: 'rgba(15, 23, 42, 0.45)',
              display: 'grid',
              gap: 6,
            }}
          >
            <div style={{ fontSize: 12, color: '#f8fafc', fontWeight: 600 }}>{roleLabel}</div>
            <div style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.7)' }}>{audienceLabel}</div>
            {entry.meta?.actors && entry.meta.actors.length ? (
              <div style={{ fontSize: 12, color: 'rgba(226, 232, 240, 0.65)' }}>
                주역: {entry.meta.actors.join(', ')}
              </div>
            ) : null}
            <div style={{ whiteSpace: 'pre-wrap', color: '#e2e8f0', fontSize: 13 }}>
              {entry.content}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PlayerHistoryCard({ slotIndex, role, heroName, entries }) {
  const title = heroName ? `${heroName} (${role || '역할 미지정'})` : `슬롯 ${slotIndex + 1}`
  return (
    <div
      style={{
        border: '1px solid rgba(148, 163, 184, 0.35)',
        borderRadius: 14,
        padding: 12,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'grid',
        gap: 8,
        color: '#e2e8f0',
      }}
    >
      <div style={{ fontWeight: 600 }}>{title}</div>
      <HistoryEntryList entries={entries} emptyText="아직 기록이 없습니다." />
    </div>
  )
}

export default function LogsPanel({ logs = [], aiMemory = [], playerHistories = [] }) {
  return (
    <section
      style={{
        border: '1px solid rgba(148, 163, 184, 0.35)',
        borderRadius: 18,
        background: 'rgba(15, 23, 42, 0.58)',
        padding: 16,
        display: 'grid',
        gap: 16,
        color: '#e2e8f0',
      }}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>턴 로그</div>
        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'grid', gap: 10 }}>
          {logs.length === 0 && (
            <div style={{ color: 'rgba(226, 232, 240, 0.6)', fontSize: 13 }}>
              아직 진행된 턴이 없습니다.
            </div>
          )}
          {logs.map((entry) => (
            <LogCard key={`${entry.turn}-${entry.nodeId}`} entry={entry} />
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>AI 히스토리</div>
        <HistoryEntryList entries={aiMemory} emptyText="아직 기록된 히스토리가 없습니다." />
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>플레이어 히스토리</div>
        <div style={{ display: 'grid', gap: 12 }}>
          {playerHistories.length === 0 ? (
            <div style={{ color: 'rgba(226, 232, 240, 0.6)', fontSize: 13 }}>
              참가자가 없습니다.
            </div>
          ) : (
            playerHistories.map((history) => (
              <PlayerHistoryCard
                key={history.slotIndex}
                slotIndex={history.slotIndex}
                role={history.role}
                heroName={history.heroName}
                entries={history.entries}
              />
            ))
          )}
        </div>
      </div>
    </section>
  )
}

//
