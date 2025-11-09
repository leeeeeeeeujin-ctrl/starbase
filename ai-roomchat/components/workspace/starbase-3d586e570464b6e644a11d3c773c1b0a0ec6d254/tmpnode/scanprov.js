const fs=require('fs'); 
const path=require('path'); 
function walk(d){ for(const ent of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,ent.name); if(ent.isDirectory()) walk(p); else if(isCode(p)){ const s=fs.readFileSync(p,'utf8'); if(s.includes('CodeWorkspaceProvider')) console.log(p); } } } 
walk('ai-roomchat'); 
