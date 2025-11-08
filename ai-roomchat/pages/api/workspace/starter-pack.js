import fs from 'fs';
import path from 'path';

function safeRead(abs) {
  try { return fs.readFileSync(abs, 'utf8'); } catch { return null; }
}

function addFile(root, rel, readonly = false) {
  const abs = path.join(root, rel);
  const content = safeRead(abs);
  if (content == null) return null;
  return { path: rel.replace(/\\/g, '/'), content, readonly };
}

export default async function handler(req, res) {
  try {
    const ROOT = process.cwd();
    const base = path.join(ROOT, 'ai-roomchat');

    const srcGame = path.join(base, 'src', 'game');
    const srcDocs = path.join(base, 'src', 'docs');
    const docs = path.join(base, 'docs');

    const files = [];
    // User-editable game starter
    files.push(addFile(srcGame, 'index.js', false));
    files.push(addFile(srcGame, path.join('assets', 'manifest.sample.json'), false));
    files.push(addFile(srcGame, path.join('network', 'socketioAdapter.sample.js'), false));
    files.push(addFile(srcGame, path.join('scenes', 'textScene.sample.json'), false));
    files.push(addFile(srcGame, path.join('prompts', 'defaults.md'), false));
    files.push(addFile(srcGame, 'README.md', true));

    // Samples (editable)
    files.push(addFile(srcGame, path.join('samples', '2d.platformer.js'), false));
    files.push(addFile(srcGame, path.join('samples', '3d.basic.js'), false));
    files.push(addFile(srcGame, path.join('samples', 'network.sync.js'), false));
    files.push(addFile(srcGame, path.join('samples', 'chat.ai-orchestration.js'), false));
    files.push(addFile(srcGame, path.join('samples', 'text.ai-judge.js'), false));

    // Editor-facing guides (read-only)
    files.push(addFile(srcDocs, 'README.md', true));
    files.push(addFile(srcDocs, 'AI_CODE_CHAT.md', true));
    files.push(addFile(srcDocs, 'REFERENCE_KEYS.md', true));

    // Core guides from docs (read-only)
    const coreDocs = [
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
    for (const rel of coreDocs) {
      const f = addFile(docs, rel, true);
      if (f) files.push({ ...f, path: `Guides/${rel}` });
    }

    const out = files.filter(Boolean);
    res.status(200).json({ files: out, count: out.length });
  } catch (e) {
    res.status(500).json({ error: 'starter-pack-failed' });
  }
}

export const config = { runtime: 'nodejs' };
