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
    const mapPath = (file, prefix) => file ? { ...file, path: `${prefix.replace(/\/$/, '')}/${file.path}` } : null;
    // User-editable game starter
    // Game (editable by default; README is readonly)
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
      if (f) files.push(mapPath(f, 'Guides'));
    }

    // Synthetic runtime foundation files (not from disk): provide execution stubs and guides
    const runtimeGuide = {
      path: 'Runtime/HOW_TO_BUILD.md',
      content: [
        '# Runtime & Execution Guide',
        '',
        '- This workspace is ready for prompt-graph + code runtime.',
        '- Edit `/template.json`, `/graph/prompt-graph.json`, and `/game/hooks/automation.js`.',
        '- The Play overlay loads your template and renders MainGame UI.',
        '',
        'Extending to more genres:',
        '- Add adapters under `Runtime/adapters/*.js` and export a `run(ctx)` entry.',
        '- Configure `/game/runtime.config.json` with `engine: phaser|three|custom`.',
        '- Keep heavy assets in R2/S3 and reference by URL.',
        '',
        'Saving:',
        '- The Save action persists both prompt-graph (DB) and code VFS (workspace set).',
        '',
      ].join('\n') + '\n',
      readonly: true,
    };
    const runtimeRunner = {
      path: 'Runtime/runner.js',
      content: [
        '// Runtime runner stub: you can import adapters here and delegate to them.',
        'export async function run(template, files, config = {}) {',
        '  // Decide adapter by config.engine; fallback to built-in MainGame UI.',
        "  const engine = (config.engine || 'builtin').toLowerCase();",
        '  if (engine === "custom-phaser") {',
        '    const mod = await import("./adapters/phaser.js").catch(()=>null);',
        '    if (mod?.run) return mod.run({ template, files, config });',
        '  }',
        '  // builtin fallback: return minimal render context',
        '  return { ok: true, engine: "builtin", message: "Using built-in MainGame UI" };',
        '}
      '].join('\n') + '\n',
      readonly: false,
    };
    const runtimeAdapterPhaser = {
      path: 'Runtime/adapters/phaser.js',
      content: [
        '// Example Phaser adapter stub (client-side only).',
        'export async function run(ctx){',
        '  // ctx: { template, files, config }',
        '  // Here you would boot Phaser and map template nodes to scenes.',
        '  return { ok:true, engine:"phaser", message:"Phaser adapter stub" };',
        '}
      '].join('\n') + '\n',
      readonly: false,
    };
    files.push(runtimeGuide, runtimeRunner, runtimeAdapterPhaser);

    const out = files.filter(Boolean);
    res.status(200).json({ files: out, count: out.length });
  } catch (e) {
    res.status(500).json({ error: 'starter-pack-failed' });
  }
}

export const config = { runtime: 'nodejs' };
