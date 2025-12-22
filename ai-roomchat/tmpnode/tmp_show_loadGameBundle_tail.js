const fs = require('fs');

const text = fs.readFileSync('components/rank/StartClient/engine/loadGameBundle.js', 'utf8');
console.log(text.slice(text.length - 1600));

