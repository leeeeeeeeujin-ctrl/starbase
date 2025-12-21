import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const baseDir = process.cwd();
    const exampleDir = path.join(
      baseDir,
      'docs',
      'examples',
      'text-battle-basic'
    );

    const readJson = (file) => {
      const full = path.join(exampleDir, file);
      const text = fs.readFileSync(full, 'utf8');
      return JSON.parse(text || '{}');
    };

    const readText = (file) => {
      const full = path.join(exampleDir, file);
      return fs.readFileSync(full, 'utf8');
    };

    const template = readJson('template.json');
    const graph = readJson('graph.prompt-graph.json');
    const runtimeConfig = readJson('game.runtime.config.json');
    let uiShell = null;
    try {
      uiShell = readJson('game.ui.shell.json');
    } catch {
      uiShell = null;
    }
    const hooksSource = readText('game.hooks.automation.js');

    return res.status(200).json({
      ok: true,
      workspace: {
        template,
        graph,
        runtime_config: runtimeConfig,
        hooks_source: hooksSource,
        ui_shell: uiShell,
      },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: 'default_workspace_load_failed',
      detail: e?.message || String(e),
    });
  }
}

