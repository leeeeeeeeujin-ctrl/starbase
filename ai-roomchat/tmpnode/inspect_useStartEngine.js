const fs = require('fs');

const txt = fs.readFileSync('components/rank/StartClient/useStartClientEngine.js', 'utf8');

function show(label, needle, context = 400) {
  const idx = txt.indexOf(needle);
  console.log(`=== ${label} index=${idx}`);
  if (idx >= 0) {
    const start = Math.max(0, idx - context);
    const end = Math.min(txt.length, idx + context);
    console.log(txt.slice(start, end));
  }
}

show('effectiveApiKey', 'effectiveApiKey');
show('apiKeyWarning', 'apiKeyWarning');
show('useStartApiKeyManager', 'useStartApiKeyManager');
