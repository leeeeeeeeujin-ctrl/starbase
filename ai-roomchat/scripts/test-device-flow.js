// test-device-flow.js
// 1) create an in-memory prompt
// 2) render it
// 3) POST to mobile-runner-mock
// 4) run server-side verifier and save run to in-memory store

// Import fetch dynamically (node environments may not have global fetch)
async function getFetch() {
  try {
    return globalThis.fetch
  } catch (e) {}
  const mod = await import('node-fetch')
  return mod.default || mod
}
const { savePrompt, saveRun, listRunsForPrompt } = require('../lib/promptStore')
const { renderTemplate } = require('../lib/promptRenderer')
const { verifyProviderResponse } = require('../lib/providers/verifyProviderResponse')

async function main() {
  const prompt = savePrompt({ id: 'device-test-1', name: 'device test', body: 'Hello {{name}}' })
  console.log('Saved prompt:', prompt.id)

  const input = { name: 'DeviceUser' }
  const rendered = renderTemplate(prompt.body, input)
  console.log('Rendered prompt:', rendered)

  // call mock runner
  const runnerUrl = process.env.RUNNER_URL || 'http://127.0.0.1:3001/run'
  const secret = process.env.RUNNER_SECRET || 'dev-secret'

  const fetch = await getFetch()

  let res
  let jr
  try {
    res = await fetch(runnerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-runner-secret': secret },
      body: JSON.stringify({ prompt: rendered }),
    })
    if (!res.ok) {
      console.error('Runner returned error', res.status, await res.text())
      throw new Error('runner_error')
    }
    jr = await res.json()
  } catch (err) {
    // Fallback to a local mock runner when HTTP call fails (useful for offline/dev)
    console.warn('HTTP runner failed, falling back to local mock runner:', String(err))
    jr = { text: `MOCK-GEMINI-RESP: ${rendered}`, raw: `MOCK-GEMINI-RESP: ${rendered}` }
  }
  console.log('Runner response:', jr)

  const providerResponse = { text: jr.text || '', rendered_prompt: rendered, raw: jr }

  const verification = verifyProviderResponse({ renderedPrompt: rendered, providerResponse })
  console.log('Verification:', verification)

  const status = verification.verified ? 'ok' : 'unverified'
  const storedResponse = verification.sanitizedResponse || providerResponse

  const runRecord = saveRun({ prompt_id: prompt.id, prompt_version: prompt.version, input, rendered_prompt: rendered, provider: 'client', provider_response: storedResponse, status })
  console.log('Saved run:', runRecord.id, 'status=', runRecord.status)

  const runs = listRunsForPrompt(prompt.id)
  console.log('Total runs for prompt:', runs.length)
}

main().catch((e) => { console.error(e && e.stack); process.exit(1) })
