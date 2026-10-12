'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🌐 HTTP — answers, CORS and the two routes
// ══════════════════════════════════════════════════════════════════════
// The Workers runtime speaks the web's own Request and Response, so these are
// plain functions over them.
const { originAllowed } = require('./config');

/** Every answer is JSON and never cached: a checkout URL or an error must not be replayed. */
function json(status, body, headers){
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(headers || {}) }
  });
}

/** An answer with no body (the CORS preflight). */
function empty(status, headers){
  return new Response(null, { status, headers: { 'cache-control': 'no-store', ...(headers || {}) } });
}

/**
 * CORS for /checkout. The allow-list is the real control, not the
 * Authorization header alone: a disallowed browser origin gets 403 before
 * anything else is looked at. A request with no Origin header (curl, a server)
 * is not a browser and is judged on its token like any other.
 * @param {Request} request
 * @param {boolean} live
 * @returns {{ok:boolean, origin:?string, headers:Record<string,string>}}  headers go on EVERY answer,
 *   errors included, or the browser can't read why it was refused.
 */
function cors(request, live){
  const origin = request.headers.get('origin') || null;
  const headers = { vary: 'Origin' };
  if(!origin) return { ok: true, origin: null, headers };
  if(!originAllowed(origin, live)) return { ok: false, origin, headers };
  headers['access-control-allow-origin'] = origin;
  headers['access-control-allow-methods'] = 'POST, OPTIONS';
  headers['access-control-allow-headers'] = 'Authorization, Content-Type';
  headers['access-control-max-age'] = '600';
  return { ok: true, origin, headers };
}

/** The last path segment: `/checkout` and `/checkout/` name the same route. */
function routeOf(request){
  const seg = new URL(request.url).pathname.split('/').filter(Boolean);
  return seg.length ? seg[seg.length - 1] : '';
}

module.exports = { json, empty, cors, routeOf };
