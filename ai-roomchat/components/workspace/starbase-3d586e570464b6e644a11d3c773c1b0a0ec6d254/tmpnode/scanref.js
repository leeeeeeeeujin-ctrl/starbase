const fs=require('fs'); 
const path=require('path'); 
const root='ai-roomchat'; 
const pats=['workspace:add-files','scopeStorage','fetchStarterPack','loadSnapshot','markInjected','wasInjected']; 
function walk(d){ for(const ent of fs.readdirSync(d,{withFileTypes:true})){ const p=path.join(d,ent.name); if(ent.isDirectory()) walk(p); else if(isCode(p)){ const s=fs.readFileSync(p,'utf8'); for(const k of pats){ if(s.includes(k)){ console.log(p+' :: '+k); break; } } } } } 
walk(root); 
