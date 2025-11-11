const { ensure, create, upsert, remove, list } = require('../../lib/workspace/setsStore');

describe('setsStore etag and If-Match behavior', () => {
  beforeEach(() => {
    // Clear store by removing listed ids
    const all = list();
    for (const r of all) remove(r.id);
  });

  test('create -> ensure -> remove lifecycle', () => {
    const rec = create('test-a', { files: [{ path: '/a.txt', content: 'x' }] });
    expect(rec).toHaveProperty('id', 'test-a');
    const got = ensure('test-a');
    expect(got).not.toBeNull();
    const removed = remove('test-a');
    expect(removed).toBe(true);
    const gone = ensure('test-a');
    expect(gone).toBeNull();
  });

  test("If-Match '*' on non-existing should fail", () => {
    expect(() => upsert('nope-1', { files: [] }, { ifMatch: '*' })).toThrow();
    try {
      upsert('nope-1', { files: [] }, { ifMatch: '*' });
    } catch (e) {
      expect(e).toHaveProperty('code', 'ETAG_MISMATCH');
      expect(e.status).toBe(412);
      expect(e.currentEtag).toBeNull();
    }
  });

  test("If-Match '*' succeeds when resource exists", () => {
    const r = create('exists-1', { files: [{ path: '/b.txt', content: 'y' }] });
    expect(() => upsert('exists-1', { files: [{ path: '/b.txt', content: 'z' }] }, { ifMatch: '*' })).not.toThrow();
    const after = ensure('exists-1');
    expect(after.files.some(f => f.content === 'z')).toBe(true);
  });

  test('etag equality check and mismatch returns currentEtag', () => {
    const r = create('e1', { files: [{ path: '/c.txt', content: '1' }] });
    const goodEtag = r.etag;
    // correct etag should succeed
    expect(() => upsert('e1', { files: [{ path: '/c.txt', content: '2' }] }, { ifMatch: goodEtag })).not.toThrow();
    // wrong etag should throw with currentEtag
    const prev = ensure('e1');
    const wrong = 'W/"0-bad"';
    try {
      upsert('e1', { files: [{ path: '/c.txt', content: '3' }] }, { ifMatch: wrong });
      throw new Error('should not reach');
    } catch (e) {
      expect(e).toHaveProperty('code', 'ETAG_MISMATCH');
      expect(e).toHaveProperty('currentEtag');
      expect(e.currentEtag).toBe(prev.etag);
    }
  });

  test('PUT (non-merge) replaces files even when payload.files omitted', () => {
    create('put-1', { files: [{ path: '/d.txt', content: 'orig' }] });
    // PUT with no files should replace with empty list per new semantics
    const out = upsert('put-1', { meta: { note: 'cleared' } }, { ifMatch: undefined, merge: false });
    expect(out.files).toEqual([]);
    expect(out.meta.note).toBe('cleared');
  });

  test('PATCH (merge) keeps previous files when files omitted', () => {
    create('patch-1', { files: [{ path: '/e.txt', content: 'orig' }], meta: { a: 1 } });
    const out = upsert('patch-1', { meta: { b: 2 } }, { merge: true });
    expect(out.files.length).toBeGreaterThan(0);
    expect(out.meta).toMatchObject({ a: 1, b: 2 });
  });
});
