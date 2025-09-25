import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

import { supabase } from '../../lib/supabase'
import RankingShowcaseSkeleton from '../../components/rank/RankingShowcaseSkeleton'

const RankingShowcase = dynamic(() => import('../../components/rank/RankingShowcase'), {
  ssr: false,
  loading: () => <RankingShowcaseSkeleton />,
})

const SharedChatDock = dynamic(() => import('../../components/common/SharedChatDock'), {
  ssr: false,
})

export default function RankHub() {
  const [count, setCount] = useState(0)

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

        <RankingShowcase onInvite={() => {}} onWhisper={() => {}} />

        <div
          style={{
            borderRadius: 24,
            padding: 18,
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            boxShadow: '0 20px 48px -40px rgba(15, 23, 42, 0.9)',
          }}
        >
          <SharedChatDock height={320} />
        </div>
      </div>
    </div>
  )
}

// 
