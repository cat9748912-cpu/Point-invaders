#!/usr/bin/env node
'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🔔 CREATE THE WEBHOOK ENDPOINT — exactly the events the code handles
// ══════════════════════════════════════════════════════════════════════
// Registers <Worker URL>/webhook with the provider, subscribed to the seven
// events worker/src/webhook.js handles, on the API version the code was
// written against (worker/src/config.js), so the payloads match.
//
// The endpoint's signing secret is shown only once, when it is created. With
// --apply this prints that secret ALONE on stdout, with no newline, so it can
// go straight into the Worker's secrets without ever appearing on screen. From
// the worker/ folder, with a key that may create webhook endpoints set as
// STRIPE_SECRET_KEY:
//
//   node ../scripts/create-webhook-endpoint.js https://…workers.dev/webhook            # DRY RUN: says what it would do
//   node ../scripts/create-webhook-endpoint.js https://…workers.dev/webhook --apply | npx wrangler secret put STRIPE_WEBHOOK_SECRET
//
// Everything else goes to stderr. A live key needs --live. If an endpoint for
// the URL already exists its secret cannot be read back: roll it in the
// Dashboard, or pass --replace to delete it and create a new one.
const path = require('node:path');

const WORKER = path.join(__dirname, '..', 'worker');
const { HANDLED } = require(path.join(WORKER, 'src', 'webhook.js'));
const { STRIPE_API_VERSION } = require(path.join(WORKER, 'src', 'config.js'));
const { modeOf } = require('./seed-products');

const EVENTS = Object.freeze([...HANDLED]);

/**
 * @param {string[]} argv
 * @param {object} env
 * @param {{out:(s:string)=>void, err:(s:string)=>void}} io
 * @param {object} [stripeClient]  injected by the tests
 */
async function main(argv = process.argv.slice(2), env = process.env,
                    io = { out: s => process.stdout.write(s), err: s => process.stderr.write(s + '\n') }, stripeClient){
  const url = argv.find(a => !a.startsWith('--'));
  const doApply = argv.includes('--apply'), wantLive = argv.includes('--live'), replace = argv.includes('--replace');
  if(!url || !/^https:\/\/[^/\s]+\/.*webhook$/.test(url)){
    io.err('Give the Worker\'s webhook URL, e.g. https://point-invaders-shop.<your-subdomain>.workers.dev/webhook');
    return 2;
  }
  const key = env.STRIPE_SECRET_KEY || '';
  const mode = modeOf(key);
  if(!mode){ io.err('STRIPE_SECRET_KEY is missing or is not a Stripe secret/restricted key.'); return 2; }
  if(mode === 'live' && !wantLive){ io.err('Refusing: that is a LIVE key. Add --live if you mean it.'); return 2; }
  if(mode === 'test' && wantLive){ io.err('Refusing: --live given with a TEST key.'); return 2; }

  let stripe = stripeClient;
  if(!stripe){
    const Stripe = require(require.resolve('stripe', { paths: [WORKER] }));
    stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2 });
  }

  const existing = [];
  for await (const ep of stripe.webhookEndpoints.list({ limit: 100 })) if(ep.url === url) existing.push(ep);

  io.err(`Mode: ${mode.toUpperCase()}   ${doApply ? 'APPLYING' : 'DRY RUN (add --apply to create it)'}`);
  io.err(`URL: ${url}`);
  io.err(`API version: ${STRIPE_API_VERSION}`);
  io.err(`Events (${EVENTS.length}): ${EVENTS.join(', ')}`);
  if(existing.length && !replace){
    io.err(`An endpoint for this URL already exists (${existing.map(e => e.id).join(', ')}). Its signing secret cannot be ` +
           `read again: roll it in the Dashboard (Webhooks → the endpoint → Roll secret) and set it with ` +
           `npx wrangler secret put STRIPE_WEBHOOK_SECRET, or re-run with --replace to delete it and create a new one.`);
    return 2;
  }
  if(!doApply){
    if(existing.length) io.err(`With --replace, ${existing.length} existing endpoint(s) would be deleted first.`);
    return 0;
  }
  for(const ep of existing){
    await stripe.webhookEndpoints.del(ep.id);
    io.err(`Deleted the old endpoint ${ep.id}.`);
  }
  const ep = await stripe.webhookEndpoints.create({
    url, api_version: STRIPE_API_VERSION, enabled_events: [...EVENTS],
    description: 'Point Invaders: the shop function (checkout and entitlements)', metadata: { pi: 'shop' }
  });
  io.err(`Created ${ep.id} (${ep.livemode ? 'live' : 'test'}). Its signing secret was written to stdout.`);
  io.out(String(ep.secret));          // no newline: it would become part of the secret
  return 0;
}

if(require.main === module){
  main().then(code => { process.exitCode = code; }, e => { process.stderr.write(String(e && e.message || e) + '\n'); process.exitCode = 1; });
}

module.exports = { main, EVENTS };
