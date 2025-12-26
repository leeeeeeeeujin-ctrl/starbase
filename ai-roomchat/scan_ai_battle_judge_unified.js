const fs = require('fs'); 
const src = fs.readFileSync('pages/api/ai-battle-judge.js','utf8'); 
const lines = src.split(/\r?\n/); 
