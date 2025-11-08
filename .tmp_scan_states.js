const fs = require('fs');
const s = fs.readFileSync('ai-roomchat/components/maker/editor/MakerEditor.js','utf8');
const lines = s.split(/\r?\n/);
for (let i=0;i<lines.length;i++){
  if (/useState\(/.test(lines[i]) || /setShowMultiLanguageEditor/.test(lines[i]) || /setGameSimulatorOpen/.test(lines[i]) ) {
    console.log((i+1)+': '+lines[i]);
  }
}
