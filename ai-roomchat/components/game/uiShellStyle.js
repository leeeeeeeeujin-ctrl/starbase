// UI Shell style token helper
// Maps simple design tokens (padding, gap, radius, tone, align, density)
// to inline style objects that Shell* widgets can consume.

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

/**
 * Convert shell style tokens into a plain CSS-in-JS style object.
 *
 * This is intentionally conservative: it only applies safe, layout‑agnostic
 * properties. Visual tone / density are kept for future use.
 *
 * @param {object} styleProps
 * @returns {object} style
 */
export function applyShellStyleProps(styleProps) {
  const props = styleProps || {};
  const style = {};

  if (props.padding && props.padding in PADDING_MAP) {
    const v = PADDING_MAP[props.padding];
    style.padding = `${v}px`;
  }

  if (props.gap && props.gap in GAP_MAP) {
    const v = GAP_MAP[props.gap];
    // Many widgets use flex/column layout; gap is generally safe
    style.gap = `${v}px`;
  }

  if (props.radius && props.radius in RADIUS_MAP) {
    const v = RADIUS_MAP[props.radius];
    style.borderRadius = `${v}px`;
  }

  if (props.align) {
    const ALIGN_MAP = {
      start: 'flex-start',
      center: 'center',
      end: 'flex-end',
    };
    if (props.align in ALIGN_MAP) {
      const v = ALIGN_MAP[props.align];
      // alignSelf는 다른 레이아웃에 영향이 적어 기본값으로 사용한다.
      style.alignSelf = v;
    }
  }

  // tone: 위젯 카드의 배경/테두리 느낌만 살짝 바꾼다.
  if (props.tone) {
    const tone = String(props.tone);
    if (tone === 'primary') {
      if (!style.background) {
        style.background = 'rgba(37,99,235,0.22)';
      }
      if (!style.border) {
        style.border = '1px solid rgba(96,165,250,0.7)';
      }
    } else if (tone === 'secondary') {
      if (!style.background) {
        style.background = 'rgba(15,23,42,0.9)';
      }
      if (!style.border) {
        style.border = '1px solid rgba(148,163,184,0.45)';
      }
    } else if (tone === 'muted') {
      if (!style.background) {
        style.background = 'rgba(15,23,42,0.85)';
      }
      if (!style.border) {
        style.border = '1px dashed rgba(148,163,184,0.4)';
      }
    } else if (tone === 'danger') {
      if (!style.background) {
        style.background = 'rgba(220,38,38,0.18)';
      }
      if (!style.border) {
        style.border = '1px solid rgba(248,113,113,0.85)';
      }
    }
  }

  // density: 카드 내부의 전반적인 밀도만 조절한다.
  if (props.density) {
    const d = String(props.density);
    if (d === 'compact') {
      if (!style.fontSize) style.fontSize = '12px';
      // padding 이 이미 있으면 살짝 줄인다.
      if (style.padding && typeof style.padding === 'string' && style.padding.endsWith('px')) {
        const n = parseInt(style.padding.replace('px', ''), 10);
        if (!Number.isNaN(n)) style.padding = `${Math.max(0, n - 2)}px`;
      }
    } else if (d === 'relaxed') {
      if (!style.fontSize) style.fontSize = '14px';
    }
  }

  return style;
}
