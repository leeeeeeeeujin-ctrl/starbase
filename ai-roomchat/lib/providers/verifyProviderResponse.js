// Simple verifier for client-submitted provider responses.
// Purpose: perform lightweight checks so the server can mark a run as verified or not
// without calling the LLM itself.

function redactText(text) {
  if (!text) return text
  // basic redaction: remove obvious secrets patterns
  return text
    .replace(/PRIVATE_KEY[^\s]*/gi, '[REDACTED]')
    .replace(/SECRET_[A-Z0-9_]+/gi, '[REDACTED]')
    .replace(/-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/gi, '[REDACTED]')
}

function verifyProviderResponse({ renderedPrompt, providerResponse = {}, opts = {} }) {
  const maxLength = opts.maxLength || 20000
  const bannedPatterns = opts.bannedPatterns || [/PRIVATE_KEY/i, /SECRET_/i, /PASSWORD/i]

  const result = { verified: false, reason: null, sanitizedResponse: null }

  if (!providerResponse) {
    result.reason = 'no_provider_response'
    return result
  }

  const text = String(providerResponse.text || '')

  if (!text) {
    result.reason = 'empty_text'
    return result
  }

  if (text.length > maxLength) {
    result.reason = 'too_long'
    // still include a truncated sanitized response
    result.sanitizedResponse = Object.assign({}, providerResponse, { text: text.slice(0, maxLength) })
    return result
  }

  const foundBanned = bannedPatterns.find((rx) => rx.test(text))
  if (foundBanned) {
    result.reason = 'contains_banned_pattern'
    return result
  }

  // If client provides rendered_prompt, ensure it matches server-rendered prompt.
  if (providerResponse.rendered_prompt && renderedPrompt) {
    const clientRendered = String(providerResponse.rendered_prompt || '').trim()
    const serverRendered = String(renderedPrompt || '').trim()
    if (clientRendered !== serverRendered) {
      result.reason = 'rendered_prompt_mismatch'
      // allow unverified but store sanitized version
      result.sanitizedResponse = Object.assign({}, providerResponse, { text: redactText(text).trim() })
      return result
    }
  }

  // Passed basic checks
  result.verified = true
  result.sanitizedResponse = Object.assign({}, providerResponse, { text: redactText(text).trim() })
  return result
}

module.exports = { verifyProviderResponse }
