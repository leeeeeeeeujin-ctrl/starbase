// GET /api/workspace/reference-survey
// Optional: ?id=<pack> to scope to single pack
// Scans reference_data/ and ai-roomchat/docs/reference_data/ for packs and classifies files into capability buckets.
// Returns metadata only (no file contents).

import fs from 'fs';
import path from 'path';

const ROOTS = ['reference_data', path.join('ai-roomchat', 'docs', 'reference_data')];
const ALLOWED_EXT = new Set(['.json', '.js', '.md', '.txt']);

function safeReadDir(dir) { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } }
function exists(p) { try { return fs.existsSync(p); } catch { return false; } }

function listPacks(repoRoot) {
  const names = new Set();
  for (const rel of ROOTS) {
    const root = path.join(repoRoot, rel);
    for (const d of safeReadDir(root)) if (d.isDirectory()) names.add(d.name);
  }
  return Array.from(names).sort();
}

function gatherFiles(repoRoot, pack) {
  const files = [];
  for (const rel of ROOTS) {
    const packRoot = path.join(repoRoot, rel, pack);
    if (!exists(packRoot)) continue;
    const stack = [{ abs: packRoot, rel: '' }];
    while (stack.length) {
      const { abs, rel } = stack.pop();
      for (const ent of safeReadDir(abs)) {
        const absPath = path.join(abs, ent.name);
        const relPath = path.posix.join(rel.replace(/\\/g, '/'), ent.name);
        if (ent.isDirectory()) { stack.push({ abs: absPath, rel: relPath }); continue; }
        const ext = path.extname(ent.name).toLowerCase();
        if (!ALLOWED_EXT.has(ext)) continue;
        let stat; try { stat = fs.statSync(absPath); } catch { stat = undefined; }
        files.push({ path: relPath, size: stat?.size || 0, ext });
      }
    }
  }
  return files;
}

function classify(packFiles) {
  const buckets = {
    runtime: { runner: [], worker: [], adapters: [] },
    assets: { loader: [], manifest: [] },
    input: { map: [] },
    state: { machine: [] },
    physics: { collision: [], tilemap: [] },
    path: { astar: [] },
    animation: { timeline: [], player: [] },
    audio: { mixer: [] },
    ui: { schema: [], render: [] },
    sync: { events: [], lww: [], crdt: [] },
    snapshot: { schema: [], saveRestore: [], rng: [] },
    docs: { guides: [], readme: [] },
    config: { runtime: [], external: [] },
    other: [],
  };

  const push = (arr, f) => arr.push(f.path);
  for (const f of packFiles) {
    const p = f.path.toLowerCase();
    if (/guides\//.test(p) || /readme\.md$/.test(p)) { push(buckets.docs.guides, f); continue; }
    if (/runtime\/runner\.js$/.test(p) || /runner\.js$/.test(p)) { push(buckets.runtime.runner, f); continue; }
    if (/runtime\/worker/.test(p) && p.endsWith('.js')) { push(buckets.runtime.worker, f); continue; }
    if (/runtime\/adapters\//.test(p)) { push(buckets.runtime.adapters, f); continue; }
    if (/asset.*loader/.test(p)) { push(buckets.assets.loader, f); continue; }
    if (/assets?\.manifest\.json$/.test(p)) { push(buckets.assets.manifest, f); continue; }
    if (/input\.map\.json$/.test(p)) { push(buckets.input.map, f); continue; }
    if (/state\.machine\.json$/.test(p)) { push(buckets.state.machine, f); continue; }
    if (/collision|aabb/.test(p)) { push(buckets.physics.collision, f); continue; }
    if (/tilemap|tiles?\.json/.test(p)) { push(buckets.physics.tilemap, f); continue; }
    if (/astar|pathfinding/.test(p)) { push(buckets.path.astar, f); continue; }
    if (/animation.*timeline\.json/.test(p)) { push(buckets.animation.timeline, f); continue; }
    if (/animation.*player\.js/.test(p)) { push(buckets.animation.player, f); continue; }
    if (/audio.*mixer/.test(p)) { push(buckets.audio.mixer, f); continue; }
    if (/ui.*schema\.json/.test(p)) { push(buckets.ui.schema, f); continue; }
    if (/ui.*render.*\.js/.test(p)) { push(buckets.ui.render, f); continue; }
    if (/sync.*events.*\.json/.test(p)) { push(buckets.sync.events, f); continue; }
    if (/lww.*\.json/.test(p)) { push(buckets.sync.lww, f); continue; }
    if (/crdt/.test(p)) { push(buckets.sync.crdt, f); continue; }
    if (/snapshot\.schema\.json/.test(p)) { push(buckets.snapshot.schema, f); continue; }
    if (/save.*restore.*\.js/.test(p)) { push(buckets.snapshot.saveRestore, f); continue; }
    if (/rng|seed|random/.test(p)) { push(buckets.snapshot.rng, f); continue; }
    if (/game\/runtime\.config\.json$/.test(p)) { push(buckets.config.runtime, f); continue; }
    if (/runtime\/external\.config\.json$/.test(p)) { push(buckets.config.external, f); continue; }
    buckets.other.push(f.path);
  }

  function present(obj) { return Object.fromEntries(Object.entries(obj).map(([k, arr]) => [k, Array.isArray(arr) ? (arr.length > 0) : present(arr)])); }
  const presence = {
    runtime: present(buckets.runtime),
    assets: present(buckets.assets),
    input: present(buckets.input),
    state: present(buckets.state),
    physics: present(buckets.physics),
    path: present(buckets.path),
    animation: present(buckets.animation),
    audio: present(buckets.audio),
    ui: present(buckets.ui),
    sync: present(buckets.sync),
    snapshot: present(buckets.snapshot),
    config: present(buckets.config),
  };

  return { buckets, presence };
}

export default async function handler(req, res) {
  const repoRoot = path.resolve(process.cwd());
  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  const result = { scannedRoots: ROOTS, packs: [] };
  const packs = id ? [id] : listPacks(repoRoot);
  for (const pack of packs) {
    const files = gatherFiles(repoRoot, pack);
    const sum = classify(files);
    const total = files.length;
    const bytes = files.reduce((n, f) => n + (f.size || 0), 0);
    result.packs.push({ id: pack, total, bytes, presence: sum.presence, samples: {
      runner: sum.buckets.runtime.runner.slice(0, 3),
      worker: sum.buckets.runtime.worker.slice(0, 3),
      adapters: sum.buckets.runtime.adapters.slice(0, 3),
      input: sum.buckets.input.map.slice(0, 3),
      state: sum.buckets.state.machine.slice(0, 3),
      physics: [...sum.buckets.physics.collision.slice(0,2), ...sum.buckets.physics.tilemap.slice(0,2)],
      path: sum.buckets.path.astar.slice(0, 3),
      animation: [...sum.buckets.animation.timeline.slice(0,2), ...sum.buckets.animation.player.slice(0,2)],
      audio: sum.buckets.audio.mixer.slice(0, 3),
      ui: [...sum.buckets.ui.schema.slice(0,2), ...sum.buckets.ui.render.slice(0,2)],
      sync: [...sum.buckets.sync.events.slice(0,2), ...sum.buckets.sync.lww.slice(0,2), ...sum.buckets.sync.crdt.slice(0,1)],
      snapshot: [...sum.buckets.snapshot.schema.slice(0,2), ...sum.buckets.snapshot.saveRestore.slice(0,2), ...sum.buckets.snapshot.rng.slice(0,1)],
      config: [...sum.buckets.config.runtime.slice(0,2), ...sum.buckets.config.external.slice(0,1)],
    }});
  }
  return res.status(200).json(result);
}

