const SEARCH_ENDPOINTS = [
  'https://piped.video/api/v1/search',
  'https://pipedapi.kavin.rocks/search',
  'https://piped.darkness.services/api/v1/search',
]
const DEFAULT_LIMIT = 12

async function fetchFromEndpoint(endpoint, query, limit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const url = new URL(endpoint)
    url.searchParams.set('q', query)
    url.searchParams.set('region', 'KR')
    url.searchParams.set('filter', 'videos')
    url.searchParams.set('limit', String(limit))
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        accept: 'application/json, text/plain, */*',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      },
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || 'failed_to_fetch')
    }
    const raw = await response.text()
    let payload
    try {
      payload = JSON.parse(raw)
    } catch (error) {
      throw new Error('invalid_response')
    }
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : []
    if (!items.length) {
      return []
    }
    return items.map((item) => ({
      id: item.id || item.url || item.videoId || null,
      title: item.title || '',
      author: item.uploader || item.channel || item.author || '',
      thumbnail:
        (Array.isArray(item.thumbnails) && item.thumbnails.length ? item.thumbnails[0] : null) ||
        item.thumbnail ||
        item.thumbnailUrl ||
        null,
      url: item.url || (item.id ? `https://www.youtube.com/watch?v=${item.id}` : null),
      duration: item.duration || item.durationText || item.duration_raw || item.lengthSeconds || '',
      publishedAt: item.uploaded || item.uploadedDate || item.published || null,
    }))
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchYoutubeResults(query, limit) {
  let lastError = null
  for (const endpoint of SEARCH_ENDPOINTS) {
    try {
      const results = await fetchFromEndpoint(endpoint, query, limit)
      if (Array.isArray(results) && results.length) {
        return results
      }
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) {
    throw lastError
  }
  return []
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const query = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (!query) {
    return res.status(400).json({ error: 'missing_query' })
  }

  const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit
  const parsedLimit = Number.parseInt(limitParam, 10)
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 30) : DEFAULT_LIMIT

  try {
    const results = await fetchYoutubeResults(query, limit)
    return res.status(200).json({ results })
  } catch (error) {
    const status = error.name === 'AbortError' ? 504 : 502
    return res.status(status).json({ error: 'search_failed', detail: error.message || null })
  }
}
