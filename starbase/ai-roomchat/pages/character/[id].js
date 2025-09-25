'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/router'

import CharacterDashboard from '../../components/character/CharacterDashboard'
import StartBattleOverlay from '../../components/character/CharacterDashboard/StartBattleOverlay'
import StartClient from '../../components/rank/StartClient'
import useCharacterDashboard from '../../hooks/useCharacterDashboard'

export default function CharacterDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const dashboard = useCharacterDashboard(id)
  const [startOpen, setStartOpen] = useState(false)
  const [clientOpen, setClientOpen] = useState(false)

  if (dashboard.loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
          background: '#020617',
          color: '#e2e8f0',
          textAlign: 'center',
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 600 }}>캐릭터 정보를 불러오는 중…</span>
        <span style={{ fontSize: 14, color: '#94a3b8' }}>
          잠시만 기다려 주세요.
        </span>
      </div>
    )
  }

  if (!dashboard.hero) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 16,
          background: '#020617',
          color: '#e2e8f0',
          textAlign: 'center',
          padding: '0 24px',
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 700 }}>캐릭터를 찾을 수 없습니다.</span>
        <p style={{ margin: 0, fontSize: 15, color: '#94a3b8', lineHeight: 1.6 }}>
          연결된 영웅 정보를 확인할 수 없어요. 목록으로 돌아가 다시 선택해 주세요.
        </p>
        <button
          type="button"
          onClick={() => router.replace('/roster')}
          style={{
            marginTop: 8,
            padding: '10px 20px',
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(30, 41, 59, 0.75)',
            color: '#e2e8f0',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          로스터로 이동
        </button>
      </div>
    )
  }

  return (
    <>
      <CharacterDashboard
        dashboard={dashboard}
        heroName={dashboard.heroName}
        onStartBattle={() => {
          setClientOpen(false)
          if (!dashboard.selectedGameId) {
            alert('먼저 게임을 선택하세요.')
            return
          }
          setStartOpen(true)
        }}
        onBack={() => router.back()}
        onGoLobby={() => router.push(`/lobby?heroId=${dashboard.hero?.id}`)}
      />
      <StartBattleOverlay
        open={startOpen}
        hero={dashboard.hero}
        selectedEntry={dashboard.selectedEntry}
        selectedGame={dashboard.selectedGame}
        selectedGameId={dashboard.selectedGameId}
        scoreboardRows={dashboard.selectedScoreboard}
        heroLookup={dashboard.heroLookup}
        onClose={() => setStartOpen(false)}
        onBeginSession={() => {
          setStartOpen(false)
          if (!dashboard.selectedGameId) return
          setClientOpen(true)
        }}
      />
      {clientOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 80,
            padding: '24px 16px',
          }}
        >
          <div
            style={{
              background: '#0f172a',
              borderRadius: 16,
              width: '100%',
              maxWidth: 1280,
              maxHeight: '100%',
              overflow: 'auto',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(148, 163, 184, 0.3)',
            }}
          >
            <StartClient
              gameId={dashboard.selectedGameId}
              onExit={() => setClientOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

// Character detail page that composes the dashboard view and inline battle overlays.
