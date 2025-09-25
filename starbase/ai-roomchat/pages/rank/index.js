import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import { supabase } from '../../lib/supabase'
import RankingShowcaseSkeleton from '../../components/rank/RankingShowcaseSkeleton'
import ProfileActionSheet from '../../components/common/ProfileActionSheet'

const RankingShowcase = dynamic(() => import('../../components/rank/RankingShowcase'), {
  ssr: false,
  loading: () => <RankingShowcaseSkeleton />,
})

const SharedChatDock = dynamic(() => import('../../components/common/SharedChatDock'), {
  ssr: false,
})

export default function RankHub() {
  const router = useRouter()
  const [count, setCount] = useState(0)
  const [chatCommand, setChatCommand] = useState(null)
  const [profileSheet, setProfileSheet] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { count } = await supabase.from('rank_games').select('id', { count: 'exact', head: true })
      if (alive) setCount(count ?? 0)
    })()
    return () => {
      alive = false
    }
  }, [])

  function openProfileSheet(profile) {
    if (!profile?.heroId) return
    setProfileSheet(profile)
  }

  function closeProfileSheet() {
    setProfileSheet(null)
  }

  function handleProfileWhisper(profile) {
    if (!profile?.heroId) return
    setChatCommand({
      type: 'whisper',
      heroId: profile.heroId,
      prefill: profile.heroName ? `@${profile.heroName} ` : '',
    })
  }

  const FRIEND_STORAGE_KEY = 'starbase_lobby_friends'

  function handleProfileAddFriend(profile) {
    if (!profile?.heroId) return
    if (typeof window === 'undefined') {
      alert('브라우저 환경에서만 친구를 추가할 수 있습니다.')
      return
    }
    try {
      const raw = window.localStorage.getItem(FRIEND_STORAGE_KEY)
      const list = raw ? JSON.parse(raw) : []
      const normalized = Array.isArray(list) ? list : []
      if (normalized.some((entry) => entry.heroId === profile.heroId)) {
        alert('이미 친구 목록에 있는 캐릭터입니다.')
        return
      }
      const entry = {
        heroId: profile.heroId,
        heroName: profile.heroName || '이름 없는 영웅',
      }
      window.localStorage.setItem(FRIEND_STORAGE_KEY, JSON.stringify([...normalized, entry]))
      alert(`${profile.heroName || '이름 없는 영웅'}을(를) 친구 목록에 추가했습니다. 로비에서 확인하세요.`)
    } catch (error) {
      console.error('RankHub: failed to persist friend', error)
      alert('친구 목록을 저장하지 못했습니다. 브라우저 저장소 설정을 확인하세요.')
    }
  }

  function handleProfileDetail(profile) {
    if (!profile?.heroId) return
    router.push(`/character/${profile.heroId}`)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at 50% -20%, rgba(59, 130, 246, 0.45), rgba(15, 23, 42, 0.96))',
        color: '#e2e8f0',
        padding: '32px 18px 120px',
      }}
    >
      <div style={{ maxWidth: 840, margin: '0 auto', display: 'grid', gap: 20 }}>
        <header
          style={{
            borderRadius: 28,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(15, 23, 42, 0.85)',
            padding: '22px 26px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 40px 80px -60px rgba(15, 23, 42, 0.95)',
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 30 }}>랭킹 허브</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#cbd5f5' }}>
              총 {count}개의 게임이 등록되어 있습니다. 상위권 영웅과 게임별 순위를 확인해 보세요.
            </p>
          </div>
          <Link href="/rank/new">
            <a
              style={{
                padding: '10px 18px',
                borderRadius: 999,
                border: 'none',
                background: '#38bdf8',
                color: '#020617',
                fontWeight: 800,
              }}
            >
              + 게임 등록
            </a>
          </Link>
        </header>

        <RankingShowcase
          onInvite={() => {}}
          onWhisper={() => {}}
          onRequestProfile={openProfileSheet}
        />

        <div
          style={{
            borderRadius: 24,
            padding: 18,
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            boxShadow: '0 20px 48px -40px rgba(15, 23, 42, 0.9)',
          }}
        >
          <SharedChatDock
            height={320}
            command={chatCommand}
            onRequestProfile={openProfileSheet}
          />
        </div>
      </div>

      <ProfileActionSheet
        open={Boolean(profileSheet)}
        hero={profileSheet}
        onClose={closeProfileSheet}
        onAddFriend={handleProfileAddFriend}
        onWhisper={handleProfileWhisper}
        onViewDetail={handleProfileDetail}
      />
    </div>
  )
}

//
