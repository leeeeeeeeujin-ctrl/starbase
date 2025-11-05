#!/usr/bin/env node
/**
 * Merge values from .env.vercel.dev into .env.local non-destructively:
 * - If key exists in .env.local and has a non-empty value, keep it.
 * - If key exists and value is empty, fill from Vercel.
 * - If key is missing, append it under a recovery section.
 */
const fs = require('fs');
const path = require('path');

function parseEnvLines(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    // Remove inline comments only if preceded by space
    // Keep original if quoted
    value = value.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    entries.push({ key, value });
  }
  return entries;
}

function buildIndex(lines) {
  const map = new Map();
  lines.forEach((line, idx) => {
    if (!line || line.trim().startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq <= 0) return;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    map.set(key, { index: idx, rawValue: value });
  });
  return map;
}

function quoteIfNeeded(val) {
  if (/[\s"'`]|\n/.test(val)) {
    return JSON.stringify(val);
  }
  return val;
}

function main() {
  const root = process.cwd();
  const localPath = path.join(root, '.env.local');
  const vercelPath = path.join(root, '.env.vercel.dev');
  if (!fs.existsSync(localPath)) {
    console.error('Missing .env.local');
    process.exit(1);
  }
  if (!fs.existsSync(vercelPath)) {
    console.error('Missing .env.vercel.dev');
    process.exit(1);
  }
  const localText = fs.readFileSync(localPath, 'utf8');
  const vercelText = fs.readFileSync(vercelPath, 'utf8');
  const localLines = localText.split(/\r?\n/);
  const index = buildIndex(localLines);
  const vercelEntries = parseEnvLines(vercelText);

  // Keys we want to force-append at the end to ensure they take effect
  const forceAppendKeys = new Set([
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
    'R2_PUBLIC_BASE_URL',
    'R2_S3_ENDPOINT',
    'NEXT_PUBLIC_R2_PUBLIC_BASE_URL',
  ]);

  const appended = [];
  let updatedCount = 0;

  for (const { key, value } of vercelEntries) {
    const entry = index.get(key);
    if (entry) {
      const current = entry.rawValue.replace(/^['"]|['"]$/g, '');
      const currentIsEmpty = current === '';
      if (currentIsEmpty) {
        localLines[entry.index] = `${key}=${quoteIfNeeded(value)}`;
        updatedCount += 1;
      }
    } else {
      appended.push({ key, value });
    }

    // Also force-append duplicates for override keys to ensure last-one-wins
    if (forceAppendKeys.has(key)) {
      appended.push({ key, value });
    }
  }

  if (appended.length) {
    appended.sort((a, b) => a.key.localeCompare(b.key));
    const block = [
      '',
      '# Recovered from Vercel (development) — appended automatically',
      ...appended.map(({ key, value }) => `${key}=${quoteIfNeeded(value)}`),
      '',
    ];
    localLines.push(...block);
  }

  fs.writeFileSync(localPath, localLines.join('\n'));
  console.log(`Updated ${updatedCount} existing empty keys and appended ${appended.length} new keys.`);
}

main();
