const fs = require('fs');  
const src = fs.readFileSync('components/rank/StartClient/useStartClientEngine.js','utf8');  
const lines = src.split(/\r?\n/);  
lines.slice(1994, 2065).forEach(function(line, idx) { console.log((1995 + idx) + ':' + line); }); 
