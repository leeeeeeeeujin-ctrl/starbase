// Usage: node tools/grep_lines.js <root> <pattern>
const fs = require('fs');
const path = require('path');
const root = process.argv[2] || '.';
const pattern = process.argv[3] || '.';
const rx = new RegExp(pattern, 'i');
function walk(dir){
  for(const name of fs.readdirSync(dir)){
    const p = path.join(dir,name);
    let st; try{ st=fs.statSync(p); }catch{ continue; }
    if(st.isDirectory()){
      if(['node_modules','.next','.git'].includes(name)) continue;
      walk(p);
    } else if(/\.(js|jsx|ts|tsx)$/.test(name)){
      let txt; try{ txt=fs.readFileSync(p,'utf8'); }catch{ continue; }
      const lines = txt.split(/\r?\n/);
      let hit=false;
      lines.forEach((line,i)=>{
        if(rx.test(line)){
          if(!hit){ console.log(`\n>>> ${p}`); hit=true; }
          console.log(String(i+1).padStart(5,' ')+': '+line);
        }
      });
    }
  }
}
walk(root);

