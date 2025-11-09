import cooldownAlertThresholds from '@/config/rank/cooldownAlertThresholds';
import { recordCooldownThresholdChange } from '@/lib/rank/cooldownAlertThresholdAuditTrail';

const defaultThresholds = Object.freeze({
  ...cooldownAlertThresholds,
});

let lastResolvedSnapshot = null;
let lastResolvedSignature = null;

function cloneThresholds(value = {}) {
  return JSON.parse(JSON.stringify(value));
}

function buildThresholdSignature(thresholds = {}) {
  const normalized = {};
  const metrics = Object.keys(thresholds).sort();

  for (const metric of metrics) {
    const group = thresholds[metric] || {};
    normalized[metric] = {
      warning:
        typeof group.warning === 'number'
          ? Number(group.warning)
          : group.warning === null
            ? null
            : null,
      critical:
        typeof group.critical === 'number'
          ? Number(group.critical)
          : group.critical === null
            ? null
            : null,
    };
  }

  return JSON.stringify(normalized);
}

function maybeAuditThresholdChange(nextThresholds, context) {
  const signature = buildThresholdSignature(nextThresholds);

  if (lastResolvedSignature && signature !== lastResolvedSignature) {
    try {
      recordCooldownThresholdChange({
        previous: lastResolvedSnapshot,
        next: nextThresholds,
        context,
      });
    } catch (error) {
      console.error('[cooldown-alert-thresholds] 감사 로그 전송 실패', {
        error,
      });
    }
  }

  lastResolvedSnapshot = cloneThresholds(nextThresholds);
  lastResolvedSignature = signature;
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sanitizeThresholdValue(value) {
  if (value === null) {
    return { type: 'null', value: null };
  }

  if (typeof value === 'string' && value.trim().toLowerCase() === 'null') {
    return { type: 'null', value: null };
  }

  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return { type: 'invalid', value: null };
  }

  return { type: 'number', value: numeric };
}

function mergeThresholdGroup(base = {}, override = {}) {
  const merged = { ...base };

  if (!override || typeof override !== 'object') {
    return merged;
  }

  if (Object.prototype.hasOwnProperty.call(override, 'warning')) {
    const warningValue = sanitizeThresholdValue(override.warning);
    if (warningValue.type === 'number') {
      merged.warning = warningValue.value;
    } else if (warningValue.type === 'null') {
      merged.warning = null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(override, 'critical')) {
    const criticalValue = sanitizeThresholdValue(override.critical);
    if (criticalValue.type === 'number') {
      merged.critical = criticalValue.value;
    } else if (criticalValue.type === 'null') {
      merged.critical = null;
    }
  }

  return merged;
}

export function resolveCooldownAlertThresholds(overrides = {}) {
  if (!overrides || typeof overrides !== 'object') {
    return { ...defaultThresholds };
  }

  const keys = new Set([...Object.keys(defaultThresholds), ...Object.keys(overrides)]);

  const resolved = {};
  for (const key of keys) {
    const baseGroup = defaultThresholds[key] || {};
    const overrideGroup = overrides[key] || {};
    resolved[key] = mergeThresholdGroup(baseGroup, overrideGroup);
  }

  return resolved;
}

export function loadCooldownAlertThresholds(options = {}) {
  const env = options.env || process.env || {};
  const rawValue = env.RANK_COOLDOWN_ALERT_THRESHOLDS;

  let overrides = null;
  if (rawValue) {
    try {
      overrides = JSON.parse(rawValue);
    } catch (error) {
      console.warn('[cooldown-alert-thresholds] Failed to parse overrides', error);
    }
  }

  const resolved = overrides
    ? resolveCooldownAlertThresholds(overrides)
    : cloneThresholds(defaultThresholds);

  const context = {
    source: rawValue
      ? overrides
        ? 'env:RANK_COOLDOWN_ALERT_THRESHOLDS'
        : 'env:RANK_COOLDOWN_ALERT_THRESHOLDS (invalid)'
      : 'default',
    rawEnvValue: rawValue || null,
    overrides: overrides || null,
  };

  maybeAuditThresholdChange(resolved, context);

  return resolved;
}

function compareThresholds(value, thresholds = {}) {
  const { warning, critical } = thresholds;
  if (value === null || value === undefined) return 'ok';
  if (typeof critical === 'number' && value >= critical) return 'critical';
  if (typeof warning === 'number' && value >= warning) return 'warning';
  return 'ok';
}

function compareFloorThresholds(value, thresholds = {}) {
  const { warning, critical } = thresholds;
  if (value === null || value === undefined) return 'ok';
  if (typeof critical === 'number' && value <= critical) return 'critical';
  if (typeof warning === 'number' && value <= warning) return 'warning';
  return 'ok';
}

function buildIssue(metric, severity, message, details) {
  return { metric, severity, message, details: details ?? null };
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function hoursBetween(later, earlier) {
  const laterDate = toDate(later);
  const earlierDate = toDate(earlier);
  if (!laterDate || !earlierDate) {
    return null;
  }
  const diffMs = laterDate.getTime() - earlierDate.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return null;
  }
  return diffMs / (1000 * 60 * 60);
}

function evaluateTimelineUploads(timeline, thresholds, options = {}) {
  const now = options.now ? toDate(options.now) : new Date();
  const recent = Array.isArray(timeline?.recent) ? timeline.recent : [];
  const summary = timeline?.summary?.overall || null;
  const hasAnyEntries = Boolean(
    recent.length || (Array.isArray(timeline?.summary?.groups) && timeline.summary.groups.length)
  );

  const issues = [];

  let failureStreak = 0;
  for (const entry of recent) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    if (entry.status === 'failed') {
      failureStreak += 1;
      continue;
    }
    if (entry.status === 'uploaded') {
      break;
    }
    if (entry.status === 'skipped') {
      break;
    }
  }

  const failureSeverity = compareThresholds(
    failureStreak,
    thresholds.timelineUploadFailureStreak || {}
  );
  if (failureSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'timelineUploadFailureStreak',
        failureSeverity,
        `타임라인 내보내기 업로드가 ${failureStreak}회 연속 실패했습니다.`,
        { failureStreak }
      )
    );
  }

  const lastSuccessAt = summary?.lastSuccessAt || null;
  let hoursSinceLastSuccess = null;
  if (lastSuccessAt) {
    hoursSinceLastSuccess = hoursBetween(now, lastSuccessAt);
  } else if (summary && hasAnyEntries) {
    hoursSinceLastSuccess = Number.POSITIVE_INFINITY;
  }

  const staleHoursValue =
    typeof hoursSinceLastSuccess === 'number' && Number.isFinite(hoursSinceLastSuccess)
      ? Number(hoursSinceLastSuccess.toFixed(1))
      : null;

  const staleSeverity = compareThresholds(
    hoursSinceLastSuccess,
    thresholds.timelineUploadStaleHours || {}
  );
  if (staleSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'timelineUploadStaleHours',
        staleSeverity,
        lastSuccessAt
          ? `마지막 업로드 성공 이후 ${staleHoursValue ?? '?'}시간이 지났습니다.`
          : '업로드 성공 기록이 없어 자동 공유가 장기간 멈춰 있습니다.',
        {
          lastSuccessAt,
          hoursSinceLastSuccess: staleHoursValue,
        }
      )
    );
  }

  const status = issues.some(issue => issue.severity === 'critical')
    ? 'critical'
    : issues.some(issue => issue.severity === 'warning')
      ? 'warning'
      : 'ok';

  return {
    status,
    issues,
    metrics: {
      failureStreak,
      lastSuccessAt,
      hoursSinceLastSuccess: staleHoursValue,
    },
  };
}

function evaluateTotals(totals, thresholds) {
  if (!totals) return { status: 'ok', issues: [] };

  const issues = [];
  const failureRate = toFiniteNumber(totals.estimatedFailureRate);
  const triggeredRatio = totals.trackedKeys ? totals.currentlyTriggered / totals.trackedKeys : 0;
  const avgAlertDurationMs = toFiniteNumber(totals.avgAlertDurationMs);
  const avgRotationDurationMs = toFiniteNumber(totals.avgRotationDurationMs);
  const docLinkAttachmentRate = toFiniteNumber(totals.docLinkAttachmentRate);
  const lastDocLinkAttachmentRate = toFiniteNumber(totals.lastDocLinkAttachmentRate);

  const failureSeverity = compareThresholds(failureRate, thresholds.failureRate);
  if (failureSeverity !== 'ok') {
    issues.push(
      buildIssue('failureRate', failureSeverity, '실패 비율이 높습니다.', { value: failureRate })
    );
  }

  const triggeredSeverity = compareThresholds(triggeredRatio, thresholds.triggeredRatio);
  if (triggeredSeverity !== 'ok') {
    issues.push(
      buildIssue('triggeredRatio', triggeredSeverity, '쿨다운 중인 키 비중이 높습니다.', {
        value: Number(triggeredRatio.toFixed(3)),
      })
    );
  }

  const alertDurationSeverity = compareThresholds(
    avgAlertDurationMs,
    thresholds.avgAlertDurationMs
  );
  if (alertDurationSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'avgAlertDurationMs',
        alertDurationSeverity,
        '알림 발송 소요 시간이 길어지고 있습니다.',
        { value: avgAlertDurationMs }
      )
    );
  }

  const rotationDurationSeverity = compareThresholds(
    avgRotationDurationMs,
    thresholds.avgRotationDurationMs
  );
  if (rotationDurationSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'avgRotationDurationMs',
        rotationDurationSeverity,
        '자동 키 교체 소요 시간이 길어지고 있습니다.',
        { value: avgRotationDurationMs }
      )
    );
  }

  const attachmentSeverity = compareFloorThresholds(
    docLinkAttachmentRate,
    thresholds.docLinkAttachmentRate
  );
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
        }
      )
    );
  }

  const lastAttachmentSeverity = compareFloorThresholds(
    lastDocLinkAttachmentRate,
    thresholds.lastDocLinkAttachmentRate
  );
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
        }
      )
    );
  }

  const status = issues.some(issue => issue.severity === 'critical')
    ? 'critical'
    : issues.some(issue => issue.severity === 'warning')
      ? 'warning'
      : 'ok';

  return { status, issues };
}

function evaluateProvider(provider, thresholds) {
  if (!provider) {
    return { status: 'ok', issues: [] };
  }

  const issues = [];
  const failureRate = toFiniteNumber(provider.estimatedFailureRate);
  const triggeredRatio = provider.trackedKeys
    ? provider.currentlyTriggered / provider.trackedKeys
    : 0;
  const avgAlertDurationMs = toFiniteNumber(provider.avgAlertDurationMs);
  const avgRotationDurationMs = toFiniteNumber(provider.avgRotationDurationMs);
  const docLinkAttachmentRate = toFiniteNumber(provider.docLinkAttachmentRate);
  const lastDocLinkAttachmentRate = toFiniteNumber(provider.lastDocLinkAttachmentRate);

  const failureSeverity = compareThresholds(failureRate, thresholds.failureRate);
  if (failureSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'failureRate',
        failureSeverity,
        `${provider.provider} 제공자의 실패 비율이 높습니다.`,
        { value: failureRate }
      )
    );
  }

  const triggeredSeverity = compareThresholds(triggeredRatio, thresholds.triggeredRatio);
  if (triggeredSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'triggeredRatio',
        triggeredSeverity,
        `${provider.provider} 제공자의 쿨다운 키 비중이 높습니다.`,
        { value: Number(triggeredRatio.toFixed(3)) }
      )
    );
  }

  const alertDurationSeverity = compareThresholds(
    avgAlertDurationMs,
    thresholds.avgAlertDurationMs
  );
  if (alertDurationSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'avgAlertDurationMs',
        alertDurationSeverity,
        `${provider.provider} 제공자의 알림 발송 시간이 길어지고 있습니다.`,
        { value: avgAlertDurationMs }
      )
    );
  }

  const rotationDurationSeverity = compareThresholds(
    avgRotationDurationMs,
    thresholds.avgRotationDurationMs
  );
  if (rotationDurationSeverity !== 'ok') {
    issues.push(
      buildIssue(
        'avgRotationDurationMs',
        rotationDurationSeverity,
        `${provider.provider} 제공자의 자동 키 교체 시간이 길어지고 있습니다.`,
        { value: avgRotationDurationMs }
      )
    );
  }

  const attachmentSeverity = compareFloorThresholds(
    docLinkAttachmentRate,
    thresholds.docLinkAttachmentRate
  );
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
        }
      )
    );
  }

  const lastAttachmentSeverity = compareFloorThresholds(
    lastDocLinkAttachmentRate,
    thresholds.lastDocLinkAttachmentRate
  );
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
        }
      )
    );
  }

  const status = issues.some(issue => issue.severity === 'critical')
    ? 'critical'
    : issues.some(issue => issue.severity === 'warning')
      ? 'warning'
      : 'ok';

  return { status, issues };
}

function evaluateAttempt(attempt, thresholds) {
  if (!attempt) return { status: 'ok', issues: [] };
  const issues = [];
  const attemptCount = toFiniteNumber(attempt.attemptCount);
  const triggered = Boolean(attempt.triggered);
  const docLinkAttached = attempt.docLinkAttached;
  const attachmentCount = toFiniteNumber(attempt.docLinkAttachmentCount);

  if (typeof attemptCount === 'number') {
    const severity = compareThresholds(attemptCount, thresholds.attemptsWithoutSuccess);
    if (severity !== 'ok') {
      issues.push(
        buildIssue('attemptCount', severity, '재시도 횟수가 많습니다.', { value: attemptCount })
      );
    }
  }

  if (triggered) {
    issues.push(buildIssue('triggered', 'warning', '이 키는 아직 쿨다운 상태입니다.'));
  }

  if (docLinkAttached === false) {
    issues.push(
      buildIssue(
        'docLinkAttached',
        'warning',
        '런북 링크가 첨부되지 않았습니다.',
        attachmentCount !== null ? { attachments: attachmentCount } : null
      )
    );
  }

  const status = issues.some(issue => issue.severity === 'critical')
    ? 'critical'
    : issues.some(issue => issue.severity === 'warning')
      ? 'warning'
      : 'ok';

  return { status, issues };
}

export function evaluateCooldownAlerts(report, thresholds = defaultThresholds, options = {}) {
  const safeReport = report || {};
  const appliedThresholds = {
    ...defaultThresholds,
    ...(thresholds || {}),
  };
  const evaluationOptions = options || {};

  const totals = evaluateTotals(safeReport.totals, appliedThresholds);
  const providers = Array.isArray(safeReport.providers)
    ? safeReport.providers.map(provider => {
        const evaluation = evaluateProvider(provider, appliedThresholds);
        return {
          provider: provider.provider || 'unknown',
          status: evaluation.status,
          issues: evaluation.issues,
        };
      })
    : [];

  const attempts = Array.isArray(safeReport.latestAttempts)
    ? safeReport.latestAttempts.map(attempt => {
        const evaluation = evaluateAttempt(attempt, appliedThresholds);
        return {
          keyHash: attempt.keyHash || null,
          provider: attempt.provider || null,
          status: evaluation.status,
          issues: evaluation.issues,
          attemptedAt: attempt.attemptedAt || null,
        };
      })
    : [];

  const timelineUploads = evaluateTimelineUploads(
    evaluationOptions.timelineUploads,
    appliedThresholds,
    evaluationOptions
  );

  return {
    thresholds: appliedThresholds,
    overall: totals,
    providers,
    attempts,
    timelineUploads,
  };
}

export { defaultThresholds, evaluateTimelineUploads };
