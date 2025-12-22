const fs = require('fs');

const text = fs.readFileSync('components/game/MainGameMobileUI.jsx', 'utf8');

function show(label, needle) {
  let idx = text.indexOf(needle);
  if (idx === -1) {
    console.log(`[${label}] '${needle}' not found`);
    return;
  }
  while (idx !== -1) {
    const start = Math.max(0, idx - 260);
    const end = Math.min(text.length, idx + 600);
    console.log(`\n=== ${label} @ ${idx} ===`);
    console.log(text.slice(start, end));
    idx = text.indexOf(needle, idx + needle.length);
  }
}

show('korean_next', '다음 턴');
show('korean_next2', '다음');
show('turn_next_event', "'turn:next'");
show('next_label', '다음 턴');
