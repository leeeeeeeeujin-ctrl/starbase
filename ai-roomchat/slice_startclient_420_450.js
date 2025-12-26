const fs = require('fs');  
const src = fs.readFileSync('components/rank/StartClient/index.js','utf8');  
const lines = src.split(/\r?\n/);  
lines.slice(419, 450).forEach(function(line, idx) { console.log((420 + idx) + ':' + line); }); 
