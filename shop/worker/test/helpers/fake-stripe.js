'use strict';
// A stand-in for the Stripe client: the same method surface the server uses,
// every call recorded, any call made to fail on demand. Webhook verification is
// the Worker's own (src/stripe.js); deliveries are signed below exactly as the
// provider signs them, with Node's crypto, independently of the code under test.
const crypto = require('node:crypto');
const { verifySignature } = require('../../src/stripe');

/**
 * @param {object} [o]
 * @param {Record<string, object>} [o.prices]   lookup key → price object
 */
function fakeStripe(o = {}){
  const calls = [];
  const sessions = new Map();          // id → session
  const intents = new Map();           // id → payment intent
  const chargeStore = new Map();       // id → charge (`charges` is the API below)
  const failures = new Map();          // method name → [Error, …] thrown on the next calls
  let n = 0;

  const prices = o.prices || {};
  const call = (name, args) => {
    calls.push({ name, args });
    const q = failures.get(name);
    if(q && q.length) throw q.shift();
  };

  const api = {
    calls, sessions, intents, chargeStore,
    webhooks: { verify: verifySignature },
    /** Make the next call(s) of `name` throw. */
    failNext(name, err = Object.assign(new Error(`fake ${name} failure`), { code: 'fake_failure' })){
      if(!failures.has(name)) failures.set(name, []);
      failures.get(name).push(err);
    },
    callsOf(name){ return calls.filter(c => c.name === name); },
    setPrice(lookupKey, price){ prices[lookupKey] = price; },

    prices: {
      async list(params){
        call('prices.list', [params]);
        const p = prices[params.lookup_keys[0]];
        return { object: 'list', data: p ? [p] : [] };
      }
    },
    checkout: {
      sessions: {
        async create(params, opts){
          call('checkout.sessions.create', [params, opts]);
          const id = `cs_test_fake${++n}`;
          const s = { id, object: 'checkout.session', url: `https://checkout.stripe.com/c/pay/${id}`, status: 'open',
                      payment_status: 'unpaid', mode: params.mode, client_reference_id: params.client_reference_id,
                      metadata: params.metadata, expires_at: params.expires_at, payment_intent: null };
          sessions.set(id, s);
          return s;
        },
        async retrieve(id){
          call('checkout.sessions.retrieve', [id]);
          const s = sessions.get(id);
          if(!s) throw Object.assign(new Error(`No such checkout.session: '${id}'`), { statusCode: 404, code: 'resource_missing' });
          return s;
        },
        async list(params){
          call('checkout.sessions.list', [params]);
          return { object: 'list', data: [...sessions.values()].filter(s => s.payment_intent === params.payment_intent) };
        }
      }
    },
    paymentIntents: {
      async retrieve(id){
        call('paymentIntents.retrieve', [id]);
        const pi = intents.get(id);
        if(!pi) throw Object.assign(new Error(`No such payment_intent: '${id}'`), { statusCode: 404, code: 'resource_missing' });
        return pi;
      }
    },
    charges: {
      async retrieve(id){
        call('charges.retrieve', [id]);
        const c = chargeStore.get(id);
        if(!c) throw Object.assign(new Error(`No such charge: '${id}'`), { statusCode: 404, code: 'resource_missing' });
        return c;
      }
    },
    refunds: {
      async create(params, opts){
        call('refunds.create', [params, opts]);
        return { id: 're_fake_' + String(opts && opts.idempotencyKey || ++n).replace(/[^a-z0-9_]/gi, '_'), object: 'refund', status: 'succeeded' };
      }
    }
  };
  return api;
}

/** The Stripe-Signature header the provider would send with these exact bytes. */
function signedBody(payload, secret, t = Math.floor(Date.now() / 1000)){
  const mac = crypto.createHmac('sha256', secret).update(`${t}.`).update(payload).digest('hex');
  return `t=${t},v1=${mac}`;
}

module.exports = { fakeStripe, signedBody };
