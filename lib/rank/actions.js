import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const BASE_ROOT = process.env.WORKSPACE_ROOT ? path.resolve(process.env.WORKSPACE_ROOT) : process.cwd();
const DEFAULT_READONLY_EXEMPT = new Set(['list_files','read_file','read_file_range','search_text','stat_file']);
const MAX_FILE_BYTES = Number(process.env.ACTION_MAX_FILE_BYTES || 2 * 1024 * 1024);
const SEARCH_MAX_RESULTS_DEFAULT = 200;

function resolveSafe(p) {
  const target = path.resolve(BASE_ROOT, p || '.');
  if (!target.startsWith(BASE_ROOT)) throw new Error('path_outside_workspace');
  return target;
}

async function listDir(dir, recursive = false) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    const entries = await fs.readdir(cur, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === '.git' || ent.name === 'node_modules') continue;
      const full = path.join(cur, ent.name);
      const stat = await fs.lstat(full);
      out.push({ name: ent.name, path: path.relative(BASE_ROOT, full), type: ent.isDirectory() ? 'dir' : 'file', size: ent.isDirectory() ? 0 : stat.size, mtimeMs: stat.mtimeMs });
      if (recursive && ent.isDirectory()) stack.push(full);
    }
  }
  return out;
}

function isBinaryBuffer(buf) { const len = Math.min(buf.length, 1024); for (let i=0;i<len;i++){ if (buf[i]===0) return true; } return false; }

function runCommand(cmd, { cwd = BASE_ROOT, timeoutMs = 20000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true, env: process.env, windowsHide: true });
    let stdout=''; let stderr='';
    const t = setTimeout(()=>{ try{child.kill('SIGKILL');}catch{}; resolve({ ok:false, code:124, stdout, stderr:stderr+'\nTIMEOUT' });}, timeoutMs);
    child.stdout?.on('data',(d)=>stdout+=d.toString());
    child.stderr?.on('data',(d)=>stderr+=d.toString());
    child.on('error',(err)=>{ clearTimeout(t); resolve({ ok:false, code:-1, stdout, stderr:String(err?.message||err) }); });
    child.on('close',(code)=>{ clearTimeout(t); resolve({ ok:code===0, code, stdout, stderr }); });
  });
}

async function isCommandAllowed(cmdPreview) {
  try {
    const allowPath = resolveSafe('workspace/config/ai-actions-allowlist.json');
    const buf = await fs.readFile(allowPath, 'utf8').catch(()=> '');
    if (!buf) return false;
    const conf = JSON.parse(buf);
    const allow = Array.isArray(conf.allow) ? conf.allow : [];
    return allow.some((s)=> typeof s==='string' && cmdPreview.startsWith(s));
  } catch { return false; }
}

async function action_list_files(payload){ const dir = resolveSafe(payload?.path||'.'); const recursive=!!payload?.recursive; const items = await listDir(dir, recursive); return { ok:true, result:{ items } }; }
async function action_read_file(payload){ const file=resolveSafe(payload?.path); const stat=await fs.lstat(file); if (stat.size>MAX_FILE_BYTES) return { ok:false, error:'file_too_large' }; const buf=await fs.readFile(file); if (isBinaryBuffer(buf)) return { ok:true, result:{ encoding:'base64', content: buf.toString('base64') } }; return { ok:true, result:{ encoding:'utf8', content: buf.toString('utf8') } }; }
async function action_read_file_range(payload){ const file=resolveSafe(payload?.path); const start=Number(payload?.start??0); const end=Number(payload?.end??start+250); const txt=await fs.readFile(file,'utf8'); const lines=txt.split(/\r?\n/); const s=Math.max(0,start); const e=Math.min(lines.length, Math.max(s,end)); const slice=lines.slice(s,e).join('\n'); return { ok:true, result:{ start:s, end:e, content:slice } }; }
async function action_write_file(payload){ const file=resolveSafe(payload?.path); const content=typeof payload?.content==='string'?payload.content:''; await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file, content, 'utf8'); return { ok:true }; }
async function action_delete_file(payload){ const file=resolveSafe(payload?.path); await fs.rm(file,{force:true}); return { ok:true }; }
async function action_delete_dir(payload){ const dir=resolveSafe(payload?.path); const recursive=payload?.recursive!==false; await fs.rm(dir,{recursive,force:true}); return { ok:true }; }
async function action_move_file(payload){ const src=resolveSafe(payload?.src); const dest=resolveSafe(payload?.dest); await fs.mkdir(path.dirname(dest),{recursive:true}); await fs.rename(src,dest); return { ok:true }; }
async function action_copy_file(payload){ const src=resolveSafe(payload?.src); const dest=resolveSafe(payload?.dest); await fs.mkdir(path.dirname(dest),{recursive:true}); await fs.copyFile(src,dest); return { ok:true }; }
async function action_mkdirs(payload){ const dir=resolveSafe(payload?.path); await fs.mkdir(dir,{recursive:true}); return { ok:true }; }
async function action_stat_file(payload){ const p=resolveSafe(payload?.path); const s=await fs.lstat(p); return { ok:true, result:{ isDir:s.isDirectory(), size:s.size, mtimeMs:s.mtimeMs } }; }
async function action_search_text(payload){ const root=resolveSafe(payload?.path||'.'); const query=String(payload?.query||'').trim(); if(!query) return { ok:false, error:'missing_query' }; const maxResults=Number(payload?.max_results||SEARCH_MAX_RESULTS_DEFAULT); const results=[]; async function scan(d){ const entries=await fs.readdir(d,{withFileTypes:true}); for(const ent of entries){ if(results.length>=maxResults) return; if(ent.name==='.git'||ent.name==='node_modules') continue; const full=path.join(d,ent.name); if(ent.isDirectory()){ await scan(full);} else { try{ const stat=await fs.lstat(full); if(stat.size>MAX_FILE_BYTES) continue; const buf=await fs.readFile(full); if(isBinaryBuffer(buf)) continue; const text=buf.toString('utf8'); const lines=text.split(/\r?\n/); for(let i=0;i<lines.length;i++){ if(lines[i].includes(query)){ results.push({ path:path.relative(BASE_ROOT, full), line:i+1, preview:lines[i] }); if(results.length>=maxResults) break; } } }catch{} } } } await scan(root); return { ok:true, result:{ results } }; }
async function action_edit_patch(payload){ const diff=String(payload?.diff||payload?.patch||'').trim(); const cwd=BASE_ROOT; if(!diff) return { ok:false, error:'missing_patch' }; const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'patch-')); const patchPath=path.join(tmp,'patch.diff'); await fs.writeFile(patchPath,diff,'utf8'); const cmd=`git apply --unsafe-paths --reject --whitespace=nowarn "${patchPath.replace(/\"/g,'\\\"')}"`; const r=await runCommand(cmd,{cwd,timeoutMs:20000}); try{ await fs.rm(tmp,{recursive:true,force:true}); }catch{} if(!r.ok) return { ok:false, error:'patch_failed', detail:{ code:r.code, stdout:r.stdout, stderr:r.stderr } }; return { ok:true }; }
async function action_sandbox_exec(payload){ if(!process.env.SANDBOX_EXEC_ENABLE) return { ok:false, error:'sandbox_disabled'}; const cmd=String(payload?.cmd||'').trim(); if(!cmd) return { ok:false, error:'missing_cmd'}; const allowed=await isCommandAllowed(cmd); if(!allowed) return { ok:false, error:'sandbox_blocked'}; const cwd=payload?.cwd?resolveSafe(payload.cwd):BASE_ROOT; const timeoutMs=Number(payload?.timeout_ms||20000); const r=await runCommand(cmd,{cwd,timeoutMs}); return { ok:r.ok, result:{ code:r.code, stdout:r.stdout, stderr:r.stderr } } }
async function action_test_run(p){ return action_sandbox_exec({ cmd:'npm test --silent', cwd:p?.cwd, timeout_ms:p?.timeout_ms }); }
async function action_lint_run(p){ return action_sandbox_exec({ cmd:'npm run lint --silent', cwd:p?.cwd, timeout_ms:p?.timeout_ms }); }
async function action_build_run(p){ return action_sandbox_exec({ cmd:'npm run build --silent', cwd:p?.cwd, timeout_ms:p?.timeout_ms }); }

const registry = { list_files:action_list_files, read_file:action_read_file, read_file_range:action_read_file_range, write_file:action_write_file, delete_file:action_delete_file, delete_dir:action_delete_dir, move_file:action_move_file, copy_file:action_copy_file, mkdirs:action_mkdirs, stat_file:action_stat_file, search_text:action_search_text, edit_patch:action_edit_patch, sandbox_exec:action_sandbox_exec, test_run:action_test_run, lint_run:action_lint_run, build_run:action_build_run };

export function isReadOnly(action){ return DEFAULT_READONLY_EXEMPT.has(action); }
export async function performAction(action, payload){ const fn=registry[action]; if(!fn) return { ok:false, error:'unknown_action' }; return fn(payload||{}); }
export async function performBatch(payload){ const actions=Array.isArray(payload?.actions)?payload.actions:[]; const results=[]; for(const a of actions){ if(!a||typeof a!=='object'){ results.push({ ok:false, error:'invalid_action'}); continue;} const type=a.action||a.type||a.name; if(type==='batch'){ results.push({ ok:false, error:'nested_batch_not_allowed'}); continue;} const r=await performAction(type, a.payload||{}); results.push(r);} return { ok:true, result:{ results } }; }
export function getBaseRoot(){ return BASE_ROOT; }

