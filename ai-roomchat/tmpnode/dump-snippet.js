const fs = require('fs');

const path = 'ai-roomchat/pages/api/ai-battle-judge.js';
const text = fs.readFileSync(path, 'utf8');
const lines = text.split(/\r?\n/);

// 디버그용: 특정 범위를 덤프
const start = 120;
const end = 220;
for (let i = start - 1; i < end && i < lines.length; i += 1) {
  console.log(`${i + 1}:${lines[i]}`);
}
console.log();
