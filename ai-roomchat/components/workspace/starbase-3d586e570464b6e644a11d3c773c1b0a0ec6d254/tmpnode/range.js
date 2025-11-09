const fs=require('fs'); 
const p='ai-roomchat\\components\\workspace\\CodeWorkspaceProvider.jsx'; 
const s=fs.readFileSync(p,'utf8'); 
const lines=s.split(/\r?\n/); 
out(200,230); 
console.log('---'); 
out(270,310); 
console.log('---'); 
out(560,610); 
