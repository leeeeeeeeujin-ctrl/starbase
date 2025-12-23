#!/usr/bin/env node
// Supabase REST inspector using ai-roomchat/SPPP.
//
// Usage (from repo root, e.g. starbase/):
//   node tmpnode/supabase-rest-inspect.js rank_game_workspaces
//
// Prints a small JSON sample from the requested table.

const fs = require('fs');
const path = require('path');

const table = process.argv[2] || 'rank_game_workspaces';

const spppPath = path.join(__dirname, '..', 'ai-roomchat', 'SPPP');
if (!fs.existsSync(spppPath)) {
  console.error('SPPP file not found at', spppPath);
  process.exit(2);
}

const raw = fs.readFileSync(spppPath, 'utf8');
const lines = raw
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

let supaUrl = null;
let serviceKey = null;

for (const line of lines) {
  if (!supaUrl && /^https?:\/\//i.test(line)) {
    supaUrl = line;
  }
  const jwtLike = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(line);
  if (!serviceKey && jwtLike) {
    serviceKey = line;
  }
}

if (!supaUrl || !serviceKey) {
  console.error('Could not extract Supabase URL or service key from SPPP.');
  process.exit(3);
}

async function run() {
  try {
    const base = supaUrl.replace(/\/+$/, '');
    const url =
      base +
      `/rest/v1/${encodeURIComponent(table)}?select=*&order=updated_at.desc.nullslast&limit=20`;

    const res = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: 'application/json',
      },
    });

    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Body:');
    console.log(text);
  } catch (err) {
    console.error('Error calling Supabase REST:', err);
    process.exit(4);
  }
}

run();

