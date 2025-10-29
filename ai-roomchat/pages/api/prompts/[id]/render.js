import { getPrompt } from '../../../../lib/promptStore'
import { renderTemplate } from '../../../../lib/promptRenderer'

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const { id } = req.query
  const p = getPrompt(id)
  if (!p) return res.status(404).json({ error: 'prompt not found' })

  const input = req.body && req.body.input ? req.body.input : {}
  const rendered = renderTemplate(p.body || '', input)
  return res.status(200).json({ rendered, warnings: [] })
}
