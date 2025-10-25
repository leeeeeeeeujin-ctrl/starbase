const RANGE_DAY_MAP = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '60d': 60,
  '90d': 90,
  '180d': 180,
  '365d': 365,
};

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

function averageFrom(sum, count) {
  if (!count) return null;
  const result = sum / count;
  return Number.isFinite(result) ? Math.round(result) : null;
}

function normalizeDate(raw) {
  if (!raw) return null;
  const time = Date.parse(raw);
  if (Number.isNaN(time)) return null;
  return new Date(time);
}

function resolveRange({ start, end, range }) {
  const now = end ? normalizeDate(end) : new Date();
  let safeEnd = now || new Date();
  let safeStart = start ? normalizeDate(start) : null;

  if (!safeStart) {
    const days = RANGE_DAY_MAP[range] || RANGE_DAY_MAP['90d'];
    const candidate = new Date(safeEnd);
    candidate.setUTCDate(candidate.getUTCDate() - days + 1);
    candidate.setUTCHours(0, 0, 0, 0);
    safeStart = candidate;
  }

  if (safeStart > safeEnd) {
    const temp = safeStart;
    safeStart = safeEnd;
    safeEnd = temp;
  }

  return {
    start: safeStart,
    end: safeEnd,
  };
}

function floorToDay(date) {
  const floored = new Date(date);
  floored.setUTCHours(0, 0, 0, 0);
  return floored;
}

function floorToWeek(date) {
  const floored = floorToDay(date);
  const day = floored.getUTCDay();
  const diff = (day + 6) % 7;
  floored.setUTCDate(floored.getUTCDate() - diff);
  return floored;
}

function floorToMonth(date) {
  const floored = floorToDay(date);
  floored.setUTCDate(1);
  return floored;
}

function addInterval(date, grouping) {
  const next = new Date(date);
  switch (grouping) {
    case 'day':
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'month':
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case 'week':
    default:
      next.setUTCDate(next.getUTCDate() + 7);
      break;
  }
  return next;
}

function normalizeBucketStart(date, grouping) {
  switch (grouping) {
    case 'day':
      return floorToDay(date);
    case 'month':
      return floorToMonth(date);
    case 'week':
    default:
      return floorToWeek(date);
  }
}

function formatBucketLabel(start, grouping) {
  const options = { timeZone: 'UTC' };
  if (grouping === 'day') {
    return start.toLocaleDateString('ko-KR', options);
  }
  if (grouping === 'month') {
    return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  const end = addInterval(start, grouping);
  end.setUTCDate(end.getUTCDate() - 1);
  return `${start.toLocaleDateString('ko-KR', options)} ~ ${end.toLocaleDateString('ko-KR', options)}`;
}

function ensureBucket(map, bucketKey, startDate) {
  if (!map.has(bucketKey)) {
    map.set(bucketKey, {
      start: startDate,
      records: 0,
      uniqueKeys: new Set(),
      triggered: 0,
      notified: 0,
      attempts: 0,
      failures: 0,
      alertDurationSum: 0,
      alertDurationCount: 0,
      rotationDurationSum: 0,
      rotationDurationCount: 0,
    });
  }
  return map.get(bucketKey);
}

function ensureAggregate(map, key) {
  if (!map.has(key)) {
    map.set(key, {
      key,
      records: 0,
      uniqueKeys: new Set(),
      triggered: 0,
      notified: 0,
      attempts: 0,
      failures: 0,
      alertDurationSum: 0,
      alertDurationCount: 0,
      rotationDurationSum: 0,
      rotationDurationCount: 0,
    });
  }
  return map.get(key);
}

function computeFailureRate(attempts, failures) {
  if (!attempts) return 0;
  const value = failures / attempts;
  return Number(value.toFixed(3));
}

function summarizeAggregate(entry) {
  return {
    records: entry.records,
    uniqueKeys: entry.uniqueKeys.size,
    triggered: entry.triggered,
    notified: entry.notified,
    attempts: entry.attempts,
    failures: entry.failures,
    failureRate: computeFailureRate(entry.attempts, entry.failures),
    avgAlertDurationMs: averageFrom(entry.alertDurationSum, entry.alertDurationCount),
    avgRotationDurationMs: averageFrom(entry.rotationDurationSum, entry.rotationDurationCount),
  };
}

export function buildCooldownAnalytics(rows = [], options = {}) {
  const grouping = ['day', 'week', 'month'].includes(options.grouping) ? options.grouping : 'week';
  const providerFilter =
    options.provider && options.provider !== 'all' ? String(options.provider) : null;
  const reasonFilter = options.reason && options.reason !== 'all' ? String(options.reason) : null;

  const { start, end } = resolveRange({
    start: options.start,
    end: options.end,
    range: options.range,
  });
  const startTime = start.getTime();
  const endTime = end.getTime();

  const availableProviders = new Set();
  const availableReasons = new Set();

  const trendBuckets = new Map();
  const providerAggregates = new Map();
  const reasonAggregates = new Map();

  const totals = {
    records: 0,
    uniqueKeys: new Set(),
    triggered: 0,
    notified: 0,
    attempts: 0,
    failures: 0,
    alertDurationSum: 0,
    alertDurationCount: 0,
    rotationDurationSum: 0,
    rotationDurationCount: 0,
  };

  const recent = [];

  const safeRows = Array.isArray(rows) ? rows : [];

  for (const row of safeRows) {
    const provider = row.provider || 'unknown';
    const reason = row.reason || '미기록';
    availableProviders.add(provider);
    availableReasons.add(reason);

    if (providerFilter && provider !== providerFilter) {
      continue;
    }

    if (reasonFilter && reason !== reasonFilter) {
      continue;
    }

    const metadata = toObject(row.metadata);
    const automation = toObject(metadata.cooldownAutomation);
    automation.lastResult = toObject(automation.lastResult);

    const attemptCount = toFiniteNumber(automation.attemptCount) || 0;
    const lastResult = automation.lastResult;
    const alert = toObject(lastResult.alert);
    const rotation = toObject(lastResult.rotation);
    const triggered = Boolean(lastResult.triggered);

    const recorded =
      normalizeDate(row.reported_at) ||
      normalizeDate(row.recorded_at) ||
      normalizeDate(row.updated_at) ||
      normalizeDate(row.inserted_at);
    if (!recorded) {
      continue;
    }

    const recordedTime = recorded.getTime();
    if (recordedTime < startTime || recordedTime > endTime) {
      continue;
    }

    const bucketStart = normalizeBucketStart(recorded, grouping);
    const bucketKey = bucketStart.toISOString();
    const bucket = ensureBucket(trendBuckets, bucketKey, bucketStart);

    const providerEntry = ensureAggregate(providerAggregates, provider);
    const reasonEntry = ensureAggregate(reasonAggregates, reason);

    const uniqueKey = row.key_hash || row.id || `${provider}-${recordedTime}`;

    const alertDuration = toFiniteNumber(alert.durationMs);
    const rotationDuration = toFiniteNumber(rotation.durationMs);
    const successEver = Boolean(row.notified_at);
    const successes = successEver ? 1 : 0;
    const failures = attemptCount > successes ? attemptCount - successes : 0;

    const aggregations = [bucket, providerEntry, reasonEntry, totals];

    for (const aggregate of aggregations) {
      aggregate.records += 1;
      aggregate.uniqueKeys.add(uniqueKey);
      aggregate.attempts += attemptCount;
      aggregate.failures += failures;
      if (successEver) {
        aggregate.notified += 1;
      }
      if (triggered) {
        aggregate.triggered += 1;
      }
      if (alertDuration !== null) {
        aggregate.alertDurationSum += alertDuration;
        aggregate.alertDurationCount += 1;
      }
      if (rotationDuration !== null) {
        aggregate.rotationDurationSum += rotationDuration;
        aggregate.rotationDurationCount += 1;
      }
    }

    recent.push({
      keyHash: row.key_hash || null,
      provider,
      reason,
      triggered,
      attemptCount,
      notifiedAt: row.notified_at || null,
      recordedAt: recorded.toISOString(),
      failureCount: failures,
      alertDurationMs: alertDuration,
      rotationDurationMs: rotationDuration,
    });
  }

  const bucketEntries = Array.from(trendBuckets.entries())
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .map(([bucketKey, data]) => ({
      bucketStart: bucketKey,
      label: formatBucketLabel(new Date(bucketKey), grouping),
      ...summarizeAggregate(data),
    }));

  const providerEntries = Array.from(providerAggregates.values())
    .map(entry => ({
      provider: entry.key,
      ...summarizeAggregate(entry),
    }))
    .sort((a, b) => b.records - a.records || a.provider.localeCompare(b.provider));

  const reasonEntries = Array.from(reasonAggregates.values())
    .map(entry => ({
      reason: entry.key,
      ...summarizeAggregate(entry),
    }))
    .sort((a, b) => b.records - a.records || a.reason.localeCompare(b.reason));

  recent.sort((a, b) => {
    const aTime = Date.parse(a.recordedAt || '') || 0;
    const bTime = Date.parse(b.recordedAt || '') || 0;
    return bTime - aTime;
  });

  const summary = summarizeAggregate(totals);

  return {
    generatedAt: new Date().toISOString(),
    applied: {
      start: start.toISOString(),
      end: end.toISOString(),
      grouping,
      provider: providerFilter,
      reason: reasonFilter,
      range: options.range || null,
    },
    filters: {
      providers: Array.from(availableProviders).sort(),
      reasons: Array.from(availableReasons).sort(),
    },
    summary,
    trend: bucketEntries,
    providerBreakdown: providerEntries,
    reasonBreakdown: reasonEntries,
    recent: recent.slice(0, 20),
  };
}
