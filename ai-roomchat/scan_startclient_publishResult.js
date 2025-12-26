const fs = require('fs'); 
const src = fs.readFileSync('components/rank/StartClient/index.js','utf8'); 
const lines = src.split(/\r?\n/); 
