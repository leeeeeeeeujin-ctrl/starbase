import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const DATA_DIR = path.join(process.cwd(), 'ai-roomchat', 'data');
const FILE_PATH = path.join(DATA_DIR, 'prompt_templates.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, JSON.stringify({ items: [] }, null, 2));
}

function readAll() {
  ensureDataFile();
  const raw = fs.readFileSync(FILE_PATH, 'utf8');
  return JSON.parse(raw).items || [];
}

function writeAll(items) {
  ensureDataFile();
  fs.writeFileSync(FILE_PATH, JSON.stringify({ items }, null, 2));
}

async function dbGetById(id) {
  const { data, error } = await supabaseAdmin.from('prompt_templates').select('*').eq('id', id).limit(1).single();
  if (error) throw error;
  return data;
}

async function dbUpdateById(id, updates) {
  const { data, error } = await supabaseAdmin.from('prompt_templates').update(updates).eq('id', id).select().limit(1).single();
  if (error) throw error;
  return data;
}

async function dbDeleteById(id) {
  const { data, error } = await supabaseAdmin.from('prompt_templates').delete().eq('id', id).select();
  if (error) throw error;
  return data;
}

export default async function handler(req, res) {
  try {
    const { id } = req.query;

    if (req.method === 'GET') {
      try {
        const item = await dbGetById(id);
        if (!item) return res.status(404).json({ error: 'not found' });
        return res.status(200).json({ item });
      } catch (dbErr) {
        // fallback to file
        const items = readAll();
        const found = items.find(i => i.id === id);
        if (!found) return res.status(404).json({ error: 'not found' });
        return res.status(200).json({ item: found });
      }
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = req.body || {};
      try {
        const updates = {
          name: body.name,
          body: body.body,
          meta: body.meta || {},
          updated_at: new Date().toISOString(),
        };
        const updated = await dbUpdateById(id, updates);
        return res.status(200).json({ item: updated });
      } catch (dbErr) {
        const items = readAll();
        const found = items.find(i => i.id === id);
        if (!found) return res.status(404).json({ error: 'not found' });
        found.name = body.name || found.name;
        found.body = body.body || found.body;
        found.meta = body.meta || found.meta;
        found.updated_at = new Date().toISOString();
        writeAll(items);
        return res.status(200).json({ item: found });
      }
    }

    if (req.method === 'DELETE') {
      try {
        await dbDeleteById(id);
        return res.status(204).end();
      } catch (dbErr) {
        const items = readAll();
        const idx = items.findIndex(i => i.id === id);
        if (idx === -1) return res.status(404).json({ error: 'not found' });
        items.splice(idx, 1);
        writeAll(items);
        return res.status(204).end();
      }
    }

    return res.setHeader('Allow', 'GET, PUT, PATCH, DELETE').status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error('prompt-templates id error', err);
    return res.status(500).json({ error: String(err) });
  }
}
