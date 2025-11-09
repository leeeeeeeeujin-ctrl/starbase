export async function apiFetch(path, opts = {}) {
  // Minimal wrapper used by frontend components during development.
  // Caller can rely on fetch semantics; we forward headers and body.
  try {
    const res = await fetch(path, opts);
    return res;
  } catch (err) {
    // Normalize to a Response-like rejected promise
    throw err;
  }
}
