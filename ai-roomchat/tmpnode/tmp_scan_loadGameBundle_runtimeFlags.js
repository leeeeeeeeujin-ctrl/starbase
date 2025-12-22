const fs = require('fs');

const text = fs.readFileSync('components/rank/StartClient/engine/loadGameBundle.js', 'utf8');
const needles = ['textRuntimeEnabled', 'builtinRuntime', 'engine:'];

needles.forEach((needle) => {
  let idx = text.indexOf(needle);
  if (idx === -1) {
    console.log(`'${needle}' not found`);
    return;
  }
  while (idx !== -1) {
    const start = Math.max(0, idx - 400);
    const end = Math.min(text.length, idx + 800);
    console.log(`--- ${needle} at ${idx} ---`);
    console.log(text.slice(start, end));
    idx = text.indexOf(needle, idx + needle.length);
  }
});

