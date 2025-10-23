function normalizeSameSite(value) {
  if (!value) return undefined;
  const normalized = String(value).toLowerCase();
  if (normalized === 'none') return 'None';
  if (normalized === 'lax') return 'Lax';
  if (normalized === 'strict') return 'Strict';
  return undefined;
}

export function serializeCookie(name, value, options = {}) {
  if (typeof name !== 'string' || !name) {
    throw new TypeError('Cookie name must be a non-empty string');
  }

  const stringValue = value === undefined ? '' : String(value);
  const segments = [`${name}=${encodeURIComponent(stringValue)}`];

  const {
    domain,
    expires,
    httpOnly = false,
    maxAge,
    path = '/',
    sameSite,
    secure = false,
  } = options;

  if (path) {
    segments.push(`Path=${path}`);
  }

  if (domain) {
    segments.push(`Domain=${domain}`);
  }

  if (typeof maxAge === 'number' && Number.isFinite(maxAge)) {
    segments.push(`Max-Age=${Math.floor(maxAge)}`);
  }

  if (expires instanceof Date) {
    segments.push(`Expires=${expires.toUTCString()}`);
  }

  const resolvedSameSite = normalizeSameSite(sameSite);
  if (resolvedSameSite) {
    segments.push(`SameSite=${resolvedSameSite}`);
  }

  if (secure) {
    segments.push('Secure');
  }

  if (httpOnly) {
    segments.push('HttpOnly');
  }

  return segments.join('; ');
}

export function parseCookies(header) {
  if (!header || typeof header !== 'string') {
    return {};
  }

  return header.split(';').reduce((accumulator, part) => {
    const [rawKey, ...rest] = part.split('=');
    if (!rawKey) {
      return accumulator;
    }

    const key = rawKey.trim();
    if (!key) {
      return accumulator;
    }

    const rawValue = rest.join('=');
    const value = rawValue ? decodeURIComponent(rawValue.trim()) : '';
    accumulator[key] = value;
    return accumulator;
  }, {});
}
