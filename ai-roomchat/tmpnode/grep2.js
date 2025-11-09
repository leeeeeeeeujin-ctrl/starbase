const fs=require('fs'); 
const path=require('path'); 
const root='ai-roomchat'; 
const pats=['/api/prompts','workspace:add-files','workspace:set-scope','workspace.vfs.v1']; 
function walk(dir){ for(const ent of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,ent.name); if(ent.isDirectory()){ walk(p); } else if(isCode(p)){ const s=fs.readFileSync(p,'utf8'); for(const k of pats){ if(s.includes(k)){ console.log(p+' :: '+k); break; } } } } } 
walk(root); 
