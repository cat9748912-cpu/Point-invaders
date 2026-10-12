'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🗃️ THE DATABASE OVER HTTPS — reads, writes and compare-and-swap
// ══════════════════════════════════════════════════════════════════════
// The Realtime Database's REST API with an administrator's access token. The
// security rules don't apply to it, exactly as they don't apply to the Admin
// SDK: that is how the shop writes under shop/, where clients can write nothing
// (database.rules.json).
//
// TRANSACTIONS are compare-and-swap with ETags. Read the value with its ETag,
// compute the new value, PUT it with `if-match: <etag>`. If anyone wrote in
// between, the database answers 412 with the value and ETag it now holds, and
// the update runs again on those. An update function that returns undefined
// means "leave it": nothing is written. Every attempt starts from what the
// server holds, so the Admin SDK's first-call-sees-null trap can't happen here.
//
// Paths are joined from ids that were checked before they got here: uids by
// idtoken.js, SKUs by the catalogue, Stripe ids by Stripe. Each segment is still
// URL-encoded on the way out.

/**
 * @param {object} o
 * @param {string} o.url        the database's address
 * @param {?string} [o.ns]      the emulator's namespace (tests only)
 * @param {{getToken:() => Promise<string>}} o.tokens
 * @param {typeof fetch} [o.fetch]
 * @param {number} [o.maxTries] attempts before a contended transaction gives up
 */
function makeRtdb({ url, ns = null, tokens, fetch: f = fetch, maxTries = 6 }){
  const base = String(url).replace(/\/+$/, '');
  const target = (path, query) => {
    const segs = String(path).split('/').filter(Boolean).map(encodeURIComponent).join('/');
    const q = new URLSearchParams(query || {});
    if(ns) q.set('ns', ns);
    const qs = q.toString();
    return `${base}/${segs}.json${qs ? '?' + qs : ''}`;
  };

  async function call(method, path, { body, headers, query } = {}){
    const token = await tokens.getToken();
    return f(target(path, query), {
      method,
      headers: { authorization: `Bearer ${token}`, ...(headers || {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  async function fail(res, what, path){
    const text = await res.text().catch(() => '');
    let msg = text;
    try{ msg = JSON.parse(text).error || text; }catch(e){ /* plain text */ }
    const denied = res.status === 401 || res.status === 403;
    throw Object.assign(new Error(`database ${what} ${path}: ${res.status} ${String(msg).slice(0, 160)}`),
      { code: denied ? 'db_denied' : 'db_error', status: res.status });
  }

  return {
    async get(path){
      const r = await call('GET', path);
      if(!r.ok) await fail(r, 'read', path);
      return r.json();
    },
    async set(path, value){
      const r = await call('PUT', path, { body: value, query: { print: 'silent' } });
      if(!r.ok) await fail(r, 'write', path);
    },
    async update(path, fields){
      const r = await call('PATCH', path, { body: fields, query: { print: 'silent' } });
      if(!r.ok) await fail(r, 'update', path);
    },
    async remove(path){
      const r = await call('DELETE', path, { query: { print: 'silent' } });
      if(!r.ok) await fail(r, 'delete', path);
    },
    /**
     * @param {string} path
     * @param {(current:any) => any} fn   gets a private copy; returns the new value, or undefined to leave it
     * @returns {Promise<{committed:boolean, value:any}>}  value: what the server now holds
     */
    async transaction(path, fn){
      const r = await call('GET', path, { headers: { 'x-firebase-etag': 'true' } });
      if(!r.ok) await fail(r, 'read', path);
      let etag = r.headers.get('etag');
      let value = await r.json();
      for(let i = 0; i < maxTries; i++){
        const next = fn(value === null ? null : structuredClone(value));
        if(next === undefined) return { committed: false, value };
        const w = await call('PUT', path, { body: next, headers: { 'if-match': etag } });
        if(w.ok) return { committed: true, value: await w.json() };
        if(w.status !== 412) await fail(w, 'transaction', path);
        etag = w.headers.get('etag');
        value = await w.json();
      }
      throw Object.assign(new Error(`database transaction ${path}: still contended after ${maxTries} tries`), { code: 'db_contention' });
    }
  };
}

module.exports = { makeRtdb };
