const fs = require('fs');

const text = fs.readFileSync('components/rank/StartClient/index.js', 'utf8');
const needle = 'logsPanelVisible';
const indices = [];
let idx = text.indexOf(needle);
while (idx !== -1) {
  indices.push(idx);
  idx = text.indexOf(needle, idx + needle.length);
}
console.log('occurrences:', indices.length);
indices.forEach((pos, i) => {
  const start = Math.max(0, pos - 120);
  const end = Math.min(text.length, pos + 240);
  console.log(`--- occurrence ${i + 1} @ ${pos} ---`);
  console.log(text.slice(start, end));
});

