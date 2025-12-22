const fs = require('fs');

const path = 'components/game/MainGameMobileUI.jsx';
const text = fs.readFileSync(path, 'utf8');
const needle = 'const rankCharacter = useMemo';
const idx = text.indexOf(needle);

if (idx === -1) {
  console.log('rankCharacter not found');
} else {
  const start = Math.max(0, idx - 200);
  const end = Math.min(text.length, idx + 1600);
  console.log(text.slice(start, end));
}
