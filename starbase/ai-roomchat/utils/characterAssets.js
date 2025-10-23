export function sanitizeFileName(base, fallback = 'asset') {
  const safe = String(base || fallback)
    .normalize('NFKD')
    .replace(/[^\w\d-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || fallback;
}

export function extractFileName(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');
    const last = parts[parts.length - 1];
    return last || url;
  } catch (error) {
    const pieces = String(url).split('/');
    return pieces[pieces.length - 1] || url;
  }
}

//
//
