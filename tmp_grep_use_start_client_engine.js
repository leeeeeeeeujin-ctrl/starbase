const fs = require('fs');

const text = fs.readFileSync('ai-roomchat/components/rank/StartClient/useStartClientEngine.js', 'utf8');
console.log('has createTurnVoteController:', text.includes('createTurnVoteController'));
console.log('has consensus:', text.includes('consensus'));

