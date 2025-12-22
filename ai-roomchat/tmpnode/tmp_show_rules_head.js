const fs = require('fs');

const text = fs.readFileSync('components/rank/StartClient/engine/rules.js', 'utf8');
console.log(text.slice(0, 1600));

