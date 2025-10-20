const cooldownAlertThresholds = {
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
  timelineUploadFailureStreak: {
    warning: 2,
    critical: 4,
  },
  timelineUploadStaleHours: {
    warning: 6,
    critical: 12,
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

export default cooldownAlertThresholds
