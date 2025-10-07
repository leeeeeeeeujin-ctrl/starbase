'use client'

import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function RankMatchQueuePage() {
  const router = useRouter()
  const { id } = router.query

  useEffect(() => {
    if (!router.isReady) return
    if (id) {
      router.replace(`/rank/${id}`)
    } else {
      router.replace('/rank')
    }
  }, [id, router])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        background: '#0f172a',
        color: '#f8fafc',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 520 }}>
        <h1 style={{ fontSize: 28, marginBottom: 16 }}>자동 매칭 페이지가 제거되었습니다</h1>
        <p style={{ lineHeight: 1.6, marginBottom: 12 }}>
          랭크 매칭은 이제 별도의 대기열 없이 진행됩니다. 메인 룸에서 자신의 캐릭터를 선택하고 역할·점수 조건을
          만족하면 바로 슬롯에 배치할 수 있습니다.
        </p>
        <p style={{ lineHeight: 1.6, marginBottom: 24 }}>
          필요한 인원이 모두 준비되면 메인 룸에서 곧바로 게임을 시작해주세요.
        </p>
        <Link
          href={id ? `/rank/${id}` : '/rank'}
          style={{
            display: 'inline-block',
            padding: '12px 20px',
            borderRadius: 8,
            background: '#38bdf8',
            color: '#0f172a',
            fontWeight: 600,
          }}
        >
          메인 룸으로 이동
        </Link>
      </div>
    </div>
  )
}
