const fs = require('fs');
const p = process.argv[2];
const a = parseInt(process.argv[3], 10);
const b = parseInt(process.argv[4], 10);
const s = fs.readFileSync(p, 'utf8');
const lines = s.split(/\r?\n/);
for (let i=a-1;i<b;i++) console.log(String(i+1).padStart(5,' ')+': '+(lines[i]??''));
