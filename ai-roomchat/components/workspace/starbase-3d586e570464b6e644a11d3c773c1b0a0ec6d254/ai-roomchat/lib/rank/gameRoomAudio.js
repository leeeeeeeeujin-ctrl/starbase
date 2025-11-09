export const DEFAULT_EQ_SETTINGS = { enabled: false, low: 0, mid: 0, high: 0 };
export const DEFAULT_REVERB_SETTINGS = { enabled: false, mix: 0.3, decay: 1.8 };
export const DEFAULT_COMPRESSOR_SETTINGS = {
  enabled: false,
  threshold: -28,
  ratio: 2.5,
  release: 0.25,
};

function clampValue(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return Number.isFinite(fallback) ? fallback : min;
  }
  return Math.min(Math.max(number, min), max);
}

export function normalizeEqSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_EQ_SETTINGS };
  }

  const enabled = Boolean(
    typeof raw.enabled === 'boolean'
      ? raw.enabled
      : typeof raw.eqEnabled === 'boolean'
        ? raw.eqEnabled
        : raw.active
  );

  return {
    enabled,
    low: clampValue(raw.low ?? raw.bass ?? 0, -12, 12, 0),
    mid: clampValue(raw.mid ?? raw.middle ?? 0, -12, 12, 0),
    high: clampValue(raw.high ?? raw.treble ?? 0, -12, 12, 0),
  };
}

export function normalizeReverbSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_REVERB_SETTINGS };
  }

  const enabled = Boolean(
    typeof raw.enabled === 'boolean'
      ? raw.enabled
      : typeof raw.reverbEnabled === 'boolean'
        ? raw.reverbEnabled
        : raw.active
  );

  return {
    enabled,
    mix: clampValue(raw.mix ?? raw.wet ?? 0.3, 0, 1, 0.3),
    decay: clampValue(raw.decay ?? raw.duration ?? 1.8, 0.1, 6, 1.8),
  };
}

export function normalizeCompressorSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_COMPRESSOR_SETTINGS };
  }

  const enabled = Boolean(
    typeof raw.enabled === 'boolean'
      ? raw.enabled
      : typeof raw.compressorEnabled === 'boolean'
        ? raw.compressorEnabled
        : raw.active
  );

  return {
    enabled,
    threshold: clampValue(raw.threshold ?? raw.level ?? -28, -60, 0, -28),
    ratio: clampValue(raw.ratio ?? raw.amount ?? 2.5, 1, 20, 2.5),
    release: clampValue(raw.release ?? raw.tail ?? 0.25, 0.05, 2, 0.25),
  };
}

export function eqSettingsAreEqual(a, b) {
  const first = normalizeEqSettings(a);
  const second = normalizeEqSettings(b);
  const lowDelta = Math.abs((first.low ?? 0) - (second.low ?? 0));
  const midDelta = Math.abs((first.mid ?? 0) - (second.mid ?? 0));
  const highDelta = Math.abs((first.high ?? 0) - (second.high ?? 0));
  return (
    first.enabled === second.enabled && lowDelta < 0.001 && midDelta < 0.001 && highDelta < 0.001
  );
}

export function reverbSettingsAreEqual(a, b) {
  const first = normalizeReverbSettings(a);
  const second = normalizeReverbSettings(b);
  const mixDelta = Math.abs((first.mix ?? 0) - (second.mix ?? 0));
  const decayDelta = Math.abs((first.decay ?? 0) - (second.decay ?? 0));
  return first.enabled === second.enabled && mixDelta < 0.001 && decayDelta < 0.001;
}

export function compressorSettingsAreEqual(a, b) {
  const first = normalizeCompressorSettings(a);
  const second = normalizeCompressorSettings(b);
  const thresholdDelta = Math.abs((first.threshold ?? 0) - (second.threshold ?? 0));
  const ratioDelta = Math.abs((first.ratio ?? 0) - (second.ratio ?? 0));
  const releaseDelta = Math.abs((first.release ?? 0) - (second.release ?? 0));
  return (
    first.enabled === second.enabled &&
    thresholdDelta < 0.001 &&
    ratioDelta < 0.001 &&
    releaseDelta < 0.001
  );
}

export function buildHeroAudioProfileKey(profile) {
  if (!profile) return null;
  const source = typeof profile.source === 'string' && profile.source ? profile.source : 'unknown';
  if (profile.heroId) {
    return `${source}:${profile.heroId}`;
  }
  const label = typeof profile.heroName === 'string' ? profile.heroName.trim().toLowerCase() : '';
  if (label) {
    return `${source}:${label}`;
  }
  return source;
}

export function normalizeAudioPreferenceRecord(record) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  return {
    trackId: record.track_id || record.trackId || null,
    presetId: record.preset_id || record.presetId || null,
    manualOverride: Boolean(record.manual_override ?? record.manualOverride ?? false),
    eq: normalizeEqSettings(record.eq_settings || record.eqSettings),
    reverb: normalizeReverbSettings(record.reverb_settings || record.reverbSettings),
    compressor: normalizeCompressorSettings(
      record.compressor_settings || record.compressorSettings
    ),
  };
}

export function extractHeroAudioEffectSnapshot(state) {
  if (!state) return null;

  return {
    eq: {
      enabled: Boolean(state.eqEnabled),
      low: clampValue(state.equalizer?.low ?? 0, -12, 12, 0),
      mid: clampValue(state.equalizer?.mid ?? 0, -12, 12, 0),
      high: clampValue(state.equalizer?.high ?? 0, -12, 12, 0),
    },
    reverb: {
      enabled: Boolean(state.reverbEnabled),
      mix: clampValue(state.reverbDetail?.mix ?? 0.3, 0, 1, 0.3),
      decay: clampValue(state.reverbDetail?.decay ?? 1.8, 0.1, 6, 1.8),
    },
    compressor: {
      enabled: Boolean(state.compressorEnabled),
      threshold: clampValue(state.compressorDetail?.threshold ?? -28, -60, 0, -28),
      ratio: clampValue(state.compressorDetail?.ratio ?? 2.5, 1, 20, 2.5),
      release: clampValue(state.compressorDetail?.release ?? 0.25, 0.05, 2, 0.25),
    },
  };
}

export function diffAudioPreferenceChanges(prev, next) {
  if (!next) return [];
  const changes = [];
  if (!prev) {
    changes.push('initial');
  }

  if ((prev?.trackId || null) !== (next.trackId || null)) {
    if (next.trackId || prev?.trackId) {
      changes.push('trackId');
    }
  }

  if ((prev?.presetId || null) !== (next.presetId || null)) {
    if (next.presetId || prev?.presetId) {
      changes.push('presetId');
    }
  }

  if (Boolean(prev?.manualOverride) !== Boolean(next.manualOverride)) {
    changes.push('manualOverride');
  }

  const prevEq = prev?.eq || null;
  const nextEq = next.eq || null;
  if (
    !prevEq ||
    !nextEq ||
    Boolean(prevEq.enabled) !== Boolean(nextEq.enabled) ||
    prevEq.low !== nextEq.low ||
    prevEq.mid !== nextEq.mid ||
    prevEq.high !== nextEq.high
  ) {
    changes.push('eq');
  }

  const prevReverb = prev?.reverb || null;
  const nextReverb = next.reverb || null;
  if (
    !prevReverb ||
    !nextReverb ||
    Boolean(prevReverb.enabled) !== Boolean(nextReverb.enabled) ||
    prevReverb.mix !== nextReverb.mix ||
    prevReverb.decay !== nextReverb.decay
  ) {
    changes.push('reverb');
  }

  const prevCompressor = prev?.compressor || null;
  const nextCompressor = next.compressor || null;
  if (
    !prevCompressor ||
    !nextCompressor ||
    Boolean(prevCompressor.enabled) !== Boolean(nextCompressor.enabled) ||
    prevCompressor.threshold !== nextCompressor.threshold ||
    prevCompressor.ratio !== nextCompressor.ratio ||
    prevCompressor.release !== nextCompressor.release
  ) {
    changes.push('compressor');
  }

  return Array.from(new Set(changes));
}

export function normalizeHeroAudioProfile(
  rawHero,
  { fallbackHeroId = null, fallbackHeroName = '' } = {}
) {
  if (!rawHero || typeof rawHero !== 'object') {
    return null;
  }

  const bgmUrl = rawHero.bgm_url || rawHero.bgmUrl || null;
  if (!bgmUrl) {
    return null;
  }

  const rawDuration =
    rawHero.bgm_duration_seconds ??
    rawHero.bgmDurationSeconds ??
    rawHero.bgmDuration ??
    rawHero.duration;
  const duration =
    Number.isFinite(Number(rawDuration)) && Number(rawDuration) > 0
      ? Math.round(Number(rawDuration))
      : null;

  const audioProfile = rawHero.audio_profile || rawHero.audioProfile || null;
  const trackSources = [];

  if (audioProfile) {
    const playlists = [];
    if (Array.isArray(audioProfile.playlist)) {
      playlists.push(...audioProfile.playlist);
    }
    if (Array.isArray(audioProfile.tracks)) {
      playlists.push(...audioProfile.tracks);
    }
    if (Array.isArray(audioProfile.bgms)) {
      playlists.push(...audioProfile.bgms);
    }
    playlists.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      trackSources.push(entry);
    });
  }

  const heroBgms = rawHero.hero_bgms || rawHero.heroBgms;
  if (Array.isArray(heroBgms)) {
    heroBgms.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      trackSources.push(entry);
    });
  }

  const sanitizedTracks = [];
  const seenUrls = new Set();

  trackSources.forEach((entry, index) => {
    const url = entry.url || entry.src || entry.href || null;
    if (!url || typeof url !== 'string') {
      return;
    }
    if (seenUrls.has(url)) {
      return;
    }
    seenUrls.add(url);

    const trackId =
      entry.id ||
      entry.key ||
      entry.slug ||
      (typeof entry.label === 'string' && entry.label.trim()) ||
      `track-${index}`;

    const durationValue =
      entry.duration_seconds ?? entry.durationSeconds ?? entry.duration ?? entry.length ?? null;

    sanitizedTracks.push({
      id: trackId,
      label:
        entry.label ||
        entry.name ||
        entry.title ||
        entry.displayName ||
        `${fallbackHeroName || '브금'} 트랙`,
      url,
      duration: Number.isFinite(Number(durationValue))
        ? Math.max(0, Math.round(Number(durationValue)))
        : null,
      type: entry.type || entry.kind || entry.mood || null,
      presetId: entry.preset_id || entry.presetId || entry.preset || null,
      sortOrder: Number.isFinite(Number(entry.sort_order || entry.sortOrder))
        ? Number(entry.sort_order || entry.sortOrder)
        : index,
    });
  });

  if (bgmUrl && !seenUrls.has(bgmUrl)) {
    sanitizedTracks.push({
      id: 'primary-track',
      label: `${fallbackHeroName || rawHero.name || '대표'} 테마`,
      url: bgmUrl,
      duration,
      type: '대표',
      presetId: null,
      sortOrder: -1,
    });
  }

  sanitizedTracks.sort((a, b) => {
    if (a.sortOrder === b.sortOrder) {
      return a.label.localeCompare(b.label);
    }
    return a.sortOrder - b.sortOrder;
  });

  const defaultTrackIdRaw =
    audioProfile?.defaultTrackId ||
    audioProfile?.defaultTrack ||
    audioProfile?.initialTrack ||
    null;

  const defaultTrack =
    sanitizedTracks.find(track => track.id === defaultTrackIdRaw) || sanitizedTracks[0] || null;

  const eqSettings = normalizeEqSettings(
    audioProfile?.eq || audioProfile?.equalizer || rawHero.audio_eq || rawHero.audioEq
  );
  const reverbSettings = normalizeReverbSettings(
    audioProfile?.reverb || rawHero.audio_reverb || rawHero.audioReverb
  );
  const compressorSettings = normalizeCompressorSettings(
    audioProfile?.compressor || rawHero.audio_compressor || rawHero.audioCompressor
  );

  const rawPresets = [];
  if (audioProfile?.presets && Array.isArray(audioProfile.presets)) {
    rawPresets.push(...audioProfile.presets);
  } else if (audioProfile?.presetMap && typeof audioProfile.presetMap === 'object') {
    Object.entries(audioProfile.presetMap).forEach(([key, value]) => {
      rawPresets.push({ id: key, ...(value || {}) });
    });
  }

  const presets = rawPresets
    .map((preset, index) => {
      if (!preset || typeof preset !== 'object') return null;
      const id = preset.id || preset.key || preset.slug || `preset-${index}`;
      const label = preset.label || preset.name || preset.title || `프리셋 ${index + 1}`;
      return {
        id,
        label,
        description: preset.description || preset.summary || '',
        eq:
          preset.eq || preset.equalizer ? normalizeEqSettings(preset.eq || preset.equalizer) : null,
        reverb: preset.reverb ? normalizeReverbSettings(preset.reverb) : null,
        compressor: preset.compressor ? normalizeCompressorSettings(preset.compressor) : null,
        tags: Array.isArray(preset.tags)
          ? preset.tags.filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim())
          : [],
      };
    })
    .filter(Boolean);

  const defaultPresetIdRaw =
    audioProfile?.defaultPresetId ||
    audioProfile?.defaultPreset ||
    audioProfile?.initialPreset ||
    null;

  const defaultPreset = presets.find(preset => preset.id === defaultPresetIdRaw) || null;

  return {
    heroId: rawHero.id || fallbackHeroId || null,
    heroName: rawHero.name || fallbackHeroName || '',
    bgmUrl,
    bgmDuration: duration,
    tracks: sanitizedTracks,
    defaultTrackId: defaultTrack?.id || null,
    eq: eqSettings,
    reverb: reverbSettings,
    compressor: compressorSettings,
    presets,
    defaultPresetId: defaultPreset?.id || null,
  };
}

export function formatDurationLabel(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) {
    return null;
  }

  const total = Math.max(0, Math.round(Number(seconds)));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatDbLabel(value) {
  if (!Number.isFinite(value)) return '0dB';
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}dB`;
}

export function formatPercentLabel(value) {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`;
}

export function formatSecondsLabel(value) {
  if (!Number.isFinite(value)) return '0.0s';
  return `${(Math.round(Math.max(value, 0) * 10) / 10).toFixed(1)}s`;
}

export function formatMillisecondsLabel(value) {
  if (!Number.isFinite(value)) return '0ms';
  return `${Math.round(Math.max(value, 0) * 1000)}ms`;
}

export function formatRatioLabel(value) {
  if (!Number.isFinite(value)) return '1.0:1';
  return `${(Math.round(Math.max(value, 0) * 10) / 10).toFixed(1)}:1`;
}
