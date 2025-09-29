'use client'

import { useRouter } from 'next/router'

import SharedChatDock from '../../common/SharedChatDock'
import HeaderControls from './HeaderControls'
import LogsPanel from './LogsPanel'
import ManualResponsePanel from './ManualResponsePanel'
import RosterPanel from './RosterPanel'
import StatusBanner from './StatusBanner'
import TurnInfoPanel from './TurnInfoPanel'
import { useStartClientEngine } from './useStartClientEngine'

export default function StartClient({ gameId: overrideGameId, onExit }) {
  const router = useRouter()
  const resolvedGameId = overrideGameId ?? router.query.id

  const {
    loading,
    error,
    game,
    participants,
    currentNode,
    preflight,
    turn,
    activeGlobal,
    activeLocal,
    statusMessage,
    logs,
    apiKey,
    setApiKey,
    apiVersion,
    setApiVersion,
    manualResponse,
    setManualResponse,
    isAdvancing,
    handleStart,
    advanceWithAi,
    advanceWithManual,
  } = useStartClientEngine(resolvedGameId)

  if (!resolvedGameId) {
    return <div style={{ padding: 16 }}>게임 정보가 없습니다.</div>
  }

  if (loading) {
    return <div style={{ padding: 16 }}>불러오는 중…</div>
  }

  if (error) {
    return (
      <div style={{ padding: 16, color: '#b91c1c' }}>
        오류가 발생했습니다: {error}
      </div>
    )
  }

  const handleBack = () => {
    if (onExit) {
      onExit()
    } else {
      router.back()
    }
  }

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: '16px auto 80px',
        padding: 12,
        display: 'grid',
        gap: 16,
      }}
    >
      <HeaderControls
        onBack={handleBack}
        title={game?.name}
        description={game?.description}
        preflight={preflight}
        onStart={handleStart}
        onAdvance={advanceWithAi}
        isAdvancing={isAdvancing}
      />

      <StatusBanner message={statusMessage} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 1fr) minmax(420px, 2fr)',
          gap: 16,
        }}
      >
        <RosterPanel participants={participants} />

        <div style={{ display: 'grid', gap: 16 }}>
          <TurnInfoPanel
            turn={turn}
            currentNode={currentNode}
            activeGlobal={activeGlobal}
            activeLocal={activeLocal}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            apiVersion={apiVersion}
            onApiVersionChange={setApiVersion}
            realtimeLockNotice={
              game?.realtime_match
                ? '실시간 매칭 중에는 세션을 시작한 뒤 API 버전을 변경할 수 없습니다.'
                : ''
            }
          />

          <ManualResponsePanel
            manualResponse={manualResponse}
            onChange={setManualResponse}
            onManualAdvance={advanceWithManual}
            onAiAdvance={advanceWithAi}
            isAdvancing={isAdvancing}
          />

          <LogsPanel logs={logs} />
        </div>
      </div>

      <SharedChatDock height={260} />
    </div>
  )
}

// Start client entry point that orchestrates the in-battle panels and shared chat dock.
