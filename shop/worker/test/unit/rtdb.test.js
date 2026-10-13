'use strict';
// The database client (src/rtdb.js) against a small in-memory stand-in for the
// REST API's ETag behaviour. The real emulator runs the same client in
// test/integration/webhook.test.js; this covers the paths that are hard to
// provoke there (endless contention, a refused token).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRtdb } = require('../../src/rtdb');
const { staticToken } = require('../../src/google');

/** One value, one version counter, ETag = the version: enough of the REST API for the client. */
function server({ value = null, deny = false, contend = 0 } = {}){
  let version = 0;
  const seen = [];
  const etag = () => `e${version}`;
  const f = async (url, init) => {
    seen.push({ url, method: init.method, headers: init.headers, body: init.body });
    if(deny) return new Response(JSON.stringify({ error: 'Permission denied' }), { status: 401 });
    const h = init.headers || {};
    if(init.method === 'GET') return new Response(JSON.stringify(value), { headers: h['x-firebase-etag'] ? { etag: etag() } : {} });
    if(init.method === 'PUT' && h['if-match']){
      if(contend > 0){ contend--; version++; value = { other: version }; }       // someone else wrote first
      if(h['if-match'] !== etag()) return new Response(JSON.stringify(value), { status: 412, headers: { etag: etag() } });
    }
    if(init.method === 'PUT'){ value = JSON.parse(init.body); version++; return new Response(init.body); }
    if(init.method === 'DELETE'){ value = null; version++; return new Response(null, { status: 204 }); }
    if(init.method === 'PATCH'){ value = { ...(value || {}), ...JSON.parse(init.body) }; version++; return new Response(null, { status: 204 }); }
    return new Response('?', { status: 400 });
  };
  return { f, seen, get value(){ return value; } };
}

const client = (s, extra) => makeRtdb({ url: 'https://db.example/', tokens: staticToken('tok'), fetch: s.f, ...extra });

test('addresses: path segments encoded, the token in a header, writes silent, the namespace when given', async () => {
  const s = server({ value: 1 });
  const db = client(s, { ns: 'demo-ns' });
  assert.equal(await db.get('shop/ent/u1/col_aurora'), 1);
  await db.set('shop/a b', 2);
  await db.update('shop', { x: 1 });
  await db.remove('/');
  assert.deepEqual(s.seen.map(x => `${x.method} ${x.url}`), [
    'GET https://db.example/shop/ent/u1/col_aurora.json?ns=demo-ns',
    'PUT https://db.example/shop/a%20b.json?print=silent&ns=demo-ns',
    'PATCH https://db.example/shop.json?print=silent&ns=demo-ns',
    'DELETE https://db.example/.json?print=silent&ns=demo-ns'
  ]);
  assert.equal(s.seen[0].headers.authorization, 'Bearer tok');
});

test('a transaction: read with its ETag, write with if-match; undefined writes nothing', async () => {
  const s = server({ value: { n: 1 } });
  const db = client(s);
  const r = await db.transaction('c', cur => ({ n: cur.n + 1 }));
  assert.deepEqual(r, { committed: true, value: { n: 2 } });
  assert.equal(s.seen[0].headers['x-firebase-etag'], 'true');
  assert.equal(s.seen[1].headers['if-match'], 'e0');
  const before = s.seen.length;
  assert.deepEqual(await db.transaction('c', () => undefined), { committed: false, value: { n: 2 } });
  assert.equal(s.seen.length, before + 1, 'only the read');
});

test('a refused write (412) runs the update again on what the server now holds', async () => {
  const s = server({ value: { n: 1 }, contend: 2 });
  const seenByFn = [];
  const r = await client(s).transaction('c', cur => { seenByFn.push(cur); return { ...cur, mine: true }; });
  assert.equal(r.committed, true);
  assert.deepEqual(seenByFn, [{ n: 1 }, { other: 1 }, { other: 2 }]);
  assert.deepEqual(s.value, { other: 2, mine: true });
});

test('endless contention gives up with a clear error; the update never sees a shared object', async () => {
  const s = server({ value: { n: 1 }, contend: 99 });
  await assert.rejects(client(s, { maxTries: 3 }).transaction('c', cur => { cur.touched = true; return cur; }),
    e => e.code === 'db_contention');
});

test('a refused token is db_denied, so /health can say so', async () => {
  const s = server({ deny: true });
  await assert.rejects(client(s).get('shop/cfg/open'), e => e.code === 'db_denied' && /Permission denied/.test(e.message));
  await assert.rejects(client(s).transaction('x', () => 1), e => e.code === 'db_denied');
});
