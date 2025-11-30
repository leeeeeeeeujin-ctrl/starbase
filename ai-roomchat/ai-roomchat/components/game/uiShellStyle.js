"use client";

// Small helper to turn ui.shell-style tokens into inline styles.
// This file is intentionally tiny and dependency‑free so it can be
// shared by future GameShell / widget implementations without
// pulling in any React code.

const PADDING_MAP = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
};

const GAP_MAP = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 8,
};

const RADIUS_MAP = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  full: 9999,
};

// tone / density are left as soft hints for now.
// We only expose a minimal mapping to keep this helper
// safe to use from any environment.
const TONE_BG = {
  primary: 'rgba(37,99,235,0.12)',
  secondary: 'rgba(148,163,184,0.08)',
  muted: 'rgba(15,23,42,0.85)',
  danger: 'rgba(248,113,113,0.15)',
};

/**
 * Convert simple ui.shell style tokens into a plain inline-style object.
 *
 * @param {object} styleProps
 *   { padding, gap, radius, tone, align, density }
 */
export function applyShellStyleProps(styleProps = {}) {
  const {
    padding,
    gap,
    radius,
    tone,
    align,
    density, // reserved – may influence font-size / line-height later
  } = styleProps || {};

  const style = {};

  if (padding && PADDING_MAP[padding] != null) {
    const v = PADDING_MAP[padding];
    style.padding = v;
  }

  if (gap && GAP_MAP[gap] != null) {
    const v = GAP_MAP[gap];
    style.gap = v;
  }

  if (radius && RADIUS_MAP[radius] != null) {
    style.borderRadius = RADIUS_MAP[radius];
  }

  if (tone && TONE_BG[tone]) {
    style.backgroundColor = TONE_BG[tone];
  }

  if (align) {
    if (align === 'center') {
      style.alignItems = 'center';
      style.textAlign = 'center';
    } else if (align === 'end') {
      style.alignItems = 'flex-end';
      style.textAlign = 'right';
    } else if (align === 'start') {
      style.alignItems = 'flex-start';
      style.textAlign = 'left';
    }
  }

  return style;
}

