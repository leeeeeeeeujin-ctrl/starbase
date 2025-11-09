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

export function buildStarterPack(rootDir) {
  const base = rootDir;
  const srcGame = path.join(base, 'src', 'game');
  const srcDocs = path.join(base, 'src', 'docs');
  const docs = path.join(base, 'docs');
  const files = [];
  const mapPath = (file, prefix) => file ? { ...file, path: `${prefix.replace(/\/$/, '')}/${file.path}` } : null;

  // Game (editable; README is readonly)
  files.push(mapPath(addFile(srcGame, 'index.js', false), 'Game'));
  files.push(mapPath(addFile(srcGame, path.join('assets', 'manifest.sample.json'), false), 'Game'));
  files.push(mapPath(addFile(srcGame, path.join('network', 'socketioAdapter.sample.js'), false), 'Game'));
  files.push(mapPath(addFile(srcGame, path.join('scenes', 'textScene.sample.json'), false), 'Game'));
  files.push(mapPath(addFile(srcGame, path.join('prompts', 'defaults.md'), false), 'Game'));
  files.push(mapPath(addFile(srcGame, 'README.md', true), 'Game'));

  // Samples (editable)
  files.push(mapPath(addFile(srcGame, path.join('samples', '2d.platformer.js'), false), 'Samples'));
  files.push(mapPath(addFile(srcGame, path.join('samples', '3d.basic.js'), false), 'Samples'));
  files.push(mapPath(addFile(srcGame, path.join('samples', 'network.sync.js'), false), 'Samples'));
  files.push(mapPath(addFile(srcGame, path.join('samples', 'chat.ai-orchestration.js'), false), 'Samples'));
  files.push(mapPath(addFile(srcGame, path.join('samples', 'text.ai-judge.js'), false), 'Samples'));

  // Editor-facing guides (read-only)
  files.push(mapPath(addFile(srcDocs, 'README.md', true), 'Guides'));
  files.push(mapPath(addFile(srcDocs, 'AI_CODE_CHAT.md', true), 'Guides'));
  files.push(mapPath(addFile(srcDocs, 'REFERENCE_KEYS.md', true), 'Guides'));

  // Core guides from docs (read-only)
  const coreDocs = [
    'PLUGIN_HOST.md','GAME_ADAPTERS.md','NETWORK_ADAPTERS.md','AI_ORCHESTRATION.md','IN_GAME_CHAT.md',
    'CHARACTER_DATA.md','MOBILE_CONTROLS.md','STATE_AND_TURNS.md','TEXT_GAME_ENGINE.md','GENRE_STARTERS.md',
    'REFERENCE_DATA.md','FEATURE_FLAGS.md',
  ];
  for (const rel of coreDocs) {
    const f = addFile(docs, rel, true);
    if (f) files.push(mapPath(f, 'Guides'));
  }

  const out = files.filter(Boolean).map((f) => {
    const raw = String(f.path || '').trim();
    const noLead = raw.replace(/^\/+/, '');
    return { ...f, path: '/' + noLead };
  });
  return out;
}

