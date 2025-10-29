#!/usr/bin/env node

// Simple CLI to compile a prompt node using the existing promptEngine.makeNodePrompt
// Usage:
//  node scripts/make-sample-prompt.js --template "Hello {{slot0.name}}"
//  node scripts/make-sample-prompt.js --nodeFile ./examples/node.json --slotsFile ./examples/slots.json

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--template' && args[i + 1]) {
      out.template = args[++i];
    } else if (a === '--nodeFile' && args[i + 1]) {
      out.nodeFile = args[++i];
    } else if (a === '--slotsFile' && args[i + 1]) {
      out.slotsFile = args[++i];
    } else if (a === '--history' && args[i + 1]) {
      out.history = args[++i];
    } else if (a === '--out' && args[i + 1]) {
      out.out = args[++i];
    }
  }
  return out;
}

async function main() {
  const args = parseArgs();
  // promptEngine handling is done below after node/slots/historyText are known

  let node = null;
  if (args.template) {
    node = { id: 'cli-node', template: args.template };
  } else if (args.nodeFile) {
    const p = path.resolve(process.cwd(), args.nodeFile);
    if (!fs.existsSync(p)) {
      console.error('nodeFile not found', p);
      process.exit(2);
    }
    node = JSON.parse(fs.readFileSync(p, 'utf8'));
  } else {
    console.error('No template or nodeFile provided. See usage in this script header.');
    process.exit(2);
  }

  let slots = [];
  if (args.slotsFile) {
    const s = path.resolve(process.cwd(), args.slotsFile);
    if (!fs.existsSync(s)) {
      console.error('slotsFile not found', s);
      process.exit(2);
    }
    slots = JSON.parse(fs.readFileSync(s, 'utf8'));
  } else {
    // default sample slot
    slots = [
      { name: '용사 아린', role: 'attack' },
      { name: '수호자 벨라', role: 'support' },
    ];
  }

  const historyText = args.history || '';

  // Try to load promptEngine synchronously; if not possible, fall back to the ESM runner.
  let compiled;
  try {
    const promptEngine = require('../lib/promptEngine');
    const makeNodePrompt =
      promptEngine.makeNodePrompt || (promptEngine.default && promptEngine.default.makeNodePrompt);
    if (!makeNodePrompt) throw new Error('makeNodePrompt not found on required module');
    compiled = makeNodePrompt({
      node,
      slots,
      historyText,
      activeGlobalNames: [],
      activeLocalNames: [],
    });
  } catch (err) {
    // Fallback - call the small ESM runner
    const cp = require('child_process');
    const runner = path.resolve(__dirname, './_prompt_runner.mjs');
    try {
      const out = cp.execFileSync(
        process.execPath,
        [runner, JSON.stringify({ node, slots, historyText })],
        { encoding: 'utf8' }
      );
      const parsed = JSON.parse(out);
      compiled = parsed.compiled;
    } catch (err2) {
      console.error(
        'Failed to compile prompt (require + fallback both failed):',
        err,
        err2 && err2.stdout ? err2.stdout.toString() : err2
      );
      process.exit(2);
    }
  }

  const out = { generatedAt: new Date().toISOString(), node: node.id || null, compiled };
  if (args.out) {
    const outPath = path.resolve(process.cwd(), args.out);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log('WROTE', outPath);
  } else {
    console.log(JSON.stringify(out, null, 2));
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
