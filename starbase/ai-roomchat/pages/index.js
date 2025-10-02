import React, { useEffect } from 'react'
import { useRouter } from 'next/router'

import AuthButton from '../components/AuthButton'
import { supabase } from '../lib/supabase'
import styles from '../styles/Home.module.css'

const features = [
  {
    label: 'Auto Matchmaking',
    description:
      '솔로·듀오·캐주얼 모드에서 자동 매칭으로 곧바로 세션을 시작하고 재시작 흐름을 이어갑니다.',
  },
  {
    label: 'Prompt Battles',
    description:
      '프롬프트 기반 전투와 제작기 메타 변수를 연결해 전략을 설계하고, 요약 로그로 전투 맥락을 공유합니다.',
  },
  {
    label: 'Shared History',
    description:
      'rank_turns 히스토리와 세션 타임라인을 통해 팀과 관전자 모두가 같은 전선 기록을 확인할 수 있습니다.',
  },
]

const stageProgress = [
  {
    label: '매칭 트리거 통일',
    status: 'QA 검토 중',
    progress: 80,
    summary:
      '듀오·캐주얼 재시작 시퀀스를 /api/rank/play에 통일하고 회귀 테스트 케이스(DC-01~03)를 준비했습니다.',
  },
  {
    label: '세션/전투 동기화',
    status: '구현 진행 중',
    progress: 55,
    summary:
      'rank_turns is_visible·summary_payload를 run-turn/log-turn과 세션 히스토리 응답에 연결했습니다.',
  },
  {
    label: '프롬프트 변수 자동화',
    status: '진행 중',
    progress: 60,
    summary:
      '제작기 변수 매핑과 StartClient 경고 해소 가이드를 마련해 Maker 재저장 루틴을 정리했습니다.',
  },
  {
    label: 'UI·오디오 완성',
    status: '준비 중',
    progress: 25,
    summary:
      '히스토리 요약 노출 전략은 확정됐으며 모바일 레이아웃·BGM 전환 마감 작업이 남았습니다.',
  },
  {
    label: '운영 가드',
    status: '진행 중',
    progress: 85,
    summary:
      '쿨다운 ETA 안내·감사 로그·타임라인 내보내기까지 연결해 Edge Function 운영 루프를 정비했습니다.',
  },
]

const progressLastUpdated = '2025-11-07 기준'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    async function ensureSession() {
      try {
        const { data } = await supabase.auth.getSession()
        if (cancelled) return
        if (data?.session?.user) {
          router.replace('/roster')
        }
      } catch (error) {
        console.error('Failed to resolve auth session on landing:', error)
      }
    }

    ensureSession()

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (session?.user) {
        router.replace('/roster')
      }
      if (event === 'SIGNED_OUT') {
        router.replace('/')
      }
    })

    return () => {
      cancelled = true
      subscription?.subscription?.unsubscribe?.()
    }
  }, [router])

  return (
    <main className={styles.hero}>
      <section className={styles.frame}>
        <span className={styles.kicker}>Rank Blueprint</span>
        <h1 className={styles.title}>랭크 청사진에 맞춘 전선으로 바로 합류하세요</h1>
        <p className={styles.lede}>
          자동 매칭, 프롬프트 기반 전투, 공유 히스토리를 결합한 경쟁 모드 비전을 지금 바로 체험해 보세요.
        </p>
        <div className={styles.cta}>
          <AuthButton />
          <span className={styles.ctaHint}>Google 계정으로 즉시 접속</span>
        </div>
        <section className={styles.sections}>
          <div className={styles.featureBlock}>
            <h2 className={styles.sectionTitle}>Core Pillars</h2>
            <ul className={styles.featureList}>
              {features.map((feature) => (
                <li key={feature.label} className={styles.featureItem}>
                  <span className={styles.featureLabel}>{feature.label}</span>
                  <span>{feature.description}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.progressBlock}>
            <div className={styles.progressHeader}>
              <h2 className={styles.sectionTitle}>Blueprint Progress</h2>
              <span className={styles.progressUpdated}>{progressLastUpdated}</span>
            </div>
            <ul className={styles.progressList}>
              {stageProgress.map((stage) => (
                <li key={stage.label} className={styles.progressItem}>
                  <div className={styles.progressItemHeader}>
                    <div>
                      <span className={styles.progressLabel}>{stage.label}</span>
                      <span className={styles.progressStatus}>{stage.status}</span>
                    </div>
                    <span className={styles.progressValue}>{stage.progress}%</span>
                  </div>
                  <p className={styles.progressSummary}>{stage.summary}</p>
                  <div className={styles.progressMeter} role="progressbar" aria-valuenow={stage.progress} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${stage.progress}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </section>
      <footer className={styles.footer}>
        <span>Beta Access</span>
        <span className={styles.footerVersion}>ver. 0.1.0</span>
      </footer>
    </main>
  )
}
