const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'ai-roomchat', 'components', 'game', 'MainGameMobileUI.jsx');
const text = fs.readFileSync(target, 'utf8');
const lines = text.split('\n');

const start = 450;
const end = 485;

for (let i = start; i < end && i < lines.length; i += 1) {
  const num = String(i + 1).padStart(4, ' ');
  console.log(num + ': ' + lines[i]);
}
