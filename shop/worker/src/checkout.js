'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🛒 POST /checkout — a verified player, a known SKU, a hosted page
// ══════════════════════════════════════════════════════════════════════
// The browser sends `{ sku }` and its Firebase ID token, nothing else. The uid
// comes from the verified token and the price from the provider, by lookup key.
// The answer is `{ url }`, which the game opens with location.assign(): card
// details are only ever typed on the provider's page, never on ours.
//
// In order, each refusal before anything that costs money or a session:
//   CORS · method · kill switch · token · not a guest · known SKU · not owned ·
//   an open session to hand back · rate limit · price · new session.
const catalog = require('./catalog');
const { json, empty, cors } = require('./http');
const { buildSessionParams } = require('./session');
const { REUSE_MIN_MS, returnSite } = require('./config');

/** The provider's own words for a refusal, for the log: the reason a person can act on. An address it might
 *  quote back is taken out, as the log never holds one. */
const said = e => (e && e.message) ? String(e.message).replace(/[^\s@"'<>]+@[^\s@"'<>]+/g, '[email]').slice(0, 300) : undefined;

/** The body is `{"sku":"…"}`; anything much bigger isn't a real request. */
const MAX_BODY = 2048;

/**
 * @param {Request} request
 * @param {object} deps  { verifier, stripe, ledger, cfg:{live, managed, site}, log, now }
 * @returns {Promise<Response>}
 */
async function handleCheckout(request, deps){
  const { verifier, stripe, ledger, cfg, log, now } = deps;

  const c = cors(request, cfg.live);
  const reply = (status, body, extra) => json(status, body, { ...c.headers, ...(extra || {}) });
  if(!c.ok) return reply(403, { error: 'origin' });
  if(request.method === 'OPTIONS') return empty(204, c.headers);
  if(request.method !== 'POST') return reply(405, { error: 'method' });

  if(!(await ledger.shopOpen())) return reply(503, { error: 'closed' });

  // ── Who is asking ──
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
  if(!m) return reply(401, { error: 'auth' });
  let tok;
  try{
    tok = await verifier.verify(m[1]);
  }catch(e){
    log.info('checkout: token refused', { code: e && e.code });
    return reply(401, { error: 'auth' });
  }
  // A guest's record is deleted when their connection ends (§ 33 of app.js), so a
  // guest must save their account (same uid) before anything can be sold to it.
  const provider = tok.firebase && tok.firebase.sign_in_provider;
  if(!provider || provider === 'anonymous') return reply(403, { error: 'guest' });
  const uid = tok.uid;

  // ── What they want ──
  const body = await readBody(request);
  const item = catalog.find(body.sku);
  if(!item) return reply(400, { error: 'bad_sku' });

  if(await ledger.isOwned(uid, item.sku)) return reply(409, { error: 'owned' });

  // ── A session already open for this SKU is handed back, not duplicated ──
  // Two tabs, a double tap, or a lost response all land here instead of
  // producing a second session the player could pay as well.
  const open = await ledger.readOpen(uid, item.sku);
  if(open && open.id && (+open.exp || 0) * 1000 > now() + REUSE_MIN_MS){
    try{
      const s = await stripe.checkout.sessions.retrieve(open.id);
      if(s && s.status === 'open' && s.url) return reply(200, { url: s.url, id: s.id, reused: true });
      // Paid, and the webhook has not landed yet: selling it again would charge twice.
      if(s && s.status === 'complete' && s.payment_status === 'paid') return reply(409, { error: 'owned_pending' });
    }catch(e){
      log.warn('checkout: open session unreadable, starting a new one', { sid: open.id, code: e && e.code });
    }
  }

  const rl = await ledger.rateLimit(uid);
  if(!rl.ok) return reply(429, { error: 'slow', retryAfter: rl.retryAfter }, { 'retry-after': String(rl.retryAfter) });

  let price;
  try{
    const list = await stripe.prices.list({ lookup_keys: [item.lookupKey], active: true, limit: 1 });
    price = list && list.data && list.data[0];
  }catch(e){
    log.error('checkout: price lookup failed', { sku: item.sku, code: e && e.code, status: e && e.statusCode, message: said(e) });
    return reply(502, { error: 'provider' });
  }
  if(!price){
    // The products were not seeded in this mode (scripts/seed-products.js).
    log.error('checkout: no active price for lookup key', { sku: item.sku, live: cfg.live });
    return reply(503, { error: 'unpriced' });
  }

  const params = buildSessionParams({
    item, price, uid,
    email: tok.email || null,
    emailVerified: tok.email_verified === true,
    site: returnSite(c.origin, cfg.live, cfg.site),
    managed: !!cfg.managed,
    now: now()
  });
  let session;
  try{
    session = await stripe.checkout.sessions.create(params);
  }catch(e){
    log.error('checkout: session refused by provider', { sku: item.sku, code: e && e.code, type: e && e.type, param: e && e.param,
                                                         message: said(e) });
    return reply(502, { error: 'provider' });
  }
  await ledger.setOpen(uid, item.sku, { id: session.id, exp: session.expires_at || params.expires_at });
  log.info('checkout: session created', { uid, sku: item.sku, sid: session.id, reused: false });
  return reply(200, { url: session.url, id: session.id });
}

/** `{ sku }` from a small JSON body; anything unreadable is an empty object. */
async function readBody(request){
  try{
    const text = await request.text();
    if(!text || text.length > MAX_BODY) return {};
    const b = JSON.parse(text);
    return (b && typeof b === 'object' && !Array.isArray(b)) ? b : {};
  }catch(e){
    return {};
  }
}

module.exports = { handleCheckout };
