const fs=require('fs'); 
const p='ai-roomchat\\components\\workspace\\CodeWorkspaceProvider.jsx'; 
const s=fs.readFileSync(p,'utf8'); 
const lines=s.split(/\r?\n/); 
const pats=['export default','function CodeWorkspaceProvider','useReducer','useRef','useEffect']; 
for(const e of lines.entries()){ 
  const i=e[0], l=e[1]; 
  for(const k of pats){ 
    if(l.includes(k)){ console.log(i+1+':'+l); break; } 
  } 
} 
