const fs=require('fs'); 
const p=process.argv[2]; 
const q=process.argv[3]; 
const s=fs.readFileSync(p,'utf8'); 
const lines=s.split(/\r?\n/); 
