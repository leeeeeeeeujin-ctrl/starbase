import {
  savePrompt as savePromptInMemory,
  listPrompts as listPromptsInMemory,
} from '../../../lib/promptStore';
import { supabase as supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Try Supabase first
    try {
      if (supabaseAdmin && supabaseAdmin.from) {
        const { data, error } = await supabaseAdmin.from('prompts').select('*');
        if (error) throw error;
        return res.status(200).json(data || []);
      }
    } catch (err) {
      // fall through to in-memory
      console.warn('Supabase list prompts failed, falling back to memory store', err.message);
    }

    const items = listPromptsInMemory();
    return res.status(200).json(items);
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const data = {
      id: body.id,
      name: body.name,
      body: body.body,
      format: body.format || 'template',
      metadata: body.metadata || {},
      created_by: req.headers['x-user'] || 'local',
    };

    // Try to save to Supabase (server-side) if available
    try {
      if (supabaseAdmin && supabaseAdmin.from) {
        const { data: inserted, error } = await supabaseAdmin
          .from('prompts')
          .insert([data])
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json(inserted);
      }
    } catch (err) {
      console.warn('Supabase save prompt failed, falling back to memory store', err.message);
    }

    const rec = savePromptInMemory(data);
    return res.status(201).json(rec);
  }

  res.setHeader('Allow', 'GET,POST');
  res.status(405).end('Method Not Allowed');
}
