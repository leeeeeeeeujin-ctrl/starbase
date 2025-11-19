const fs = require('fs');

const src = fs.readFileSync('ai-roomchat/components/workspace/CodeEditorOverlayV2.jsx', 'utf8');
const lines = src.split(/\r?\n/);

function printAround(keyword, context = 12) {
  const idx = lines.findIndex((l) => l.includes(keyword));
  if (idx === -1) {
    console.log('keyword not found:', keyword);
    return;
  }
  const start = Math.max(0, idx - context);
  const end = Math.min(lines.length, idx + context + 1);
  for (let i = start; i < end; i++) {
    console.log(String(i + 1).padStart(4, ' '), lines[i]);
  }
}

printAround('현재 턴 프롬프트');
