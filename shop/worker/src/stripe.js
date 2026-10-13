'use strict';
// ══════════════════════════════════════════════════════════════════════
//  💳 THE PROVIDER — the seven calls the shop makes, and webhook signatures
// ══════════════════════════════════════════════════════════════════════
// Stripe's REST API spoken directly with fetch(). The Worker needs only seven
// calls, and the method names mirror the official library's
// (stripe.checkout.sessions.create …), so checkout.js and webhook.js read the
// same as they would with it.
//
// Every request names the API version the code was written against
// (config.STRIPE_API_VERSION), so the shape of what comes back never drifts.
// Every POST carries an idempotency key, so retrying one can't do it twice.
const { STRIPE_API_VERSION } = require('./config');
const { utf8, fromUtf8, toHex, concat } = require('./b64');

class StripeError extends Error {
  constructor(message, fields){ super(message); this.name = 'StripeError'; Object.assign(this, fields); }
}

/**
 * The provider's form encoding: nested objects and arrays as bracketed keys,
 * `line_items[0][price]=…`, `metadata[uid]=…`, `lookup_keys[0]=…`.
 * @param {object} obj
 */
function formEncode(obj, prefix = '', out = []){
  for(const [k, v] of Object.entries(obj || {})){
    if(v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if(Array.isArray(v)){
      v.forEach((x, i) => {
        if(x !== null && typeof x === 'object') formEncode(x, `${key}[${i}]`, out);
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(x))}`);
      });
    }else if(typeof v === 'object') formEncode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join('&');
}

/**
 * @param {object} o
 * @param {string} o.key                the secret or restricted key
 * @param {typeof fetch} [o.fetch]
 * @param {string} [o.base]             the API's address (a local fake in the end-to-end tests)
 * @param {number} [o.retries]          extra attempts after a network error or a retryable answer
 * @param {number} [o.timeoutMs]
 */
function makeStripe({ key, fetch: f = fetch, base = 'https://api.stripe.com', retries = 1, timeoutMs = 15000 }){
  const root = String(base).replace(/\/+$/, '');

  async function request(method, path, params, opts = {}){
    const headers = { authorization: `Bearer ${key}`, 'stripe-version': STRIPE_API_VERSION };
    let url = root + path;
    let body;
    if(method === 'GET'){
      const q = formEncode(params);
      if(q) url += '?' + q;
    }else{
      headers['content-type'] = 'application/x-www-form-urlencoded';
      headers['idempotency-key'] = (opts && opts.idempotencyKey) || crypto.randomUUID();
      body = formEncode(params);
    }
    let err = null;
    for(let attempt = 0; attempt <= retries; attempt++){
      let res;
      try{
        res = await f(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
      }catch(e){
        err = new StripeError(`could not reach the provider: ${e && e.message}`, { type: 'api_connection_error', code: 'network' });
        continue;
      }
      const text = await res.text();
      let j = null;
      try{ j = text ? JSON.parse(text) : null; }catch(e){ /* not JSON: kept as the message below */ }
      if(res.ok) return j;
      const e = (j && j.error) || {};
      err = new StripeError(e.message || `provider answered ${res.status}`, {
        statusCode: res.status, type: e.type, code: e.code, param: e.param, requestId: res.headers.get('request-id')
      });
      const should = res.headers.get('stripe-should-retry');
      const retryable = should === 'true' || (should !== 'false' && (res.status === 409 || res.status === 429 || res.status >= 500));
      if(!retryable) throw err;
    }
    throw err;
  }

  return {
    prices: {
      list: params => request('GET', '/v1/prices', params)
    },
    checkout: {
      sessions: {
        create: (params, opts) => request('POST', '/v1/checkout/sessions', params, opts),
        retrieve: id => request('GET', `/v1/checkout/sessions/${encodeURIComponent(id)}`),
        list: params => request('GET', '/v1/checkout/sessions', params)
      }
    },
    paymentIntents: {
      retrieve: id => request('GET', `/v1/payment_intents/${encodeURIComponent(id)}`)
    },
    charges: {
      retrieve: id => request('GET', `/v1/charges/${encodeURIComponent(id)}`)
    },
    refunds: {
      create: (params, opts) => request('POST', '/v1/refunds', params, opts)
    },
    webhooks: { verify: verifySignature }
  };
}

/** How old a signed delivery may be: the provider's own library defaults to five minutes. */
const TOLERANCE_S = 300;

/**
 * Checks a webhook delivery the way the provider's library does, and returns the
 * parsed event. The signature is an HMAC-SHA256 over `<t>.<the raw body bytes>`
 * with the endpoint's signing secret, sent as `Stripe-Signature: t=…,v1=…`.
 * The bytes are the ones received, untouched: parsing and re-serialising the
 * JSON first would change them and break the check.
 * @param {Uint8Array} raw
 * @param {string} header      the Stripe-Signature header
 * @param {string} secret
 * @param {{now?:() => number, tolerance?:number}} [o]
 */
async function verifySignature(raw, header, secret, { now = Date.now, tolerance = TOLERANCE_S } = {}){
  if(!secret) throw new StripeError('no signing secret is configured', { type: 'signature' });
  let t = null;
  const v1 = [];
  for(const part of String(header || '').split(',')){
    const i = part.indexOf('=');
    if(i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if(k === 't') t = v;
    else if(k === 'v1' && v) v1.push(v);
  }
  if(!t || !/^\d+$/.test(t) || !v1.length) throw new StripeError('malformed signature header', { type: 'signature' });
  const bytes = raw instanceof Uint8Array ? raw : utf8(String(raw));
  const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = toHex(await crypto.subtle.sign('HMAC', key, concat(utf8(t + '.'), bytes)));
  if(!v1.some(s => sameText(s, expected))) throw new StripeError('no signature matches the body', { type: 'signature' });
  if(tolerance > 0 && Math.floor(now() / 1000) - Number(t) > tolerance){
    throw new StripeError('the signed timestamp is too old', { type: 'signature' });
  }
  return JSON.parse(fromUtf8(bytes));
}

/** Compares in time that doesn't depend on where the first difference is. */
function sameText(a, b){
  if(typeof a !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for(let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

module.exports = { makeStripe, verifySignature, formEncode, StripeError, TOLERANCE_S };
