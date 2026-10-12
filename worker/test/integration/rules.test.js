'use strict';
// The real rules file (the owner's Console rules + the `shop` block), loaded into
// the Database emulator. Clients may read their own entitlements and the public
// badge and switch, and may write nothing under `shop`. The existing rules are
// exercised too, so the facts the design relies on are proven, not assumed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SKIP } = require('../helpers/emu');

const RULES_FILE = path.join(__dirname, '..', '..', '..', 'database.rules.json');

let RUT;
try{ RUT = require('@firebase/rules-unit-testing'); }catch(e){ RUT = null; }

const host = () => process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(':');
async function env(projectId, rules){
  const [h, p] = host();
  return RUT.initializeTestEnvironment({ projectId, database: { rules, host: h, port: +p } });
}

test('database rules', { skip: SKIP || (!RUT && 'needs @firebase/rules-unit-testing') }, async t => {
  const { assertFails, assertSucceeds } = RUT;
  const rules = fs.readFileSync(RULES_FILE, 'utf8');
  const te = await env('demo-pi-rules', rules);
  t.after(async () => { await te.cleanup(); });

  const alice = () => te.authenticatedContext('alice').database();
  const bob = () => te.authenticatedContext('bob').database();
  const anon = () => te.unauthenticatedContext().database();
  const seed = async (p, v) => te.withSecurityRulesDisabled(async ctx => { await ctx.database().ref(p).set(v); });

  t.beforeEach(async () => {
    await te.clearDatabase();
    await seed('shop', {
      cfg: { open: true },
      badge: { alice: 1700000000000 },
      ent: { alice: { col_aurora: { s: 'active', ord: { cs_1: 'paid' } } }, bob: { pass_supporter: { s: 'active' } } },
      orders: { alice: { cs_1: { sku: 'col_aurora', s: 'paid' } }, bob: { cs_2: { sku: 'pass_supporter', s: 'paid' } } },
      events: { evt_1: { st: 'done' } },
      pi: { pi_1: { uid: 'alice', sku: 'col_aurora', sid: 'cs_1' } },
      rl: { alice: { at: 1 } }
    });
    await seed('players/alice', { username: 'alice', totalPoints: 100, credits: 5, weekly: { season: '2026-W41', pts: 3 } });
  });

  // ── shop: nobody but the server writes ──
  await t.test('a player cannot write their OWN entitlement, order or badge', async () => {
    await assertFails(alice().ref('shop/ent/alice/col_ultra').set({ s: 'active' }));
    await assertFails(alice().ref('shop/ent/alice/col_aurora/s').set('active'));
    await assertFails(alice().ref('shop/ent/alice').remove());
    await assertFails(alice().ref('shop/orders/alice/cs_9').set({ sku: 'col_ultra', s: 'paid' }));
    await assertFails(alice().ref('shop/badge/alice').set(Date.now()));
    await assertFails(alice().ref('shop/badge/alice').remove());
  });

  await t.test("a player cannot write someone else's either, and a signed-out client nothing at all", async () => {
    await assertFails(alice().ref('shop/ent/bob/col_ultra').set({ s: 'active' }));
    await assertFails(alice().ref('shop/badge/bob').set(1));
    await assertFails(anon().ref('shop/ent/alice/col_ultra').set({ s: 'active' }));
    await assertFails(anon().ref('shop/badge/x').set(1));
  });

  await t.test('no client can write the switch, the event log, the index or the rate limit', async () => {
    for(const p of ['shop/cfg/open', 'shop/events/evt_9', 'shop/pi/pi_9', 'shop/rl/alice/at', 'shop/rl/alice/o/col_ultra']){
      await assertFails(alice().ref(p).set(false));
    }
    await assertFails(alice().ref('shop').update({ 'ent/alice/col_ultra': { s: 'active' } }));
    await assertFails(alice().ref('shop').set(null));
  });

  await t.test('a player can read their own entitlements and orders, and no one else\'s', async () => {
    await assertSucceeds(alice().ref('shop/ent/alice').once('value'));
    await assertSucceeds(alice().ref('shop/ent/alice/col_aurora').once('value'));
    await assertSucceeds(alice().ref('shop/orders/alice').once('value'));
    await assertFails(alice().ref('shop/ent/bob').once('value'));
    await assertFails(alice().ref('shop/orders/bob').once('value'));
    await assertFails(alice().ref('shop/ent').once('value'));
    await assertFails(anon().ref('shop/ent/alice').once('value'));
    const v = (await alice().ref('shop/ent/alice/col_aurora/s').once('value')).val();
    assert.equal(v, 'active');
  });

  await t.test('the badge and the switch are public reads; the server-only nodes are not readable at all', async () => {
    await assertSucceeds(anon().ref('shop/badge').once('value'));
    await assertSucceeds(bob().ref('shop/badge/alice').once('value'));
    await assertSucceeds(anon().ref('shop/cfg/open').once('value'));
    for(const p of ['shop', 'shop/events', 'shop/events/evt_1', 'shop/pi', 'shop/pi/pi_1', 'shop/rl/alice']){
      await assertFails(alice().ref(p).once('value'));
    }
  });

  // ── The existing rules, as the design relies on them (TESTING.md B29–B32, U2) ──
  await t.test('B29: a top-level node the rules do not name is refused', async () => {
    await assertFails(alice().ref('shop2/x').set(1));
    await assertFails(alice().ref('payments/alice').set({ ok: true }));
  });

  await t.test('B30: weekly is exactly {season, pts}, and one refused key fails the whole update()', async () => {
    await assertSucceeds(alice().ref('players/alice/weekly').set({ season: '2026-W41', pts: 9 }));
    await assertFails(alice().ref('players/alice/weekly').set({ season: '2026-W41', pts: 9, tiers: 1 }));
    await assertFails(alice().ref('players/alice').update({ credits: 6, 'weekly/tiers': 1 }));
    const credits = (await te.authenticatedContext('alice').database().ref('players/alice/credits').once('value')).val();
    assert.equal(credits, 5, 'the credits write in the refused update did not land');
  });

  await t.test('B31: a totalPoints rise needs lastScoreAt === now, and a second one inside 2.5 s is refused', async () => {
    const SV = { '.sv': 'timestamp' };
    await assertFails(alice().ref('players/alice').update({ totalPoints: 150 }));
    await assertSucceeds(alice().ref('players/alice').update({ totalPoints: 150, lastScoreAt: SV }));
    await assertFails(alice().ref('players/alice').update({ totalPoints: 160, lastScoreAt: SV }));
    await assertSucceeds(alice().ref('players/alice').update({ totalPoints: 140 }), 'a fall needs no stamp (PTS → CR)');
  });

  await t.test('B32: the owner writes anywhere under players/<uid>, which is why nothing paid lives there', async () => {
    await assertSucceeds(alice().ref('players/alice/ent/col_aurora').set({ s: 'active' }));
    await assertSucceeds(alice().ref('players/alice/owned/colors').set(['col-x-aurora']));
    await assertFails(alice().ref('players/bob/ent/col_aurora').set({ s: 'active' }));
  });

  await t.test('B32 (cascade): a child .write:false cannot take back a parent\'s grant', async () => {
    const r = JSON.parse(rules);
    r.rules.players.$uid.locked = { '.write': false };
    const te2 = await env('demo-pi-rules-cascade', JSON.stringify(r));
    try{
      await te2.withSecurityRulesDisabled(async ctx => {
        await ctx.database().ref('players/alice').set({ username: 'alice', totalPoints: 1 });
      });
      await assertSucceeds(te2.authenticatedContext('alice').database().ref('players/alice/locked').set(true));
    }finally{ await te2.cleanup(); }
  });

  await t.test('U2: the stats rule takes the purchase funnel keys (+1 only, lower case only)', async () => {
    const day = '2026-10-12';
    const inc = { '.sv': { increment: 1 } };
    for(const k of ['_buy_open', '_buy_start', '_buy_ok', '_buy_cancel']){
      await assertSucceeds(alice().ref(`stats/d/${day}/${k}`).set(inc));
    }
    await assertFails(alice().ref(`stats/d/${day}/_buy_open`).set(99));
    await assertFails(alice().ref(`stats/d/${day}/_Buy_open`).set(inc));
    await assertFails(anon().ref(`stats/d/${day}/_buy_open`).set(inc));
  });

  await t.test('the players board is still a public read (and the badge matches it)', async () => {
    await assertSucceeds(anon().ref('players').once('value'));
  });
});
