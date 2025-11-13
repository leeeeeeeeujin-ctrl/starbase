import { createClient } from '@supabase/supabase-js';
import { performAction, performBatch, isReadOnly } from '../../../lib/rank/actions';

const RATE_LIMIT_COUNT = Number(process.env.ACTION_RATE_LIMIT_COUNT || 30);
const RATE_LIMIT_WINDOW_MS = Number(process.env.ACTION_RATE_LIMIT_WINDOW_MS || 10_000);
const bucket = new Map();

function getBearer(req){ const h=req.headers?.authorization||req.headers?.Authorization; if(!h) return null; const m=/^Bearer\s+(.+)$/i.exec(h); return m?m[1]:null; }
function supabaseAdmin(){ const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE; if(!url||!key) return null; return createClient(url,key,{ auth:{ persistSession:false } }); }
async function getUserId(token){ const supa=supabaseAdmin(); if(!supa||!token) return null; try{ const {data,error}=await supa.auth.getUser(token); if(error) return null; return data?.user?.id||null; }catch{return null;} }
function checkRateLimit(key, allow){ if(allow) return {ok:true}; const now=Date.now(); const cur=bucket.get(key); if(!cur||cur.reset<now){ bucket.set(key,{ reset: now+RATE_LIMIT_WINDOW_MS, count:1 }); return {ok:true}; } if(cur.count>=RATE_LIMIT_COUNT){ return { ok:false, retryAfterMs: cur.reset-now }; } cur.count+=1; return { ok:true }; }

export default async function handler(req,res){
  if(req.method!=='POST'){ res.setHeader('Allow','POST'); return res.status(405).json({ ok:false, error:'method_not_allowed' }); }
  const token=getBearer(req); const userId=await getUserId(token);
  const { action, payload } = req.body || {};
  if(!action) return res.status(400).json({ ok:false, error:'unknown_action' });
  const isBatch = action==='batch';
  const limiterKey=`${userId||'anon'}:${action}`;
  const readExempt = !isBatch && isReadOnly(action);
  const rl=checkRateLimit(limiterKey, readExempt);
  if(!rl.ok) return res.status(429).json({ ok:false, error:'rate_limited', retryAfterMs: rl.retryAfterMs });
  try{
    const out = isBatch ? await performBatch(payload||{}) : await performAction(action, payload||{});
    if(!out?.ok) return res.status(400).json(out||{ ok:false, error:'action_failed' });
    return res.status(200).json(out);
  }catch(err){ return res.status(500).json({ ok:false, error: err?.message||'server_error' }); }
}

