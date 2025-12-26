const fs = require('fs');  
const src = fs.readFileSync('components/rank/StartClient/index.js','utf8');  
const lines = src.split(/\r?\n/);  
lines.slice(1127, 1165).forEach(function(line, idx) { console.log((1128 + idx) + ':' + line); }); 
