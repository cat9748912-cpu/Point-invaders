'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🔑 GOOGLE ACCESS — a service account's key becomes a one-hour token
// ══════════════════════════════════════════════════════════════════════
// The Worker runs outside Google Cloud, so it has no built-in identity. It signs
// a short JWT with a service account's private key and trades it at Google's
// token endpoint for an access token (the JWT bearer grant, RFC 7523). The token
// is kept in memory for its life, so an isolate signs at most about once an hour.
//
// The service account should hold ONE role, Firebase Realtime Database Admin
// (RUNBOOK § 2). Whoever holds its key can read and write the whole database,
// so the key lives only in Cloudflare's secret store, never in this repository.
const { utf8, b64ToBytes, bytesToB64url, jsonToB64url } = require('./b64');

/** What the Realtime Database's REST API asks of an administrator's token. */
const DB_SCOPES = Object.freeze(['https://www.googleapis.com/auth/firebase.database',
                                 'https://www.googleapis.com/auth/userinfo.email']);
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
/** Renew this long before Google's expiry, so a token never dies mid-request. */
const EARLY_MS = 5 * 60 * 1000;

/** Shared by every request this isolate serves; keyed by the account's email. */
const cache = new Map();

/** The JSON key Google gives you for a service account, checked for the fields used here. */
function parseServiceAccount(json){
  let sa;
  try{ sa = typeof json === 'string' ? JSON.parse(json) : json; }catch(e){ sa = null; }
  if(!sa || sa.type !== 'service_account' || typeof sa.client_email !== 'string' || typeof sa.private_key !== 'string'){
    throw Object.assign(new Error('FIREBASE_SERVICE_ACCOUNT is not a service account key file'), { code: 'google_key' });
  }
  return sa;
}

/** A PEM block's base64 body, as bytes (PKCS #8 for a service account's key). */
function pemBody(pem){
  return b64ToBytes(String(pem).replace(/-----(BEGIN|END)[A-Z ]+-----/g, '').replace(/\s+/g, ''));
}

/**
 * @param {object} o
 * @param {string|object} o.serviceAccount   the key file's JSON
 * @param {typeof fetch} [o.fetch]
 * @param {() => number} [o.now]
 * @param {readonly string[]} [o.scopes]
 */
function makeTokenSource({ serviceAccount, fetch: f = fetch, now = Date.now, scopes = DB_SCOPES }){
  const sa = parseServiceAccount(serviceAccount);
  let signingKey = null;
  const key = () => signingKey || (signingKey = crypto.subtle.importKey('pkcs8', pemBody(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']));

  return {
    email: sa.client_email,
    async getToken(){
      const hit = cache.get(sa.client_email);
      if(hit && hit.exp - EARLY_MS > now()) return hit.token;
      const iat = Math.floor(now() / 1000);
      const head = jsonToB64url({ alg: 'RS256', typ: 'JWT', kid: sa.private_key_id });
      const claims = jsonToB64url({ iss: sa.client_email, scope: scopes.join(' '), aud: TOKEN_URI, iat, exp: iat + 3600 });
      let sig;
      try{
        sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await key(), utf8(`${head}.${claims}`));
      }catch(e){
        signingKey = null;
        throw Object.assign(new Error('the service account key could not be used to sign'), { code: 'google_key' });
      }
      const assertion = `${head}.${claims}.${bytesToB64url(new Uint8Array(sig))}`;
      const res = await f(TOKEN_URI, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`
      });
      const j = await res.json().catch(() => ({}));
      if(!res.ok || typeof j.access_token !== 'string'){
        // Google's error words only (invalid_grant …): never the assertion or the key.
        throw Object.assign(new Error(`Google refused the service account: ${res.status} ${j.error || ''}`.trim()), { code: 'google_key' });
      }
      cache.set(sa.client_email, { token: j.access_token, exp: now() + (Number(j.expires_in) || 3600) * 1000 });
      return j.access_token;
    }
  };
}

/** A fixed token: the database emulator accepts `owner` as an administrator. Tests only. */
const staticToken = token => ({ email: null, getToken: async () => token });

/** Tests only: forget every cached token. */
const clearTokenCache = () => cache.clear();

module.exports = { makeTokenSource, staticToken, parseServiceAccount, clearTokenCache, DB_SCOPES, TOKEN_URI };
