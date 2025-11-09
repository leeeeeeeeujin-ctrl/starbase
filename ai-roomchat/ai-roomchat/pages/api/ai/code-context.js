import fs from 'fs';
import path from 'path';

const MAX_PER_FILE = 4000; // chars per file excerpt cap

function readExcerpt(abs) {
  try {
    const txt = fs.readFileSync(abs, 'utf8');
    return txt.length > MAX_PER_FILE ? txt.slice(0, MAX_PER_FILE) + "\n\n..." : txt;
  } catch {
    return null;
  }
}

function gatherDocs(root) {
  const docsDir = path.join(root, 'ai-roomchat', 'docs');
  const srcDocsDir = path.join(root, 'ai-roomchat', 'src', 'docs');
  const includeDocs = [
    'PLUGIN_HOST.md',
    'GAME_ADAPTERS.md',
    'NETWORK_ADAPTERS.md',
    'AI_ORCHESTRATION.md',
    'IN_GAME_CHAT.md',
    'CHARACTER_DATA.md',
    'MOBILE_CONTROLS.md',
    'STATE_AND_TURNS.md',
    'TEXT_GAME_ENGINE.md',
    'GENRE_STARTERS.md',
    'REFERENCE_DATA.md',
    'FEATURE_FLAGS.md',
  ];
  const includeSrcDocs = [
    'README.md',
    'AI_CODE_CHAT.md',
    'REFERENCE_KEYS.md',
  ];

  const sections = [];
  for (const rel of includeDocs) {
    const abs = path.join(docsDir, rel);
    const content = readExcerpt(abs);
    if (content) sections.push({ path: `docs/${rel}`, content });
  }
  for (const rel of includeSrcDocs) {
    const abs = path.join(srcDocsDir, rel);
    const content = readExcerpt(abs);
    if (content) sections.push({ path: `src/docs/${rel}`, content });
  }
  return sections;
}

function listSamples(root) {
  const gameDir = path.join(root, 'ai-roomchat', 'src', 'game');
  function walk(dir, base = '') {
    let out = [];
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const it of items) {
        if (it.name.startsWith('.')) continue;
        const rel = path.posix.join(base, it.name);
        const abs = path.join(dir, it.name);
        if (it.isDirectory()) out = out.concat(walk(abs, rel));
        else out.push(rel);
      }
    } catch {}
    return out;
  }
  const files = walk(gameDir, 'src/game');
  return files;
}

export default async function handler(req, res) {
  try {
    const ROOT = process.cwd();
    const sections = gatherDocs(ROOT);
    const samples = listSamples(ROOT);
    res.status(200).json({ sections, samples });
  } catch (e) {
    res.status(500).json({ error: 'code-context-failed' });
  }
}

export const config = { runtime: 'nodejs' };

