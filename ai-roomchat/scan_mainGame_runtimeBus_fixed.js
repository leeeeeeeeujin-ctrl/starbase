const fs = require('fs'); 
const src = require('fs').readFileSync('components/game/MainGameMobileUI.jsx','utf8'); 
const lines = src.split(/\r?\n/); 
