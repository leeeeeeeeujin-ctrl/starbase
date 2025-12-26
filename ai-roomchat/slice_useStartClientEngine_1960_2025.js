const fs = require('fs');  
const src = fs.readFileSync('components/rank/StartClient/useStartClientEngine.js','utf8');  
const lines = src.split(/\r?\n/);  
lines.slice(1959, 2025).forEach(function(line, idx) { console.log((1960 + idx) + ':' + line); }); 
