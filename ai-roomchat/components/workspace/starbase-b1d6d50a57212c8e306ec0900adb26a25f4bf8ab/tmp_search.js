const fs = require('fs');
const [file, needle] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8');
const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
let m; let count = 0;
while ((m = re.exec(text))) {
  const line = text.slice(0, m.index).split(/\r?\n/).length;
  console.log(`match at line ${line}`);
  count++;
}
console.log(`total matches: ${count}`);
