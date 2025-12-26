const fs = require('fs');  
const src = fs.readFileSync('components/rank/StartClient/index.js','utf8');  
const lines = src.split(/\r?\n/);  
lines.slice(653, 690).forEach(function(line, idx) { console.log((654 + idx) + ':' + line); }); 
