const fs = require('fs');  
const src = fs.readFileSync('components/rank/StartClient/index.js','utf8');  
const lines = src.split(/\r?\n/);  
lines.slice(741, 772).forEach(function(line, idx) { console.log((742 + idx) + ':' + line); }); 
