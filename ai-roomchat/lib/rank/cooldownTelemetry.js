function toObject(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }
  if (typeof value === 'object') {
    return value;
  }
  return {};
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function safeIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function pickNextRetryEta(automation = {}) {
  const retryState = toObject(automation.retryState);
  const retryPlan = toObject(automation.retryPlan);
  const candidates = [
    automation.nextRetryEta,
    retryState.nextRetryEta,
    retryState.recommendedRunAt,
    retryPlan.recommendedRunAt,
    retryPlan.nextRetryAt,
  ];

  for (const candidate of candidates) {
    const iso = safeIso(candidate);
    if (iso) {
      return iso;
    }
  }

  return null;
}

function averageFrom(sum, count) {
  if (!count) return null;
  const result = sum / count;
  return Number.isFinite(result) ? Math.round(result) : null;
}

function computeBackoffSuggestion(avgDurationMs, failureRate) {
  const base = Number.isFinite(avgDurationMs) && avgDurationMs > 0 ? avgDurationMs : 4000;
  const scaled = base * (1 + Math.max(0, Math.min(1, failureRate)) * 1.5);
  const padded = scaled + 1000;
  const clamped = Math.min(120000, Math.max(5000, padded));
  return Math.round(clamped);
}

function computeWeightSuggestion(failureRate) {
  const ratio = Math.max(0, Math.min(1, failureRate));
  const weight = 0.2 + (1 - ratio) * 0.8;
  return Number(weight.toFixed(2));
}

function normalizeLatestAttempt(
  row,
  automation,
  alert,
  rotation,
  attemptCount,
  triggered,
  lastDocLinkAttached,
  docLinkAttachmentCount
) {
  const attemptedAt = automation.lastAttemptedAt || row.updated_at || row.reported_at || null;
  const timestamp =
    attemptedAt && !Number.isNaN(Date.parse(attemptedAt))
      ? new Date(attemptedAt).toISOString()
      : null;
  const docLinkAttached = Boolean(lastDocLinkAttached);
  const totalDocLinkAttachments = toFiniteNumber(docLinkAttachmentCount);
  const normalizedAttachmentCount = totalDocLinkAttachments ?? 0;
  const attachmentRate =
    typeof attemptCount === 'number' && attemptCount > 0 && totalDocLinkAttachments !== null
      ? Number((totalDocLinkAttachments / attemptCount).toFixed(3))
      : null;

  const normalizeAlert = entry => {
    if (!entry || typeof entry !== 'object') return null;
    const normalized = {
      attempted: entry.attempted ?? null,
      delivered: entry.delivered ?? null,
      skipped: entry.skipped ?? null,
      reason: entry.reason || null,
      status: entry.status ?? null,
      durationMs: toFiniteNumber(entry.durationMs),
    };

    const response = entry.response && typeof entry.response === 'object' ? entry.response : null;
    if (response) {
      normalized.response = {
        ok: response.ok ?? null,
        status: response.status ?? null,
        elapsedMs: toFiniteNumber(response.elapsedMs),
        contentType: response.contentType || null,
      };
    }

    const error = entry.error && typeof entry.error === 'object' ? entry.error : null;
    if (error) {
      normalized.error = {
        message: error.message || null,
        name: error.name || null,
        type: error.type || null,
        timedOut: error.timedOut ?? null,
      };
    }

    return normalized;
  };

  return {
    keyHash: row.key_hash || null,
    keySample: row.key_sample || null,
    provider: row.provider || null,
    reason: row.reason || null,
    attemptId: automation.lastAttemptId || null,
    attemptCount,
    attemptedAt: timestamp,
    triggered,
    alert: normalizeAlert(alert),
    rotation: normalizeAlert(rotation),
    docLinkAttached,
    docLinkAttachmentCount: normalizedAttachmentCount,
    docLinkAttachmentRate: attachmentRate,
  };
}

export function buildCooldownTelemetry(rows = [], { latestLimit = 15 } = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];

  const totals = {
    trackedKeys: safeRows.length,
    keysWithSuccess: 0,
    currentlyTriggered: 0,
    totalAttempts: 0,
    totalFailures: 0,
    alertDurationSum: 0,
    alertDurationCount: 0,
    rotationDurationSum: 0,
    rotationDurationCount: 0,
    docLinkAttachmentCount: 0,
    lastDocLinkAttached: 0,
  };

  const providerMap = new Map();
  const latestAttempts = [];
  const triggeredCooldowns = [];

  for (const row of safeRows) {
    const metadata = toObject(row.metadata);
    const automation = toObject(metadata.cooldownAutomation);
    automation.lastResult = toObject(automation.lastResult);

    const attemptCount = toFiniteNumber(automation.attemptCount) || 0;
    const lastResult = automation.lastResult;
    const alert = toObject(lastResult.alert);
    const rotation = toObject(lastResult.rotation);
    const triggered = Boolean(lastResult.triggered);
    const docLinkAttachmentCount = toFiniteNumber(automation.docLinkAttachmentCount) || 0;
    const lastDocLinkAttached = Boolean(
      automation.lastDocLinkAttached ?? lastResult.alertDocLinkAttached
    );

    const successEver = Boolean(row.notified_at);
    if (successEver) {
      totals.keysWithSuccess += 1;
    }

    if (triggered) {
      totals.currentlyTriggered += 1;
    }

    totals.totalAttempts += attemptCount;

    const successes = successEver ? 1 : 0;
    const failures = attemptCount > successes ? attemptCount - successes : 0;
    totals.totalFailures += failures;

    totals.docLinkAttachmentCount += docLinkAttachmentCount;
    if (lastDocLinkAttached) {
      totals.lastDocLinkAttached += 1;
    }

    const alertDuration = toFiniteNumber(alert.durationMs);
    if (alertDuration !== null) {
      totals.alertDurationSum += alertDuration;
      totals.alertDurationCount += 1;
    }

    const rotationDuration = toFiniteNumber(rotation.durationMs);
    if (rotationDuration !== null) {
      totals.rotationDurationSum += rotationDuration;
      totals.rotationDurationCount += 1;
    }

    const providerKey = row.provider || 'unknown';
    if (!providerMap.has(providerKey)) {
      providerMap.set(providerKey, {
        provider: providerKey,
        trackedKeys: 0,
        keysWithSuccess: 0,
        currentlyTriggered: 0,
        totalAttempts: 0,
        totalFailures: 0,
        alertDurationSum: 0,
        alertDurationCount: 0,
        rotationDurationSum: 0,
        rotationDurationCount: 0,
        docLinkAttachmentCount: 0,
        lastDocLinkAttached: 0,
        nextRetryEta: null,
        lastAttemptAt: null,
      });
    }

    const providerEntry = providerMap.get(providerKey);
    providerEntry.trackedKeys += 1;
    providerEntry.totalAttempts += attemptCount;
    providerEntry.totalFailures += failures;
    providerEntry.docLinkAttachmentCount += docLinkAttachmentCount;

    if (successEver) {
      providerEntry.keysWithSuccess += 1;
    }

    if (triggered) {
      providerEntry.currentlyTriggered += 1;

      const nextRetryEta = pickNextRetryEta(automation);
      if (nextRetryEta) {
        const candidateMs = Date.parse(nextRetryEta);
        if (Number.isFinite(candidateMs)) {
          const existingMs = providerEntry.nextRetryEta
            ? Date.parse(providerEntry.nextRetryEta)
            : NaN;
          if (Number.isNaN(existingMs) || candidateMs < existingMs) {
            providerEntry.nextRetryEta = new Date(candidateMs).toISOString();
          }
        }
      }
    }

    if (lastDocLinkAttached) {
      providerEntry.lastDocLinkAttached += 1;
    }

    if (alertDuration !== null) {
      providerEntry.alertDurationSum += alertDuration;
      providerEntry.alertDurationCount += 1;
    }

    if (rotationDuration !== null) {
      providerEntry.rotationDurationSum += rotationDuration;
      providerEntry.rotationDurationCount += 1;
    }

    const latest = normalizeLatestAttempt(
      row,
      automation,
      alert,
      rotation,
      attemptCount,
      triggered,
      lastDocLinkAttached,
      docLinkAttachmentCount
    );
    if (latest.attemptedAt) {
      latestAttempts.push(latest);

      const attemptMs = Date.parse(latest.attemptedAt);
      if (Number.isFinite(attemptMs)) {
        const previousMs = providerEntry.lastAttemptAt
          ? Date.parse(providerEntry.lastAttemptAt)
          : NaN;
        if (Number.isNaN(previousMs) || attemptMs > previousMs) {
          providerEntry.lastAttemptAt = new Date(attemptMs).toISOString();
        }
      }
    }

    if (triggered) {
      triggeredCooldowns.push({
        id: row.id || null,
        keyHash: row.key_hash || null,
        provider: row.provider || null,
        reason: row.reason || null,
        attemptId: latest.attemptId || null,
        lastAttemptAt: latest.attemptedAt || null,
        metadataNextRetryEta: pickNextRetryEta(automation),
      });
    }
  }

  latestAttempts.sort((a, b) => {
    const aTime = Date.parse(a.attemptedAt || '') || 0;
    const bTime = Date.parse(b.attemptedAt || '') || 0;
    return bTime - aTime;
  });

  triggeredCooldowns.sort((a, b) => {
    const aEta = Date.parse(a.metadataNextRetryEta || '');
    const bEta = Date.parse(b.metadataNextRetryEta || '');
    const aFallback = Date.parse(a.lastAttemptAt || '') || 0;
    const bFallback = Date.parse(b.lastAttemptAt || '') || 0;
    const aTime = Number.isNaN(aEta) ? aFallback : aEta;
    const bTime = Number.isNaN(bEta) ? bFallback : bEta;
    return aTime - bTime;
  });

  const providerSummaries = Array.from(providerMap.values()).map(entry => {
    const avgAlertDurationMs = averageFrom(entry.alertDurationSum, entry.alertDurationCount);
    const avgRotationDurationMs = averageFrom(
      entry.rotationDurationSum,
      entry.rotationDurationCount
    );

    const combinedDurations = [avgAlertDurationMs, avgRotationDurationMs].filter(
      value => value !== null
    );
    const avgDuration = combinedDurations.length
      ? Math.round(
          combinedDurations.reduce((sum, value) => sum + value, 0) / combinedDurations.length
        )
      : null;

    const failureRate = entry.totalAttempts > 0 ? entry.totalFailures / entry.totalAttempts : 0;
    const docLinkAttachmentRate = entry.totalAttempts
      ? entry.docLinkAttachmentCount / entry.totalAttempts
      : 0;
    const lastDocLinkAttachmentRate = entry.trackedKeys
      ? entry.lastDocLinkAttached / entry.trackedKeys
      : 0;

    return {
      provider: entry.provider,
      trackedKeys: entry.trackedKeys,
      keysWithSuccess: entry.keysWithSuccess,
      currentlyTriggered: entry.currentlyTriggered,
      totalAttempts: entry.totalAttempts,
      estimatedFailureRate: Number(failureRate.toFixed(3)),
      avgAlertDurationMs,
      avgRotationDurationMs,
      recommendedBackoffMs: computeBackoffSuggestion(avgDuration, failureRate),
      recommendedWeight: computeWeightSuggestion(failureRate),
      docLinkAttachmentCount: entry.docLinkAttachmentCount,
      docLinkAttachmentRate: Number(docLinkAttachmentRate.toFixed(3)),
      lastDocLinkAttached: entry.lastDocLinkAttached,
      lastDocLinkAttachmentRate: Number(lastDocLinkAttachmentRate.toFixed(3)),
      nextRetryEta: entry.nextRetryEta,
      lastAttemptAt: entry.lastAttemptAt,
    };
  });

  providerSummaries.sort((a, b) => {
    if (b.totalAttempts === a.totalAttempts) {
      return (b.trackedKeys || 0) - (a.trackedKeys || 0);
    }
    return (b.totalAttempts || 0) - (a.totalAttempts || 0);
  });

  const avgAlertDurationMs = averageFrom(totals.alertDurationSum, totals.alertDurationCount);
  const avgRotationDurationMs = averageFrom(
    totals.rotationDurationSum,
    totals.rotationDurationCount
  );
  const combinedDurations = [avgAlertDurationMs, avgRotationDurationMs].filter(
    value => value !== null
  );
  const avgDuration = combinedDurations.length
    ? Math.round(
        combinedDurations.reduce((sum, value) => sum + value, 0) / combinedDurations.length
      )
    : null;

  const estimatedFailureRate =
    totals.totalAttempts > 0 ? totals.totalFailures / totals.totalAttempts : 0;
  const docLinkAttachmentRate = totals.totalAttempts
    ? totals.docLinkAttachmentCount / totals.totalAttempts
    : 0;
  const lastDocLinkAttachmentRate = totals.trackedKeys
    ? totals.lastDocLinkAttached / totals.trackedKeys
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      trackedKeys: totals.trackedKeys,
      keysWithSuccess: totals.keysWithSuccess,
      keysWithoutSuccess: totals.trackedKeys - totals.keysWithSuccess,
      currentlyTriggered: totals.currentlyTriggered,
      totalAttempts: totals.totalAttempts,
      estimatedFailureRate: Number(estimatedFailureRate.toFixed(3)),
      avgAlertDurationMs,
      avgRotationDurationMs,
      recommendedBackoffMs: computeBackoffSuggestion(avgDuration, estimatedFailureRate),
      recommendedWeight: computeWeightSuggestion(estimatedFailureRate),
      docLinkAttachmentCount: totals.docLinkAttachmentCount,
      docLinkAttachmentRate: Number(docLinkAttachmentRate.toFixed(3)),
      lastDocLinkAttached: totals.lastDocLinkAttached,
      lastDocLinkAttachmentRate: Number(lastDocLinkAttachmentRate.toFixed(3)),
    },
    providers: providerSummaries,
    latestAttempts: latestAttempts.slice(0, latestLimit),
    triggeredCooldowns,
  };
}
