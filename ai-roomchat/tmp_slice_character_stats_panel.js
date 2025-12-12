const fs = require('fs');

const file = 'components/lobby/CharacterStatsPanel.js';
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const start = Number(process.argv[2] || 0);
const end = Number(process.argv[3] || start + 80);
console.log(lines.slice(start, end).join('\n'));

