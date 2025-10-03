import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'

import AuthButton from '../components/AuthButton'
import { supabase } from '../lib/supabase'
import styles from '../styles/Home.module.css'
import progressData from '../data/rankBlueprintProgress.json'
import nextActionsData from '../data/rankBlueprintNextActions.json'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseISODateOnly(value) {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, year, month, day] = match.map(Number)
  if ([year, month, day].some((part) => Number.isNaN(part))) {
    return null
  }
  return new Date(Date.UTC(year, month - 1, day))
}

function startOfUTCDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function numericOrInfinity(value, fallback = Number.POSITIVE_INFINITY) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function formatPersonDays(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  const rounded = Math.round(value * 10) / 10
  if (Math.abs(rounded - Math.round(rounded)) < 0.05) {
    return `${Math.round(rounded)}d`
  }
  return `${rounded.toFixed(1)}d`
}

function deriveNextActionTiming(action) {
  const fallbackLabel = action.timing?.label || action.targetDateDisplay || action.targetDateISO || null

  if (!action.targetDateISO) {
    return {
      label: fallbackLabel,
      badge: null,
      state: 'unscheduled',
    }
  }

  const targetDate = parseISODateOnly(action.targetDateISO)
  if (!targetDate) {
    return {
      label: fallbackLabel,
      badge: action.timing?.badge || null,
      state: action.timing?.state || 'scheduled',
    }
  }

  const today = startOfUTCDay(new Date())
  const diffDays = Math.floor((targetDate.getTime() - today.getTime()) / MS_PER_DAY)

  let badge
  if (diffDays < 0) {
    badge = `D+${Math.abs(diffDays)}`
  } else if (diffDays === 0) {
    badge = 'D-DAY'
  } else {
    badge = `D-${diffDays}`
  }

  const computedState = (() => {
    if (diffDays < 0) return 'overdue'
    if (diffDays <= 3) return 'due-imminent'
    if (diffDays <= 7) return 'due-soon'
    return 'scheduled'
  })()

  const severity = {
    overdue: 3,
    'due-imminent': 2,
    'due-soon': 1,
    scheduled: 0,
    unscheduled: 0,
  }

  const stateFromJson = action.timing?.state || 'scheduled'
  const state =
    (severity[stateFromJson] || 0) > (severity[computedState] || 0) ? stateFromJson : computedState

  return {
    label: fallbackLabel,
    badge: action.timing?.badge || badge,
    state,
  }
}

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

const stageProgress = Array.isArray(progressData.stages) ? progressData.stages : []
const rawOverallProgress = Number(progressData.overallProgress)
const fallbackOverallProgress = stageProgress.length
  ? stageProgress.reduce((total, stage) => total + (Number(stage.progress) || 0), 0) /
    stageProgress.length
  : 0
const derivedOverallProgress = Number.isFinite(rawOverallProgress)
  ? rawOverallProgress
  : fallbackOverallProgress
const overallProgressValue = Math.max(
  0,
  Math.min(100, Math.round(Number.isFinite(derivedOverallProgress) ? derivedOverallProgress : 0)),
)
const remainingFocusEntries = Array.isArray(progressData.remainingFocus)
  ? progressData.remainingFocus
  : []
const remainingFocusByStage = remainingFocusEntries.reduce((acc, entry) => {
  if (entry && typeof entry.stage === 'string') {
    acc[entry.stage] = entry
  }
  return acc
}, {})
const progressLastUpdated = progressData.lastUpdatedDisplay
const progressLastUpdatedISO = progressData.lastUpdatedISO
const nextActions = Array.isArray(nextActionsData.items) ? nextActionsData.items : []
const NEXT_ACTION_SORT_OPTIONS = [
  { id: 'priority', label: '우선순위' },
  { id: 'deadline', label: '기한' },
  { id: 'order', label: '목록순' },
]

export default function Home() {
  const router = useRouter()
  const [progressRecency, setProgressRecency] = useState({
    relativeLabel: '',
    stale: false,
  })

  const [sortMode, setSortMode] = useState('priority')
  const overallProgress = overallProgressValue

  const totalStages = stageProgress.length
  const completedStages = stageProgress.filter((stage) => Number(stage?.progress) >= 100).length
  const remainingStages = stageProgress.filter((stage) => Number(stage?.progress) < 100)

  const sortedNextActions = useMemo(() => {
    const base = [...nextActions]

    const compareByOrder = (a, b) => (a?.order || 0) - (b?.order || 0)

    const compareByDeadline = (a, b) => {
      const aDays = numericOrInfinity(a?.timing?.daysFromToday)
      const bDays = numericOrInfinity(b?.timing?.daysFromToday)
      if (aDays !== bDays) return aDays - bDays
      return compareByOrder(a, b)
    }

    const compareByPriority = (a, b) => {
      const aRank = numericOrInfinity(a?.priority?.sortKey)
      const bRank = numericOrInfinity(b?.priority?.sortKey)
      if (aRank !== bRank) return aRank - bRank
      const aEffort = numericOrInfinity(a?.effort?.personDays)
      const bEffort = numericOrInfinity(b?.effort?.personDays)
      if (aEffort !== bEffort) return aEffort - bEffort
      return compareByDeadline(a, b)
    }

    const comparators = {
      order: compareByOrder,
      deadline: compareByDeadline,
      priority: compareByPriority,
    }

    const comparator = comparators[sortMode] || compareByPriority
    return base.sort(comparator)
  }, [sortMode])

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

  useEffect(() => {
    if (!progressLastUpdatedISO) return
    const updatedAt = new Date(progressLastUpdatedISO)
    if (Number.isNaN(updatedAt.getTime())) return

    const now = new Date()
    const diffMs = now.getTime() - updatedAt.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    let relativeLabel = ''
    if (diffDays <= 0) {
      relativeLabel = '오늘 업데이트'
    } else if (diffDays === 1) {
      relativeLabel = '1일 전 업데이트'
    } else {
      relativeLabel = `${diffDays}일 전 업데이트`
    }

    setProgressRecency({
      relativeLabel,
      stale: diffDays >= 14,
    })
  }, [progressLastUpdatedISO])

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
              <div
                className={styles.progressRecency}
                data-stale={progressRecency.stale ? 'true' : 'false'}
              >
                <span className={styles.progressBadge}>
                  {progressRecency.stale ? '업데이트 필요' : '최신 상태'}
                </span>
                <span className={styles.progressUpdated}>{progressLastUpdated}</span>
                {progressRecency.relativeLabel ? (
                  <span className={styles.progressRelative}>
                    · {progressRecency.relativeLabel}
                  </span>
                ) : null}
              </div>
            </div>
            <div className={styles.progressSummaryCard}>
              <div className={styles.progressSummaryHeader}>
                <span className={styles.progressSummaryLabel}>전체 진행도</span>
                <span className={styles.progressSummaryValue}>{overallProgress}%</span>
              </div>
              <div
                className={styles.progressSummaryMeter}
                role="progressbar"
                aria-valuenow={overallProgress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${overallProgress}%` }} />
              </div>
              <div className={styles.progressSummaryMeta}>
                <span>
                  {completedStages}/{totalStages} 단계 완료
                </span>
                <span>
                  {remainingStages.length
                    ? `남은 단계: ${remainingStages.map((stage) => stage.label).join(', ')}`
                    : '모든 단계 완료'}
                </span>
              </div>
              {remainingStages.length ? (
                <ul className={styles.progressRemainingList}>
                  {remainingStages.map((stage) => {
                    const focus = remainingFocusByStage[stage.label] || {}
                    return (
                      <li key={stage.label} className={styles.progressRemainingItem}>
                        <div className={styles.progressRemainingHeader}>
                          <span className={styles.progressRemainingStage}>{stage.label}</span>
                          <span className={styles.progressRemainingPercent}>{stage.progress}%</span>
                        </div>
                        <span className={styles.progressRemainingStatus}>{stage.status}</span>
                        <p className={styles.progressRemainingNextStep}>
                          {focus.nextStep || stage.summary}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
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
          {sortedNextActions.length ? (
            <div className={styles.nextActionsBlock}>
              <div className={styles.nextActionsHeader}>
                <h2 className={styles.sectionTitle}>Next Actions</h2>
                <div
                  className={styles.nextActionsRecency}
                  data-stale={progressRecency.stale ? 'true' : 'false'}
                >
                  <span className={styles.nextActionsUpdated}>{progressLastUpdated}</span>
                  {progressRecency.relativeLabel ? (
                    <span className={styles.nextActionsRelative}>
                      · {progressRecency.relativeLabel}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className={styles.nextActionsControls} role="group" aria-label="다음 액션 정렬">
                {NEXT_ACTION_SORT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={styles.nextActionsSortButton}
                    data-active={sortMode === option.id ? 'true' : 'false'}
                    aria-pressed={sortMode === option.id}
                    onClick={() => setSortMode(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <ol className={styles.nextActionsList}>
                {sortedNextActions.map((action) => {
                  const timing = deriveNextActionTiming(action)
                  const priorityRank =
                    typeof action.priority?.rank === 'number' ? Math.round(action.priority.rank) : null
                  const effortBadge = formatPersonDays(action.effort?.personDays)
                  return (
                    <li key={action.order} className={styles.nextActionItem}>
                      <span className={styles.nextActionIndex}>{action.order.toString().padStart(2, '0')}</span>
                      <div className={styles.nextActionContent}>
                        <p className={styles.nextActionSummary}>{action.summary}</p>
                        {(action.priority || timing.label || action.owner || action.effort) && (
                          <div className={styles.nextActionMeta}>
                            {action.priority?.label ? (
                              <span
                                className={styles.nextActionPriority}
                                data-rank={priorityRank !== null ? String(priorityRank) : undefined}
                              >
                                <span className={styles.nextActionPriorityBadge}>
                                  {action.priority?.short || 'PR'}
                                </span>
                                <span className={styles.nextActionPriorityLabel}>{action.priority.label}</span>
                              </span>
                            ) : null}
                            {timing.label ? (
                              <span className={styles.nextActionDue} data-state={timing.state}>
                                {timing.badge ? (
                                  <span className={styles.nextActionDueBadge}>{timing.badge}</span>
                                ) : null}
                                <span className={styles.nextActionDueLabel}>{timing.label}</span>
                              </span>
                            ) : null}
                            {action.owner ? (
                              <span className={styles.nextActionOwner}>{action.owner}</span>
                            ) : null}
                            {action.effort?.label ? (
                              <span className={styles.nextActionEffort}>
                                {effortBadge ? (
                                  <span className={styles.nextActionEffortBadge}>{effortBadge}</span>
                                ) : null}
                                <span className={styles.nextActionEffortLabel}>{action.effort.label}</span>
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          ) : null}
        </section>
      </section>
      <footer className={styles.footer}>
        <span>Beta Access</span>
        <span className={styles.footerVersion}>ver. 0.1.0</span>
      </footer>
    </main>
  )
}
