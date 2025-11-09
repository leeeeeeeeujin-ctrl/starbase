import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  try {
    const ROOT = process.cwd();
    const abs = path.join(ROOT, 'ai-roomchat', 'src', 'game', 'index.js');
    const code = fs.readFileSync(abs, 'utf8');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    // Return the file as-is; users can export default factory function.
    res.status(200).send(code);
  } catch (e) {
    res.status(404).send('// user module not found');
  }
}

export const config = { runtime: 'nodejs' };
