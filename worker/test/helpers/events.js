'use strict';
// Provider event payloads shaped like the real ones (API version 2026-09-30.endive),
// trimmed to the fields the server reads.
const crypto = require('node:crypto');
const { CATALOG_VERSION } = require('../../src/catalog');

const rid = p => p + crypto.randomBytes(9).toString('hex');

function event(type, object, { livemode = false, id } = {}){
  return { id: id || rid('evt_test_'), object: 'event', api_version: '2026-09-30.endive', type, livemode,
           created: Math.floor(Date.now() / 1000), data: { object } };
}

/** A checkout session the server created: our metadata, our uid. */
function session({ uid, sku, sid = rid('cs_test_'), pi = rid('pi_test_'), paid = true, amount = 199, currency = 'usd',
                   livemode = false, v = CATALOG_VERSION, mode = 'payment' }){
  return { id: sid, object: 'checkout.session', mode, status: 'complete', payment_status: paid ? 'paid' : 'unpaid',
           client_reference_id: uid, metadata: { uid, sku, v }, payment_intent: pi, amount_total: amount, currency,
           livemode, created: Math.floor(Date.now() / 1000) };
}

const completed = (s, o) => event('checkout.session.completed', s, o);
const asyncSucceeded = (s, o) => event('checkout.session.async_payment_succeeded', { ...s, payment_status: 'paid' }, o);
const asyncFailed = (s, o) => event('checkout.session.async_payment_failed', { ...s, payment_status: 'unpaid' }, o);
const expired = (s, o) => event('checkout.session.expired', { ...s, status: 'expired', payment_status: 'unpaid' }, o);

function refunded({ pi, full = true, amount = 199, charge = rid('ch_test_') }, o){
  return event('charge.refunded', { id: charge, object: 'charge', payment_intent: pi, refunded: full,
                                    amount, amount_refunded: full ? amount : Math.floor(amount / 2) }, o);
}
function disputeCreated({ pi, charge = rid('ch_test_'), dispute = rid('dp_test_'), withPI = true }, o){
  return event('charge.dispute.created', { id: dispute, object: 'dispute', charge, payment_intent: withPI ? pi : null,
                                           status: 'needs_response' }, o);
}
function disputeClosed({ pi, status, charge = rid('ch_test_'), dispute = rid('dp_test_') }, o){
  return event('charge.dispute.closed', { id: dispute, object: 'dispute', charge, payment_intent: pi, status }, o);
}

module.exports = { rid, event, session, completed, asyncSucceeded, asyncFailed, expired, refunded, disputeCreated, disputeClosed };
