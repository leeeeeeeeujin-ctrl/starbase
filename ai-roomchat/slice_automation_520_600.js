const fs = require('fs');  
const src = fs.readFileSync('workspace/hooks/automation.js','utf8');  
const lines = src.split(/\r?\n/);  
lines.slice(520, 600).forEach(function(line, idx) { console.log((521+idx)+':'+line); }); 
