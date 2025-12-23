const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'components', 'rank', 'StartClient', 'index.js');
const src = fs.readFileSync(file, 'utf8');

src.split(/\r?\n/).forEach((line, idx) => {
  if (line.includes('isWorkspaceMeaningful')) {
    console.log(`${idx + 1}: ${line}`);
  }
});

