const fs = require('fs');

const txt = fs.readFileSync('components/game/GameShell.jsx', 'utf8');
console.log('length', txt.length);
console.log('includes GameShell?', txt.includes('GameShell'));

