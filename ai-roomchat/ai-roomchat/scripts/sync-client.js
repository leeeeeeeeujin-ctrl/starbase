#!/usr/bin/env node
/* Simple CLI to upload/download to the local sync_store via the report server
   Usage:
     node sync-client.js upload <key> <file>
     node sync-client.js get <key> [outFile]
     node sync-client.js list
*/

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const SERVER = process.env.SYNC_SERVER || 'http://localhost:4000';
const API_KEY = process.env.SYNC_API_KEY || process.env.REPORTS_API_KEY || null;

async function upload(key, filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const res = await fetch(`${SERVER}/api/sync/upload`, {
    method: 'POST',
    headers: addAuth({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ key, content }),
  });
  console.log(await res.json());
}
// helper to add api key header when present
function addAuth(headers) {
  if (!API_KEY) return headers;
  return Object.assign({}, headers, { 'x-api-key': API_KEY });
}

async function getKey(key, outFile) {
  const res = await fetch(`${SERVER}/api/sync/${encodeURIComponent(key)}`, {
    headers: addAuth({}),
  });
  if (!res.ok) {
    console.error('not found');
    process.exit(2);
  }
  const txt = await res.text();
  if (outFile) fs.writeFileSync(outFile, txt, 'utf8');
  else console.log(txt);
}

async function listKeys() {
  const res = await fetch(`${SERVER}/api/sync`, { headers: addAuth({}) });
  console.log(await res.json());
}

async function main() {
  const [, , cmd, a, b] = process.argv;
  if (cmd === 'upload') return upload(a, b);
  if (cmd === 'get') return getKey(a, b);
  if (cmd === 'list') return listKeys();
  console.log('usage: upload|get|list');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
