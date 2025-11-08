import path from 'path';
import { buildStarterPack } from '@/lib/workspace/getStarterPackFiles';
import { getSet, saveSet, getIdempotent, ensureIdempotent } from '@/lib/workspace/setStore';

export default async function handler(req, res) {
  try {
    const base = path.join(process.cwd(), 'ai-roomchat');
    const files = buildStarterPack(base);
    const id = `test_${Math.random().toString(36).slice(2,10)}`;
    const reqId = `req_${Math.random().toString(36).slice(2,10)}`;

    const log = [];
    const push = (m, extra={}) => { log.push({ at: Date.now(), msg: m, ...extra }); };

    // Simulate create flow with idempotency
    const cache0 = getIdempotent(reqId);
    push('getIdempotent(before)', { hit: !!cache0 });
    const exists0 = getSet(id);
    push('getSet(before)', { exists: !!exists0 });
    const rec1 = saveSet(id, files, { starterApplied: true });
    push('saveSet(create)', { id: rec1.id, etag: rec1.etag, count: rec1.files?.length||0 });
    const idemBefore = ensureIdempotent(reqId, rec1);
    push('ensureIdempotent(store)', { returned: !!idemBefore });

    const cache1 = getIdempotent(reqId);
    push('getIdempotent(after)', { hit: !!cache1, refId: cache1?.id||null });

    // Simulate PUT with mismatched etag then correct etag
    const wrong = 'etag:wrong';
    const cur = getSet(id);
    const mismatch = (cur && cur.etag && cur.etag !== wrong);
    push('etag-check(mismatch)', { current: cur?.etag||null, wrong, mismatch });
    const rec2 = saveSet(id, files, { note: 'update1' });
    push('saveSet(update)', { id: rec2.id, etag: rec2.etag });

    return res.status(200).json({ ok: true, id, reqId, steps: log });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message||e) });
  }
}

export const config = { runtime: 'nodejs' };

