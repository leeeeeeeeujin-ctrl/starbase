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

async function dbListTemplates() {
  // Use supabaseAdmin if available; throws if not configured
  const { data, error } = await supabaseAdmin.from('prompt_templates').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function dbCreateTemplate(item) {
  const { data, error } = await supabaseAdmin.from('prompt_templates').insert(item).select().limit(1).single();
  if (error) throw error;
  return data;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Prefer DB-backed store when configured, fallback to file
      try {
        const items = await dbListTemplates();
        return res.status(200).json({ items });
      } catch (dbErr) {
        // Fallback to file system store
        const items = readAll();
        return res.status(200).json({ items });
      }
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.name || !body.body) {
        return res.status(400).json({ error: 'name and body are required' });
      }

      const id = body.id || `pt_${Date.now()}`;
      const now = new Date().toISOString();
      const item = {
        id,
        name: body.name,
        body: body.body,
        meta: body.meta || {},
        created_at: now,
        updated_at: now,
      };

      // Try DB first, fall back to file
      try {
        const created = await dbCreateTemplate(item);
        return res.status(201).json({ item: created });
      } catch (dbErr) {
        const items = readAll();
        items.push(item);
        writeAll(items);
        return res.status(201).json({ item });
      }
    }

    return res.setHeader('Allow', 'GET, POST').status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error('prompt-templates index error', err);
    return res.status(500).json({ error: String(err) });
  }
}
