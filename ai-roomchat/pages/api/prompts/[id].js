import {
  getPrompt as getPromptInMemory,
  savePrompt as savePromptInMemory,
} from '../../../lib/promptStore';
import { supabase as supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      if (supabaseAdmin && supabaseAdmin.from) {
        const { data, error } = await supabaseAdmin
          .from('prompts')
          .select('*')
          .eq('id', id)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (data) return res.status(200).json(data);
      }
    } catch (err) {
      console.warn('Supabase get prompt failed, falling back to memory store', err.message);
    }

    const p = getPromptInMemory(id);
    if (!p) return res.status(404).json({ error: 'not found' });
    return res.status(200).json(p);
  }

  if (req.method === 'PUT') {
    const body = req.body || {};
    const data = Object.assign({}, body, { id });
    try {
      if (supabaseAdmin && supabaseAdmin.from) {
        const { data: updated, error } = await supabaseAdmin
          .from('prompts')
          .upsert(data)
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!updated) {
          // Supabase may return no row when returning=representation is disabled.
          return res.status(200).json(data);
        }
        return res.status(200).json(updated);
      }
    } catch (err) {
      console.warn('Supabase upsert prompt failed, falling back to memory store', err.message);
    }

    const rec = savePromptInMemory(data);
    return res.status(200).json(rec);
  }

  res.setHeader('Allow', 'GET,PUT');
  res.status(405).end('Method Not Allowed');
}
