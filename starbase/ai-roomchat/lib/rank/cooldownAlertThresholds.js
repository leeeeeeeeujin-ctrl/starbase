const defaultThresholds = {
  failureRate: {
    warning: 0.25,
    critical: 0.45,
  },
  triggeredRatio: {
    warning: 0.2,
    critical: 0.4,
  },
  avgAlertDurationMs: {
    warning: 30000,
    critical: 60000,
  },
  avgRotationDurationMs: {
    warning: 60000,
    critical: 180000,
  },
  attemptsWithoutSuccess: {
    warning: 3,
    critical: 5,
  },
  docLinkAttachmentRate: {
    warning: 0.85,
    critical: 0.65,
  },
  lastDocLinkAttachmentRate: {
    warning: 0.9,
    critical: 0.7,
  },
}

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function compareThresholds(value, thresholds = {}) {
  const { warning, critical } = thresholds
  if (value === null || value === undefined) return 'ok'
  if (typeof critical === 'number' && value >= critical) return 'critical'
  if (typeof warning === 'number' && value >= warning) return 'warning'
  return 'ok'
}

function compareFloorThresholds(value, thresholds = {}) {
  const { warning, critical } = thresholds
  if (value === null || value === undefined) return 'ok'
  if (typeof critical === 'number' && value <= critical) return 'critical'
  if (typeof warning === 'number' && value <= warning) return 'warning'
  return 'ok'
}

function buildIssue(metric, severity, message, details) {
  return { metric, severity, message, details: details ?? null }
}

function evaluateTotals(totals, thresholds) {
  if (!totals) return { status: 'ok', issues: [] }

  const issues = []
  const failureRate = toFiniteNumber(totals.estimatedFailureRate)
  const triggeredRatio = totals.trackedKeys
    ? totals.currentlyTriggered / totals.trackedKeys
    : 0
  const avgAlertDurationMs = toFiniteNumber(totals.avgAlertDurationMs)
  const avgRotationDurationMs = toFiniteNumber(totals.avgRotationDurationMs)
  const docLinkAttachmentRate = toFiniteNumber(totals.docLinkAttachmentRate)
  const lastDocLinkAttachmentRate = toFiniteNumber(
    totals.lastDocLinkAttachmentRate,
  )

  const failureSeverity = compareThresholds(failureRate, thresholds.failureRate)
  if (failureSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'failureRate',
        failureSeverity,
        '실패 비율이 높습니다.',
        { value: failureRate },
      ),
    )
  }

  const triggeredSeverity = compareThresholds(
    triggeredRatio,
    thresholds.triggeredRatio,
  )
  if (triggeredSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'triggeredRatio',
        triggeredSeverity,
        '쿨다운 중인 키 비중이 높습니다.',
        { value: Number(triggeredRatio.toFixed(3)) },
      ),
    )
  }

  const alertDurationSeverity = compareThresholds(
    avgAlertDurationMs,
    thresholds.avgAlertDurationMs,
  )
  if (alertDurationSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'avgAlertDurationMs',
        alertDurationSeverity,
        '알림 발송 소요 시간이 길어지고 있습니다.',
        { value: avgAlertDurationMs },
      ),
    )
  }

  const rotationDurationSeverity = compareThresholds(
    avgRotationDurationMs,
    thresholds.avgRotationDurationMs,
  )
  if (rotationDurationSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'avgRotationDurationMs',
        rotationDurationSeverity,
        '자동 키 교체 소요 시간이 길어지고 있습니다.',
        { value: avgRotationDurationMs },
      ),
    )
  }

  const attachmentSeverity = compareFloorThresholds(
    docLinkAttachmentRate,
    thresholds.docLinkAttachmentRate,
  )
  if (attachmentSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'docLinkAttachmentRate',
        attachmentSeverity,
        'Slack 경보에 런북 링크 첨부율이 낮습니다.',
        {
          value:
            typeof docLinkAttachmentRate === 'number'
              ? Number(docLinkAttachmentRate.toFixed(3))
              : null,
        },
      ),
    )
  }

  const lastAttachmentSeverity = compareFloorThresholds(
    lastDocLinkAttachmentRate,
    thresholds.lastDocLinkAttachmentRate,
  )
  if (lastAttachmentSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'lastDocLinkAttachmentRate',
        lastAttachmentSeverity,
        '최근 시도에서 런북 링크 첨부가 누락되고 있습니다.',
        {
          value:
            typeof lastDocLinkAttachmentRate === 'number'
              ? Number(lastDocLinkAttachmentRate.toFixed(3))
              : null,
        },
      ),
    )
  }

  const status = issues.some((issue) => issue.severity === 'critical')
    ? 'critical'
    : issues.some((issue) => issue.severity === 'warning')
      ? 'warning'
      : 'ok'

  return { status, issues }
}

function evaluateProvider(provider, thresholds) {
  if (!provider) {
    return { status: 'ok', issues: [] }
  }

  const issues = []
  const failureRate = toFiniteNumber(provider.estimatedFailureRate)
  const triggeredRatio = provider.trackedKeys
    ? provider.currentlyTriggered / provider.trackedKeys
    : 0
  const avgAlertDurationMs = toFiniteNumber(provider.avgAlertDurationMs)
  const avgRotationDurationMs = toFiniteNumber(provider.avgRotationDurationMs)
  const docLinkAttachmentRate = toFiniteNumber(provider.docLinkAttachmentRate)
  const lastDocLinkAttachmentRate = toFiniteNumber(
    provider.lastDocLinkAttachmentRate,
  )

  const failureSeverity = compareThresholds(failureRate, thresholds.failureRate)
  if (failureSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'failureRate',
        failureSeverity,
        `${provider.provider} 제공자의 실패 비율이 높습니다.`,
        { value: failureRate },
      ),
    )
  }

  const triggeredSeverity = compareThresholds(
    triggeredRatio,
    thresholds.triggeredRatio,
  )
  if (triggeredSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'triggeredRatio',
        triggeredSeverity,
        `${provider.provider} 제공자의 쿨다운 키 비중이 높습니다.`,
        { value: Number(triggeredRatio.toFixed(3)) },
      ),
    )
  }

  const alertDurationSeverity = compareThresholds(
    avgAlertDurationMs,
    thresholds.avgAlertDurationMs,
  )
  if (alertDurationSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'avgAlertDurationMs',
        alertDurationSeverity,
        `${provider.provider} 제공자의 알림 발송 시간이 길어지고 있습니다.`,
        { value: avgAlertDurationMs },
      ),
    )
  }

  const rotationDurationSeverity = compareThresholds(
    avgRotationDurationMs,
    thresholds.avgRotationDurationMs,
  )
  if (rotationDurationSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'avgRotationDurationMs',
        rotationDurationSeverity,
        `${provider.provider} 제공자의 자동 키 교체 시간이 길어지고 있습니다.`,
        { value: avgRotationDurationMs },
      ),
    )
  }

  const attachmentSeverity = compareFloorThresholds(
    docLinkAttachmentRate,
    thresholds.docLinkAttachmentRate,
  )
  if (attachmentSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'docLinkAttachmentRate',
        attachmentSeverity,
        `${provider.provider} 제공자의 런북 링크 첨부율이 낮습니다.`,
        {
          value:
            typeof docLinkAttachmentRate === 'number'
              ? Number(docLinkAttachmentRate.toFixed(3))
              : null,
        },
      ),
    )
  }

  const lastAttachmentSeverity = compareFloorThresholds(
    lastDocLinkAttachmentRate,
    thresholds.lastDocLinkAttachmentRate,
  )
  if (lastAttachmentSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'lastDocLinkAttachmentRate',
        lastAttachmentSeverity,
        `${provider.provider} 제공자의 최근 시도에서 런북 링크 첨부가 누락되고 있습니다.`,
        {
          value:
            typeof lastDocLinkAttachmentRate === 'number'
              ? Number(lastDocLinkAttachmentRate.toFixed(3))
              : null,
        },
      ),
    )
  }

  const status = issues.some((issue) => issue.severity === 'critical')
    ? 'critical'
    : issues.some((issue) => issue.severity === 'warning')
      ? 'warning'
      : 'ok'

  return { status, issues }
}

function evaluateAttempt(attempt, thresholds) {
  if (!attempt) return { status: 'ok', issues: [] }
  const issues = []
  const attemptCount = toFiniteNumber(attempt.attemptCount)
  const triggered = Boolean(attempt.triggered)
  const docLinkAttached = attempt.docLinkAttached
  const attachmentCount = toFiniteNumber(attempt.docLinkAttachmentCount)

  if (typeof attemptCount === 'number') {
    const severity = compareThresholds(
      attemptCount,
      thresholds.attemptsWithoutSuccess,
    )
    if (severity !== 'ok') {
      issues.push(
        buildIssue(
          'attemptCount',
          severity,
          '재시도 횟수가 많습니다.',
          { value: attemptCount },
        ),
      )
    }
  }

  if (triggered) {
    issues.push(
      buildIssue('triggered', 'warning', '이 키는 아직 쿨다운 상태입니다.'),
    )
  }

  if (docLinkAttached === false) {
    issues.push(
      buildIssue(
        'docLinkAttached',
        'warning',
        '런북 링크가 첨부되지 않았습니다.',
        attachmentCount !== null ? { attachments: attachmentCount } : null,
      ),
    )
  }

  const status = issues.some((issue) => issue.severity === 'critical')
    ? 'critical'
    : issues.some((issue) => issue.severity === 'warning')
      ? 'warning'
      : 'ok'

  return { status, issues }
}

export function evaluateCooldownAlerts(report, thresholds = defaultThresholds) {
  const safeReport = report || {}
  const appliedThresholds = {
    ...defaultThresholds,
    ...(thresholds || {}),
  }

  const totals = evaluateTotals(safeReport.totals, appliedThresholds)
  const providers = Array.isArray(safeReport.providers)
    ? safeReport.providers.map((provider) => {
        const evaluation = evaluateProvider(provider, appliedThresholds)
        return {
          provider: provider.provider || 'unknown',
          status: evaluation.status,
          issues: evaluation.issues,
        }
      })
    : []

  const attempts = Array.isArray(safeReport.latestAttempts)
    ? safeReport.latestAttempts.map((attempt) => {
        const evaluation = evaluateAttempt(attempt, appliedThresholds)
        return {
          keyHash: attempt.keyHash || null,
          provider: attempt.provider || null,
          status: evaluation.status,
          issues: evaluation.issues,
          attemptedAt: attempt.attemptedAt || null,
        }
      })
    : []

  return {
    thresholds: appliedThresholds,
    overall: totals,
    providers,
    attempts,
  }
}

export { defaultThresholds }
