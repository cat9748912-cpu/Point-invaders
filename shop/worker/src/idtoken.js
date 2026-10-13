'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🪪 WHO IS ASKING — Firebase ID tokens checked without the Admin SDK
// ══════════════════════════════════════════════════════════════════════
// Firebase's documented recipe for servers without the Admin SDK ("Verify ID
// tokens using a third-party JWT library"): an RS256 signature by one of Google's
// published securetoken keys, and these claims:
//   aud = the project id   ·   iss = https://securetoken.google.com/<project id>
//   sub = the uid, a non-empty string   ·   exp in the future
//   iat and auth_time in the past
// Google's keys come from its JWK endpoint (the same key ids as the documented
// x509 one) and are kept for as long as Google's Cache-Control says.
//
// Not reproduced: the Admin SDK's `checkRevoked`. It needs an account lookup with
// administrator rights over every player's sign-in record. A disabled or
// signed-out-everywhere account's token keeps working for the rest of its hour,
// which is acceptable here: all such a token can do is open a checkout page that
// its own holder pays for.
const { b64urlToBytes, b64urlToJson, utf8 } = require('./b64');

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
/** Clock skew tolerated on "issued in the past". */
const SKEW_S = 60;
/** At most one key fetch a minute, even when tokens with unknown key ids keep arriving. */
const REFETCH_MS = 60_000;

/** Per isolate: Google's public keys, as CryptoKey promises by key id. */
let keyCache = { at: 0, exp: 0, keys: new Map() };

class TokenError extends Error {
  constructor(code){ super(`ID token refused: ${code}`); this.name = 'TokenError'; this.code = code; }
}

/** A uid becomes a database path segment, so it may not contain what the database forbids in a key. */
const BAD_KEY = /[.#$[\]/\u0000-\u001f\u007f]/;

/**
 * @param {object} o
 * @param {string} o.projectId
 * @param {typeof fetch} [o.fetch]
 * @param {() => number} [o.now]
 * @param {boolean} [o.emulator]   accept the Auth emulator's UNSIGNED tokens. Tests only (worker.mjs
 *                                 refuses it with a live key).
 */
function makeVerifier({ projectId, fetch: f = fetch, now = Date.now, emulator = false }){
  async function keyFor(kid){
    const t = now();
    const fresh = keyCache.exp > t;
    if(!(fresh && keyCache.keys.has(kid)) && (!fresh || t - keyCache.at >= REFETCH_MS)){
      const r = await f(JWKS_URL);
      if(!r.ok) throw new TokenError('keys_unavailable');
      const j = await r.json();
      const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
      const keys = new Map();
      for(const k of (j && j.keys) || []){
        if(!k || k.kty !== 'RSA' || typeof k.kid !== 'string') continue;
        keys.set(k.kid, crypto.subtle.importKey('jwk', { kty: 'RSA', n: k.n, e: k.e, alg: 'RS256', ext: true },
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
      }
      keyCache = { at: t, exp: t + Math.min(Number(m && m[1]) || 3600, 6 * 3600) * 1000, keys };
    }
    return keyCache.keys.get(kid) || null;
  }

  return {
    /** @returns {Promise<object>} the token's claims, plus `uid` */
    async verify(token){
      const parts = String(token || '').split('.');
      if(parts.length !== 3) throw new TokenError('malformed');
      let head, claims;
      try{ head = b64urlToJson(parts[0]); claims = b64urlToJson(parts[1]); }catch(e){ throw new TokenError('malformed'); }
      if(!head || !claims || typeof claims !== 'object') throw new TokenError('malformed');

      if(emulator){
        // The Auth emulator signs nothing (alg "none").
        if(head.alg !== 'none') throw new TokenError('alg');
      }else{
        if(head.alg !== 'RS256' || typeof head.kid !== 'string') throw new TokenError('alg');
        const key = await keyFor(head.kid);
        if(!key) throw new TokenError('kid');
        let ok = false;
        try{
          ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', await key, b64urlToBytes(parts[2]), utf8(`${parts[0]}.${parts[1]}`));
        }catch(e){ ok = false; }
        if(!ok) throw new TokenError('signature');
      }

      const s = Math.floor(now() / 1000);
      if(claims.aud !== projectId) throw new TokenError('aud');
      if(claims.iss !== `https://securetoken.google.com/${projectId}`) throw new TokenError('iss');
      if(typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 || BAD_KEY.test(claims.sub)) throw new TokenError('sub');
      if(!(Number(claims.exp) > s)) throw new TokenError('expired');
      if(!(Number(claims.iat) <= s + SKEW_S)) throw new TokenError('iat');
      if(!(Number(claims.auth_time) <= s + SKEW_S)) throw new TokenError('auth_time');
      return { ...claims, uid: claims.sub };
    }
  };
}

/** Tests only: forget Google's keys. */
const clearKeyCache = () => { keyCache = { at: 0, exp: 0, keys: new Map() }; };

module.exports = { makeVerifier, TokenError, clearKeyCache, JWKS_URL };
