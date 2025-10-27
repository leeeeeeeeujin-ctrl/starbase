import fs from 'fs';
import path from 'path';

// This ESM helper is invoked by CJS PoC scripts when direct require/import
// of the prompt engine fails due to mixed module formats. It receives a
// single JSON argument (or stdin) describing the inputs, calls
// makeNodePrompt, and writes JSON to stdout.

function readInput() {
  const arg = process.argv[2];
  if (arg) {
    try {
      return JSON.parse(arg);
    } catch (e) {
      // fallthrough to try stdin
    }
  }
  const stdin = fs.readFileSync(0, 'utf8');
  if (stdin && stdin.trim()) return JSON.parse(stdin);
  throw new Error('No input provided to _prompt_runner.mjs (expected JSON)');
}

async function main() {
  const inp = readInput();
  const node = inp.node || { text: inp.template || '' };
  const slots = inp.slots || inp.slotValues || [];
  const historyText = inp.historyText || inp.history || '';

  // import the ESM prompt engine directly (path relative to this file)
  const pePath = new URL('../lib/promptEngine/index.js', import.meta.url).href;
  const pe = await import(pePath);

  const makeNodePrompt = pe.makeNodePrompt || (pe.default && pe.default.makeNodePrompt);
  if (!makeNodePrompt) throw new Error('makeNodePrompt not found on imported promptEngine');

  const compiled = makeNodePrompt({ node, slots, historyText, activeGlobalNames: [], activeLocalNames: [] });
  const result = { compiled };
  process.stdout.write(JSON.stringify(result));
}

main().catch(err => {
  console.error('[_prompt_runner] error:', err && err.stack ? err.stack : String(err));
  process.exit(2);
});
