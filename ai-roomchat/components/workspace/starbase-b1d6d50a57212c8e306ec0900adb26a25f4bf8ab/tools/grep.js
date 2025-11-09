const fs = require('fs');
const path = process.argv[2];
const pat = new RegExp(process.argv[3], 'i');
const s = fs.readFileSync(path, 'utf8');
const lines = s.split(/\r?\n/);
lines.forEach((l,i)=>{ if (pat.test(l)) console.log(String(i+1).padStart(5,' ')+': '+l); });
