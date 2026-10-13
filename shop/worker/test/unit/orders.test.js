'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EV, next, isActive, applyToNode } = require('../../src/orders');

test('next(): the documented transitions', () => {
  assert.equal(next(null, EV.PAID), 'paid');
  assert.equal(next(null, EV.PENDING), 'pending');
  assert.equal(next('pending', EV.PAID), 'paid');
  assert.equal(next('pending', EV.FAILED), 'failed');
  assert.equal(next('paid', EV.DISPUTE), 'disputed');
  assert.equal(next('disputed', EV.WON), 'paid');
  assert.equal(next('disputed', EV.LOST), 'lost');
  assert.equal(next('paid', EV.REFUND), 'refunded');
  assert.equal(next('disputed', EV.REFUND), 'refunded');
  assert.equal(next(null, EV.REFUND), 'refunded');      // a refund seen before the completion
  assert.equal(next(null, EV.DISPUTE), 'disputed');     // a dispute seen before the completion
  assert.equal(next('paid', EV.LOST), 'lost');          // a lost dispute whose opening was missed
});

test('next(): terminal states never move, whatever arrives', () => {
  for(const t of ['refunded', 'lost']){
    for(const ev of Object.values(EV)) assert.equal(next(t, ev), t, `${t} + ${ev}`);
  }
});

test('next(): a completion only ever moves an order out of nothing or pending', () => {
  for(const s of ['paid', 'failed', 'disputed', 'refunded', 'lost']) assert.equal(next(s, EV.PAID), s, s);
  // ...so a late or replayed completion cannot revive a refunded or disputed order
  assert.equal(next('refunded', EV.PAID), 'refunded');
  assert.equal(next('disputed', EV.PAID), 'disputed');
});

test('next(): a won dispute only restores a disputed order', () => {
  assert.equal(next(null, EV.WON), null);
  assert.equal(next('paid', EV.WON), 'paid');
  assert.equal(next('pending', EV.WON), 'pending');
});

test('isActive(): any paid order', () => {
  assert.equal(isActive(null), false);
  assert.equal(isActive({}), false);
  assert.equal(isActive({ a: 'refunded', b: 'disputed' }), false);
  assert.equal(isActive({ a: 'refunded', b: 'paid' }), true);
});

test('applyToNode(): first grant', () => {
  const r = applyToNode(null, 'cs_1', EV.PAID, 1000, { amount: 199, currency: 'usd', lm: false });
  assert.equal(r.before, null);
  assert.equal(r.after, 'paid');
  assert.equal(r.dup, false);
  assert.deepEqual(r.node, { ord: { cs_1: 'paid' }, s: 'active', u: 1000, o: 'cs_1', at: 1000, p: 199, c: 'usd', lm: false });
});

test('applyToNode(): no change → node null (the transaction is not written)', () => {
  const cur = { ord: { cs_1: 'paid' }, s: 'active', u: 1, o: 'cs_1', at: 1 };
  const r = applyToNode(cur, 'cs_1', EV.PAID, 2000);
  assert.equal(r.node, null);
  assert.equal(r.after, 'paid');
});

test('applyToNode(): refund revokes and keeps the history', () => {
  const cur = { ord: { cs_1: 'paid' }, s: 'active', u: 1, o: 'cs_1', at: 1, p: 199, c: 'usd', lm: false };
  const r = applyToNode(cur, 'cs_1', EV.REFUND, 5);
  assert.equal(r.node.s, 'revoked');
  assert.deepEqual(r.node.ord, { cs_1: 'refunded' });
  assert.equal(r.node.at, 1, 'the last run of ownership began at 1');
});

test('applyToNode(): a second paid order of the same SKU is a duplicate, remembered in the node', () => {
  const cur = { ord: { cs_1: 'paid' }, s: 'active', u: 1, o: 'cs_1', at: 1 };
  const r = applyToNode(cur, 'cs_2', EV.PAID, 9, { amount: 199, currency: 'usd' });
  assert.equal(r.dup, true);
  assert.deepEqual(r.node.dups, { cs_2: 1 });
  assert.equal(r.node.s, 'active');
  assert.equal(r.node.at, 1, 'still owned since the first purchase');
});

test('applyToNode(): a won dispute is not a duplicate, and refunded-then-rebought restarts "since"', () => {
  const disputed = { ord: { cs_1: 'disputed', cs_2: 'paid' }, s: 'active', at: 50 };
  assert.equal(applyToNode(disputed, 'cs_1', EV.WON, 60).dup, false);
  const gone = { ord: { cs_1: 'refunded' }, s: 'revoked', at: 1 };
  const again = applyToNode(gone, 'cs_9', EV.PAID, 777, { amount: 499, currency: 'usd' });
  assert.equal(again.node.s, 'active');
  assert.equal(again.node.at, 777);
});

test('applyToNode(): a dispute while another order is paid keeps the item', () => {
  const cur = { ord: { cs_1: 'paid', cs_2: 'paid' }, s: 'active', at: 1, dups: { cs_2: 1 } };
  const r = applyToNode(cur, 'cs_1', EV.DISPUTE, 3);
  assert.equal(r.node.s, 'active');
});
