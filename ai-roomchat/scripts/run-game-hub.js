#!/usr/bin/env node

// Minimal game-hub PoC: uses promptEngine.makeNodePrompt to compile prompts for multiple
// simulated game instances and records outputs. AI calls are mocked by a simple function.

const fs = require('fs');
const path = require('path');
// promptEngine may be ESM; attempt require first. If that fails we use an
// external small ESM runner at ./_prompt_runner.mjs via a child process.
let makeNodePrompt, parseOutcome;
try {
  const pe = require('../lib/promptEngine');
  makeNodePrompt = pe.makeNodePrompt || (pe.default && pe.default.makeNodePrompt);
  parseOutcome = pe.parseOutcome || (pe.default && pe.default.parseOutcome);
} catch (err) {
  // leave undefined; runHub will set a fallback wrapper that delegates to the ESM runner
}

const GAME_TEMPLATES = [
  { id: 'g1', name: 'duo', roles: [{ name: 'attack' }, { name: 'support' }] },
  { id: 'g2', name: 'solo', roles: [{ name: 'solo' }] },
];

function randPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function mockAiClient(messages) {
  // Very small mock: produce a pseudo-outcome based on prompt length
  const last = messages[messages.length - 1] || { content: '' };
  const text = `모의 응답: received ${String(last.content || '').slice(0, 80)}\n\n[action]: continue`;
  return Promise.resolve({ text });
}

async function runHub({ ticks = 20, instancesPerTemplate = 2 } = {}) {
  // ensure promptEngine is loaded (try require again synchronously). If that
  // still fails, create a small wrapper that calls the ESM runner helper.
  if (!makeNodePrompt) {
    try {
      const pe = require('../lib/promptEngine');
      makeNodePrompt = pe.makeNodePrompt || (pe.default && pe.default.makeNodePrompt);
      parseOutcome = pe.parseOutcome || (pe.default && pe.default.parseOutcome);
    } catch (err) {
      const cp = require('child_process');
      const runner = path.resolve(__dirname, './_prompt_runner.mjs');
      const runCompile = (node, slots, historyText) => {
        const input = { node, slots, historyText };
        const out = cp.execFileSync(process.execPath, [runner, JSON.stringify(input)], {
          encoding: 'utf8',
        });
        const parsed = JSON.parse(out);
        return parsed.compiled;
      };
      // Provide a transparent wrapper so the rest of the code can call makeNodePrompt
      makeNodePrompt = ({ node, slots, historyText }) => runCompile(node, slots, historyText);
    }
  }
  const instances = [];
  let seq = 1;
  for (const tmpl of GAME_TEMPLATES) {
    for (let i = 0; i < instancesPerTemplate; i++) {
      instances.push({
        id: `${tmpl.id}-${i}`,
        template: tmpl,
        slots: tmpl.roles.map((r, idx) => ({ name: `P${seq++}`, role: r.name })),
      });
    }
  }

  const metrics = { ticks, generated: 0, outcomes: [] };

  for (let t = 0; t < ticks; t++) {
    for (const inst of instances) {
      // pick a node (simple inline node for PoC)
      const node = {
        id: `node-${t}`,
        template: `턴 ${t} - ${inst.template.name}: {{slot0.name}}와 {{slot1.name}}의 대화. 히스토리: {{history}}`,
      };
      const history = `최근 이벤트: tick ${t}`;
      const compiled = makeNodePrompt({
        node,
        slots: inst.slots.slice(0, 2),
        historyText: history,
      });
      metrics.generated += 1;

      // Build messages similar to engine runner
      const messages = [
        { role: 'system', content: `Game: ${inst.template.name}` },
        { role: 'user', content: compiled.text },
      ];
      const aiResp = await mockAiClient(messages);
      const outcome = { text: aiResp.text };
      metrics.outcomes.push({
        inst: inst.id,
        tick: t,
        prompt: compiled.text.slice(0, 200),
        ai: aiResp.text.slice(0, 200),
      });
    }
  }

  const out = { generatedAt: new Date().toISOString(), metrics };
  const outDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `game-hub-report-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('WROTE', outPath);
  return out;
}

if (require.main === module) {
  runHub().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runHub };
