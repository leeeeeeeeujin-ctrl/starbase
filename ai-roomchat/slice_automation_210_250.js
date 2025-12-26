const fs = require('fs');  
const src = fs.readFileSync('workspace/hooks/automation.js','utf8');  
const lines = src.split(/\r?\n/);  
lines.slice(209, 250).forEach(function(line, idx) { console.log((210 + idx) + ':' + line); }); 
