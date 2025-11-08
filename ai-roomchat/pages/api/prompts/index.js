import {
  savePrompt as savePromptInMemory,
  listPrompts as listPromptsInMemory,
  getPrompt as getPromptInMemory,
} from '../../../lib/promptStore';
import { getSet as getWorkspaceSet, saveSet as saveWorkspaceSet } from '@/lib/workspace/setStore';
import { buildStarterPack } from '@/lib/workspace/getStarterPackFiles';
import path from 'path';
import { supabase as supabaseAdmin } from '../../../lib/supabaseAdmin';

// Simple in-memory idempotency cache for create requests
// Maps X-Request-Id -> created record
const IDEMPOTENCY_CACHE = new Map();

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
    // Idempotency key support to prevent double creation on duplicate requests
    const requestId = String(req.headers['x-request-id'] || req.headers['x-idempotency-key'] || '').trim();
    if (requestId && IDEMPOTENCY_CACHE.has(requestId)) {
      return res.status(201).json(IDEMPOTENCY_CACHE.get(requestId));
    }

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
        // If client provided an id, prefer returning existing to be idempotent
        if (data.id) {
          try {
            const { data: existing, error: selErr } = await supabaseAdmin
              .from('prompts')
              .select('*')
              .eq('id', data.id)
              .single();
            if (!selErr && existing) {
              // Ensure corresponding workspace set exists (best-effort)
              try {
                const setCur = getWorkspaceSet(existing.id);
                if (!setCur) {
                  const base = path.join(process.cwd(), 'ai-roomchat');
                  const files = buildStarterPack(base);
                  saveWorkspaceSet(existing.id, files, { starterApplied: true });
                }
              } catch {}
              if (requestId) IDEMPOTENCY_CACHE.set(requestId, existing);
              return res.status(201).json(existing);
            }
          } catch {}
        }
        const { data: inserted, error } = await supabaseAdmin
          .from('prompts')
          .insert([data])
          .select()
          .single();
        if (error) throw error;
        // Create matching workspace set (best-effort, id = prompt id)
        try {
          const setCur = getWorkspaceSet(inserted.id);
          if (!setCur) {
            const base = path.join(process.cwd(), 'ai-roomchat');
            const files = buildStarterPack(base);
            saveWorkspaceSet(inserted.id, files, { starterApplied: true });
          }
        } catch {}
        if (requestId) IDEMPOTENCY_CACHE.set(requestId, inserted);
        return res.status(201).json(inserted);
      }
    } catch (err) {
      console.warn('Supabase save prompt failed, falling back to memory store', err.message);
    }

    // In-memory store path with idempotency
    if (data.id) {
      const existing = getPromptInMemory(data.id);
      if (existing) {
        // Ensure matching workspace set exists
        try {
          const setCur = getWorkspaceSet(existing.id);
          if (!setCur) {
            const base = path.join(process.cwd(), 'ai-roomchat');
            const files = buildStarterPack(base);
            saveWorkspaceSet(existing.id, files, { starterApplied: true });
          }
        } catch {}
        if (requestId) IDEMPOTENCY_CACHE.set(requestId, existing);
        return res.status(201).json(existing);
      }
    }
    const rec = savePromptInMemory(data);
    // Create matching workspace set (best-effort)
    try {
      const setCur = getWorkspaceSet(rec.id);
      if (!setCur) {
        const base = path.join(process.cwd(), 'ai-roomchat');
        const files = buildStarterPack(base);
        saveWorkspaceSet(rec.id, files, { starterApplied: true });
      }
    } catch {}
    if (requestId) IDEMPOTENCY_CACHE.set(requestId, rec);
    return res.status(201).json(rec);
  }

  res.setHeader('Allow', 'GET,POST');
  res.status(405).end('Method Not Allowed');
}
