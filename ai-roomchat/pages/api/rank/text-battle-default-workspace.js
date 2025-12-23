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

    const template = readJson('template.json');
    const graph = readJson('graph.prompt-graph.json');
    const runtimeConfig = readJson('game.runtime.config.json');
    let uiShell = null;
    try {
      uiShell = readJson('game.ui.shell.json');
    } catch {
      uiShell = null;
    }

    // 훅 소스는 docs 예제가 아니라, 현재 워크스페이스용
    // 텍스트 배틀 훅(automation.js)을 그대로 사용한다.
    // 이렇게 하면 Maker / 메인게임 모두 동일한 텍스트 배틀 훅을 기준으로 동작한다.
    let hooksSource = '';
    try {
      const hooksPath = path.join(baseDir, 'workspace', 'hooks', 'automation.js');
      hooksSource = fs.readFileSync(hooksPath, 'utf8');
    } catch {
      // 워크스페이스 훅을 읽지 못하면 예전 예시 훅으로 폴백한다.
      try {
        const legacyHooksPath = path.join(exampleDir, 'game.hooks.automation.js');
        hooksSource = fs.readFileSync(legacyHooksPath, 'utf8');
      } catch {
        hooksSource = '';
      }
    }

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
