const fs = require('fs');  
const src = fs.readFileSync('workspace/hooks/automation.js','utf8');  
const lines = src.split(/\r?\n/);  
lines.forEach(function(line, idx) { if (line.includes('selectNext(')) console.log((idx+1)+':'+line); }); 
