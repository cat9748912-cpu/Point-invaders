'use strict';
// The game in a real browser (Chromium, through Playwright) against everything
// it talks to, run on this machine: the Auth and Database emulators, the Worker
// in Cloudflare's local runtime (`wrangler dev`), and a stand-in for the payment
// provider. Nothing here reaches a real Firebase project or a real provider.
//
//  · THE SITE is this repository, served as it is on a local port, so the page
//    is the real index.html, app.js and style.css.
//  · FIREBASE: the page loads the same 9.23.0 SDK files as in production (fetched
//    once from gstatic with curl and kept in test/browser/.vendor, git-ignored).
//    An init script points the app's initializeApp() at the emulators: the
//    project becomes the emulator suite's demo project, nothing else changes.
//  · THE SERVER: requests to the Worker's real address are answered by the local
//    Worker; its return addresses follow the page's localhost origin (test mode).
//  · THE PROVIDER: the local Worker calls the stand-in for prices and sessions,
//    and a navigation to checkout.stripe.com lands on a one-line page. Paying is
//    the test sending the signed webhook the provider would send.
//  · Anything else the page asks for off this machine (fonts) is answered empty.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { DB_HOST, AUTH_HOST, PROJECT } = require('../helpers/emu');

const ROOT = path.join(__dirname, '..', '..', '..');
const WORKER_DIR = path.join(__dirname, '..', '..');
const VENDOR_DIR = path.join(__dirname, '.vendor');
const SDK = '9.23.0';
const SDK_FILES = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-database-compat.js'];
const SHOP_API = 'https://point-invaders-shop.pointinvaders.workers.dev';
/** The namespace the page's database lives in, under the emulator. */
const NS = `${PROJECT}-default-rtdb`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
                '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
                '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.md': 'text/plain; charset=utf-8' };

const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
async function freePort(){
  const s = http.createServer();
  const port = await listen(s);
  await new Promise(r => s.close(r));
  return port;
}

/** The SDK files the page loads, cached after the first download. */
function vendor(){
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  const out = {};
  for(const f of SDK_FILES){
    const file = path.join(VENDOR_DIR, `${SDK}-${f}`);
    if(!fs.existsSync(file) || fs.statSync(file).size < 10000){
      execFileSync('curl', ['-sS', '--fail', '-o', file, `https://www.gstatic.com/firebasejs/${SDK}/${f}`], { stdio: 'inherit' });
    }
    out[`https://www.gstatic.com/firebasejs/${SDK}/${f}`] = fs.readFileSync(file);
  }
  return out;
}

/** This repository's files over HTTP, the way GitHub Pages serves them (a query string is ignored). */
async function serveSite(root = ROOT){
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if(p.endsWith('/')) p += 'index.html';
    const file = path.join(root, path.normalize(p).replace(/^([/\\])+/, ''));
    if(!file.startsWith(root)){ res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if(err){ res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(buf);
    });
  });
  const port = await listen(server);
  return { server, base: `http://localhost:${port}`, close: () => new Promise(r => server.close(r)) };
}

/** The provider's API, played back on a local port: prices and sessions, nothing else. */
async function fakeProvider(){
  const seen = [];
  const sessions = new Map();
  let n = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://fake');
      const form = new URLSearchParams(body);
      seen.push({ method: req.method, path: url.pathname, form, headers: req.headers });
      const send = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if(req.method === 'GET' && url.pathname === '/v1/prices'){
        const key = url.searchParams.get('lookup_keys[0]');
        return send(200, { object: 'list', data: [{ id: 'price_' + key, object: 'price', lookup_key: key, active: true }] });
      }
      if(req.method === 'POST' && url.pathname === '/v1/checkout/sessions'){
        const id = `cs_test_browser${++n}`;
        const s = { id, object: 'checkout.session', url: `https://checkout.stripe.com/c/pay/${id}`, status: 'open',
                    expires_at: Number(form.get('expires_at')), client_reference_id: form.get('client_reference_id'),
                    metadata: { uid: form.get('metadata[uid]'), sku: form.get('metadata[sku]') },
                    success_url: form.get('success_url'), cancel_url: form.get('cancel_url') };
        sessions.set(id, s);
        return send(200, s);
      }
      const m = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(url.pathname);
      if(req.method === 'GET' && m && sessions.has(m[1])) return send(200, sessions.get(m[1]));
      return send(404, { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'not in the fake' } });
    });
  });
  const port = await listen(server);
  return { server, port, seen, sessions, close: () => new Promise(r => server.close(r)) };
}

/** `wrangler dev`, pointed at the emulators, the page's project and the fake provider; stopped as a process group. */
async function startWorker(providerPort){
  const port = await freePort();
  const vars = { FIREBASE_DATABASE_EMULATOR_HOST: DB_HOST, FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST, DATABASE_NS: NS,
                 PROJECT_ID: PROJECT, STRIPE_API_BASE: `http://127.0.0.1:${providerPort}` };
  const args = ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', '--show-interactive-dev-session=false',
                ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`])];
  const child = spawn('npx', args, { cwd: WORKER_DIR, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
                                     env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' } });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  const base = `http://127.0.0.1:${port}`;
  const until = Date.now() + 90_000;
  for(;;){
    try{ const r = await fetch(base + '/health'); if(r.status === 200) break; }catch(e){ /* not up yet */ }
    if(Date.now() > until) throw new Error('the Worker did not start:\n' + out.slice(-3000));
    await new Promise(r => setTimeout(r, 300));
  }
  const stop = () => { try{ process.kill(-child.pid, 'SIGKILL'); }catch(e){ /* gone */ } };
  return { base, output: () => out, stop };
}

/** The database rules this repository keeps (the Console's, plus the `shop` block), on the page's namespace. */
async function putRules(rules){
  const text = rules ? JSON.stringify(rules) : fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
  const r = await fetch(`http://${DB_HOST}/.settings/rules.json?ns=${NS}`, { method: 'PUT', body: text, headers: { Authorization: 'Bearer owner' } });
  if(!r.ok) throw new Error(`rules refused: ${r.status} ${await r.text()}`);
}
function repoRules(){ return JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')); }

/**
 * A fresh browser context on the site, with the page's outside world wired as above.
 * @returns {Promise<{ context, page, calls:Array, log:Array, checkouts:Array, scripts:Array }>}
 */
async function openGame(browser, { site, worker, vendorFiles, workerDown = false, path: p = '/', offline = false, storageState,
                                   viewport = { width: 1280, height: 900 }, mobile = false } = {}){
  const context = await browser.newContext({ serviceWorkers: 'block', viewport, storageState, isMobile: mobile, hasTouch: mobile });
  const calls = [], log = [], checkouts = [], scripts = [];
  // Every toast the page shows, in order (each replaces the last on screen).
  await context.addInitScript(() => {
    window.__toasts = [];
    document.addEventListener('DOMContentLoaded', () => {
      const el = document.getElementById('toast');
      if(!el) return;
      new MutationObserver(() => {
        const t = el.textContent;
        if(t && window.__toasts[window.__toasts.length - 1] !== t) window.__toasts.push(t);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  });
  // OFFLINE, the way a phone with no signal is: the browser says so, and nothing off the device answers.
  // (The site itself still loads — on a device that is the service worker's job; here it is localhost.)
  if(offline){
    await context.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false }); });
    await context.routeWebSocket(u => String(u).includes(DB_HOST), ws => ws.close());   // the database's socket too
  }
  await context.addInitScript(({ project, dbHost, authHost }) => {
    let real;
    Object.defineProperty(window, 'firebase', {
      configurable: true,
      get(){ return real; },
      set(v){
        real = v;
        if(!v || !v.initializeApp || v.__emu) return;
        v.__emu = true;
        const init = v.initializeApp.bind(v);
        v.initializeApp = (cfg, name) => {
          const app = init({ ...cfg, projectId: project, databaseURL: `https://${project}-default-rtdb.firebaseio.com` }, name);
          v.auth().useEmulator(`http://${authHost}`, { disableWarnings: true });
          const [h, port] = dbHost.split(':');
          v.database().useEmulator(h, Number(port));
          return app;
        };
      }
    });
  }, { project: PROJECT, dbHost: DB_HOST, authHost: AUTH_HOST });
  await context.route('**/*', async route => {
    const req = route.request(), url = req.url();
    if(url.startsWith(site + '/') || url === site) return route.continue();
    if(url.startsWith(`http://${AUTH_HOST}/`) || url.startsWith(`http://${DB_HOST}/`)){         // the emulators
      return offline ? route.abort('internetdisconnected') : route.continue();
    }
    if(vendorFiles[url]) return route.fulfill({ status: 200, contentType: 'text/javascript', body: vendorFiles[url] });
    if(url.startsWith(SHOP_API + '/')){
      calls.push({ method: req.method(), url, headers: req.headers(), body: req.postData() });
      if(workerDown || offline) return route.abort('connectionrefused');
      const headers0 = Object.fromEntries(Object.entries(req.headers()).filter(([k]) => !/^(host|connection|content-length|:)/i.test(k)));
      const r = await fetch(worker.base + url.slice(SHOP_API.length), { method: req.method(), headers: headers0, body: req.postData() || undefined });
      const headers = {};
      r.headers.forEach((v, k) => { headers[k] = v; });
      return route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
    }
    if(/^https:\/\/checkout\.stripe\.com\//.test(url)){
      checkouts.push(url);
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Fake checkout</title><h1 id="fake-checkout">FAKE CHECKOUT</h1>' });
    }
    if(/fonts\.(googleapis|gstatic)\.com/.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    log.push('blocked ' + url);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('console', m => { if(m.type() === 'error' || m.type() === 'warning') log.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => log.push('[pageerror] ' + (e && e.stack || e)));
  page.on('request', r => { if(r.resourceType() === 'script') scripts.push(r.url()); });
  await page.goto(site + p);
  return { context, page, calls, log, checkouts, scripts };
}

module.exports = { ROOT, NS, SHOP_API, freePort, vendor, serveSite, fakeProvider, startWorker, putRules, repoRules, openGame };
