const fs = require('fs');

const txt = fs.readFileSync('lib/rank/rankContext.js', 'utf8');
console.log(txt.slice(0, 1200));

