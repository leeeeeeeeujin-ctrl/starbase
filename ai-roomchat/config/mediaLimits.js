// Centralized media limits and quality settings
// Adjust here to tune compression and validation across the app

export const IMAGE_LIMITS = {
  // Aim for ~80–100KB per image. We'll iterate quality/scale to hit targetBytes best-effort.
  maxWidth: 1280,             // px (upper bound before iterative downscale)
  maxHeight: 1280,            // px
  minWidth: 640,              // px (do not downscale below this unless unavoidable)
  minHeight: 640,             // px
  quality: 0.78,              // starting quality for WebP/JPEG
  minQuality: 0.5,            // lower bound to avoid severe artifacts
  qualityStep: 0.08,          // decrement per attempt if over budget
  targetBytes: 100 * 1024,    // 100KB target
};

// 480p = 854x480 (16:9). We cap to 480p and a modest bitrate to keep under ~20MB for 4 minutes.
export const VIDEO_LIMITS = {
  maxWidth: 854,         // px (approx 480p width for 16:9)
  maxHeight: 480,        // px
  targetBitrate: '560k', // video bitrate; with 96k audio ~= <20MB @ 4min
  maxBytes: 20 * 1024 * 1024, // 20MB best-effort budget
};

export const AUDIO_LIMITS = {
  // For background music. We transcode to MP3 96kbps, 44.1kHz. 240s => ~2.9MB; reserve headroom.
  codec: 'mp3',
  bitrate: '96k',
  sampleRate: 44100,
  maxDurationSeconds: 240,   // 4 minutes
  maxBytes: 6 * 1024 * 1024, // 6MB budget
};

export function withinBudget(size, maxBytes) {
  if (!Number.isFinite(size) || !Number.isFinite(maxBytes)) return true;
  return size <= maxBytes;
}
