const fs=require('fs');
const path=process.argv[1];
const lines=fs.readFileSync(path,'utf8').split(/\r?\n/);
