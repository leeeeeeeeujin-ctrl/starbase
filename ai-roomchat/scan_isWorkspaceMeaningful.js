const fs = require('fs'); 
const src = fs.readFileSync('components/rank/StartClient/index.js','utf8'); 
const lines = src.split(/\r?\n/); 
lines.forEach(function(line, idx) { if (line.includes('isWorkspaceMeaningful')) console.log((idx+1) + ':' + line); }); 
