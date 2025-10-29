import { getPrompt as getPromptInMemory, savePrompt as savePromptInMemory } from '../../../lib/promptStore'
import { supabase as supabaseAdmin } from '../../../lib/supabaseAdmin'

export default function handler(req, res) {
  const { id } = req.query

  if (req.method === 'GET') {
    try {
      if (supabaseAdmin && supabaseAdmin.from) {
        const { data, error } = await supabaseAdmin.from('prompts').select('*').eq('id', id).limit(1).single()
        if (error) throw error
        return res.status(200).json(data || null)
      }
    } catch (err) {
      console.warn('Supabase get prompt failed, falling back to memory store', err.message)
    }

    const p = getPromptInMemory(id)
    if (!p) return res.status(404).json({ error: 'not found' })
    return res.status(200).json(p)
  }

  if (req.method === 'PUT') {
    const body = req.body || {}
    const data = Object.assign({}, body, { id })
    try {
      if (supabaseAdmin && supabaseAdmin.from) {
        const { data: updated, error } = await supabaseAdmin.from('prompts').upsert(data).select().single()
        if (error) throw error
        return res.status(200).json(updated)
      }
    } catch (err) {
      console.warn('Supabase upsert prompt failed, falling back to memory store', err.message)
    }

    const rec = savePromptInMemory(data)
    return res.status(200).json(rec)
  }

  res.setHeader('Allow', 'GET,PUT')
  res.status(405).end('Method Not Allowed')
}
