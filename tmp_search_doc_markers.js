const fs = require('fs');

const path = 'docs/WORKSPACE_EDITOR_RUNTIME.md';
const text = fs.readFileSync(path, 'utf8');
const lines = text.split(/\r?\n/);

const needles = ['완료', 'TODO', '랭크', '메인게임', '텍스트'];

needles.forEach((needle) => {
  console.log('=== 검색:', needle, '===');
  lines.forEach((line, idx) => {
    if (line.includes(needle)) {
      console.log(String(idx + 1).padStart(5, ' ')+': '+line);
    }
  });
  console.log();
});

