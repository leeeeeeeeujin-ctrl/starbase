import { getPrompt as getPromptInMemory, saveRun as saveRunInMemory } from '../../../../lib/promptStore'
import { renderTemplate } from '../../../../lib/promptRenderer'
import { callProvider as mockCallProvider } from '../../../../lib/providers/mockProvider'
import { supabase as supabaseAdmin } from '../../../../lib/supabaseAdmin'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const { id } = req.query
  let p = null
  try {
    if (supabaseAdmin && supabaseAdmin.from) {
      const { data, error } = await supabaseAdmin.from('prompts').select('*').eq('id', id).limit(1).single()
      if (error) throw error
      p = data
    }
  } catch (err) {
    console.warn('Supabase get prompt failed, falling back to memory store', err.message)
  }

  if (!p) {
    p = getPromptInMemory(id)
  }

  if (!p) return res.status(404).json({ error: 'prompt not found' })

  const input = (req.body && req.body.input) || {}
  const provider = (req.body && req.body.provider) || 'mock'

  const rendered = renderTemplate(p.body || '', input)

  // If a client has already run the model (device-side) they can submit a provider_response.
  // Server will perform lightweight verification and persist the run as verified/unverified.
  const clientProviderResponse = (req.body && req.body.provider_response)
  const isClientRun = !!clientProviderResponse && (provider === 'client' || provider === 'gemini-client' || req.body.source === 'client')

  // select provider implementation
  let selectedCallProvider = mockCallProvider
  if (provider === 'gemini') {
    try {
      // dynamic require so server-side only and to avoid ESM/CJS top-level issues
      // eslint-disable-next-line global-require, import/no-extraneous-dependencies
      const gemini = require('../../../../lib/providers/geminiCliProvider')
      if (gemini && typeof gemini.callProvider === 'function') selectedCallProvider = gemini.callProvider
    } catch (e) {
      console.warn('Failed to load geminiCliProvider, falling back to mock provider', e && e.message)
    }
  }

  // If the caller provided a client-side provider response, verify it instead of calling the server provider.
  if (isClientRun) {
    try {
      // dynamic require verifier
      // eslint-disable-next-line global-require
      const { verifyProviderResponse } = require('../../../../lib/providers/verifyProviderResponse')
      const verification = verifyProviderResponse({ renderedPrompt: rendered, providerResponse: clientProviderResponse })

      const status = verification.verified ? 'ok' : 'unverified'
      const storedProviderResponse = verification.sanitizedResponse || clientProviderResponse

      // persist run
      try {
        if (supabaseAdmin && supabaseAdmin.from) {
          const toInsert = {
            prompt_id: id,
            prompt_version: p.version || null,
            input: input,
            rendered_prompt: rendered,
            provider: provider,
            provider_response: storedProviderResponse,
            status,
          }
          const { data: runRow, error } = await supabaseAdmin.from('prompt_runs').insert([toInsert]).select().single()
          if (error) throw error
          return res.status(200).json({ runId: runRow.id, providerResponse: storedProviderResponse, verified: verification.verified, reason: verification.reason })
        }
      } catch (err) {
        console.warn('Supabase save run failed, falling back to memory store', err && err.message)
      }

      const run = saveRunInMemory({ prompt_id: id, prompt_version: p.version, input, rendered_prompt: rendered, provider: provider, provider_response: storedProviderResponse, status })
      return res.status(200).json({ runId: run.id, providerResponse: storedProviderResponse, verified: verification.verified, reason: verification.reason })
    } catch (err) {
      console.warn('Client provider verification failed', err && err.message)
      return res.status(500).json({ error: 'verification_failed', detail: String(err) })
    }
  }

  try {
    const providerResponse = await selectedCallProvider({ provider, prompt: rendered })
    // persist run to supabase if available
    try {
      if (supabaseAdmin && supabaseAdmin.from) {
        const toInsert = {
          prompt_id: id,
          prompt_version: p.version || null,
          input: input,
          rendered_prompt: rendered,
          provider: provider,
          provider_response: providerResponse,
          status: 'ok',
        }
        const { data: runRow, error } = await supabaseAdmin.from('prompt_runs').insert([toInsert]).select().single()
        if (error) throw error
        return res.status(200).json({ runId: runRow.id, providerResponse })
      }
    } catch (err) {
      console.warn('Supabase save run failed, falling back to memory store', err.message)
    }

    const run = saveRunInMemory({ prompt_id: id, prompt_version: p.version, input, rendered_prompt: rendered, provider: provider, provider_response: providerResponse, status: 'ok' })
    return res.status(200).json({ runId: run.id, providerResponse })
  } catch (err) {
    try {
      if (supabaseAdmin && supabaseAdmin.from) {
        const toInsert = {
          prompt_id: id,
          prompt_version: p.version || null,
          input: input,
          rendered_prompt: rendered,
          provider: provider,
          provider_response: { error: String(err) },
          status: 'error',
        }
        const { data: runRow } = await supabaseAdmin.from('prompt_runs').insert([toInsert]).select().single()
        return res.status(500).json({ error: String(err), runId: runRow && runRow.id })
      }
    } catch (err2) {
      console.warn('Supabase save run error failed, falling back to memory store', err2.message)
    }

    const run = saveRunInMemory({ prompt_id: id, prompt_version: p.version, input, rendered_prompt: rendered, provider: provider, provider_response: { error: String(err) }, status: 'error' })
    return res.status(500).json({ error: String(err), runId: run.id })
  }
}
