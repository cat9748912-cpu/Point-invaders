'use strict';
// The game's half of the Restricted aisle (app.js § 46), played in Chromium
// against the emulators, the Worker in workerd and a stand-in provider (see
// harness.js). Each case drives the page the way a player would — the buttons,
// the sheet, the provider's redirect — and checks what the page shows and what
// the database holds. Paying is the signed webhook the provider would send.
//
//   npm run test:browser      (needs Playwright's Chromium; see TESTING.md)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { SKIP, DB_HOST, dbFor } = require('../helpers/emu');
const { signedBody } = require('../helpers/fake-stripe');
const E = require('../helpers/events');
const { E2E } = require('../e2e/secrets');
const H = require('./harness');

let chromium = null;
try{ ({ chromium } = require('playwright')); }catch(e){ chromium = null; }
const skip = SKIP || (chromium ? false : 'needs the playwright package and its Chromium');

// ── Page helpers ─────────────────────────────────────────────────────────
// SHOP_SHOTS=<dir> keeps a screenshot of each state worth looking at.
const shot = (page, name) => process.env.SHOP_SHOTS
  ? page.screenshot({ path: path.join(process.env.SHOP_SHOTS, name + '.png') }).catch(() => {}) : null;
const toasts = page => page.evaluate(() => window.__toasts.slice());
const waitToast = (page, re, timeout = 15000) =>
  page.waitForFunction(src => window.__toasts.some(t => new RegExp(src).test(t)), re.source, { timeout });
const cyan = page => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim().toLowerCase());

/** ARC's tour starts a second after a new profile's first hub, and an event can open a teaser: put both away. */
async function settle(page, tourWait = 3500){
  try{ await page.waitForSelector('#tut-layer.on', { timeout: tourWait }); await page.click('#tut-skip'); }catch(e){ /* no tour */ }
  await page.evaluate(() => document.querySelectorAll('.fb-overlay.show').forEach(o => closeOverlay(o.id)));
  await page.waitForTimeout(250);
}
/** Back to the hub from wherever a failed case left the page. */
async function home(page){
  await page.evaluate(() => {
    document.querySelectorAll('.fb-overlay.show').forEach(o => closeOverlay(o.id));
    if(!document.querySelector('#hub-screen.active')){ try{ stopGame(); setControls(null); }catch(e){} enterHub(); }
  }).catch(() => {});
  await page.waitForTimeout(300);
}
async function signUp(page, name){
  await page.click('#tab-signup');
  await page.fill('#s-name', name);
  await page.fill('#s-email', `${name.toLowerCase()}${Date.now()}@example.com`);
  await page.fill('#s-pass', 'secret123');
  await page.click('#btn-signup');
  await page.waitForSelector('#hub-screen.active', { timeout: 20000 });
  await settle(page);
  return page.evaluate(() => user.uid);
}
async function openAisle(page){
  if(!(await page.isVisible('#market-screen.active'))){
    await page.click('#btn-market');
    await page.waitForSelector('#market-screen.active');
  }
  await page.click('#market-tab-restricted');
  await page.waitForSelector('#panel-restricted.active');
}
const aisleCard = (page, name) => page.locator('#shop-restricted .shop-card').filter({ has: page.locator('.shop-name', { hasText: new RegExp('^' + name + '$') }) });
const cardButton = (page, name) => aisleCard(page, name).locator('.sku-btn');

/** What the market draws, for comparing two builds: the visible tabs where they sit, and every card's text. */
function marketShape(page){
  return page.evaluate(() => {
    const vis = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const tabs = [...document.querySelectorAll('#market-screen .market-tab')].filter(vis).map(t => {
      const r = t.getBoundingClientRect();
      return [t.textContent.trim(), Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    });
    const shelves = {};
    document.querySelectorAll('#market-screen .shop-grid').forEach(g => {
      const cards = [...g.querySelectorAll('.shop-card')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
      if(cards.length) shelves[g.id] = cards;            // the aisle's grid exists, empty, with the flag off
    });
    return { tabs, shelves };
  });
}

test('the Restricted aisle in the browser', { skip, concurrency: false, timeout: 900_000 }, async t => {
  const vendorFiles = H.vendor();
  const site = await H.serveSite();
  const provider = await H.fakeProvider();
  const worker = await H.startWorker(provider.port);
  const A = dbFor(H.NS);
  await A.clear();
  await H.putRules();
  const browser = await chromium.launch();
  const open = (opts = {}) => H.openGame(browser, { site: site.base, worker, vendorFiles, ...opts });
  const pages = [];
  t.after(async () => {
    await browser.close().catch(() => {});
    worker.stop(); await provider.close(); await site.close();
  });
  const deliver = async event => {
    const payload = JSON.stringify(event);
    const r = await fetch(worker.base + '/webhook', { method: 'POST', body: payload,
      headers: { 'content-type': 'application/json', 'stripe-signature': signedBody(payload, E2E.STRIPE_WEBHOOK_SECRET) } });
    return { status: r.status, body: await r.json() };
  };
  /** The provider saying "paid" for a session the server made, or for one made up here. */
  const pay = async (uid, sku, amount, sid) => {
    const s = E.session({ uid, sku, amount, ...(sid ? { sid } : {}) });
    const r = await deliver(E.completed(s));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return s;
  };
  const stat = async key => {
    const day = new Date().toISOString().slice(0, 10);
    return (await A.db.get(`stats/d/${day}/${key}`)) || 0;
  };

  // The buyer for most of what follows: a saved account (email and password).
  let buyer = null;

  await t.test('flag off: the market, the hub and Settings draw exactly as on main; nothing asks the server', async t2 => {
    let mainDir = null;
    try{
      mainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-main-'));
      const tar = execFileSync('git', ['-C', H.ROOT, 'archive', 'origin/main', 'index.html', 'app.js', 'style.css', 'assets'], { maxBuffer: 64 << 20 });
      execFileSync('tar', ['-x', '-C', mainDir], { input: tar });
    }catch(e){ t2.skip('origin/main is not available here'); return; }
    const mainSite = await H.serveSite(mainDir);
    try{
      const shapes = [];
      for(const s of [mainSite.base, site.base]){
        const g = await H.openGame(browser, { site: s, worker, vendorFiles });
        pages.push(g);
        await signUp(g.page, 'Plain' + shapes.length);
        await g.page.click('#btn-market');
        await g.page.waitForSelector('#market-screen.active');
        shapes.push(await marketShape(g.page));
        if(s === site.base){
          assert.equal(await g.page.evaluate(() => shopFlag), false);
          assert.equal(await g.page.isVisible('#market-tab-restricted'), false);
          assert.equal(await g.page.isVisible('#exhib-selector'), false);
          await g.page.click('#btn-market-back');
          await g.page.click('#btn-settings');
          await g.page.waitForSelector('#settings-overlay.show');
          assert.equal(await g.page.isVisible('#set-shop'), false, 'no Purchases section');
          // A paid colour this device believes is owned and equipped is still not drawn with the flag off.
          const c = await g.page.evaluate(() => {
            lsSet('pi_ent_v1', { uid: user.uid, at: Date.now(), items: { col_aurora: { s: 'active', at: 1 } } });
            user.equipped.colors = 'col-x-aurora';
            applyEquippedCosmetics();
            return [getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim(), findItem('colors', 'col-x-aurora') === undefined];
          });
          assert.deepEqual(c, ['#00f5ff', true]);
          assert.deepEqual(g.calls, [], 'no request to the purchase server');
          assert.deepEqual(g.log.filter(l => /pageerror/.test(l)), []);
        }
        await g.context.close();
      }
      assert.deepEqual(shapes[1].tabs, shapes[0].tabs, 'the tab row is the same, cell for cell');
      assert.deepEqual(shapes[1].shelves, shapes[0].shelves, 'every shelf carries the same cards');
    }finally{
      await mainSite.close();
      fs.rmSync(mainDir, { recursive: true, force: true });
    }
  });

  await t.test('a guest sees the aisle and is sent to save the account; nothing is sent', async () => {
    const g = await open({ path: '/?shop=beta' });
    pages.push(g);
    const { page } = g;
    assert.equal(new URL(page.url()).search, '', '?shop=beta leaves the address bar');
    await page.click('#btn-guest');
    await page.waitForSelector('#hub-screen.active', { timeout: 20000 });
    await settle(page);
    await openAisle(page);
    await shot(page, '01-aisle-guest');
    assert.deepEqual(await page.$$eval('#shop-restricted .shop-name', e => e.map(x => x.textContent)),
      ['Supporter Pass', 'Aurora', 'Ultraviolet', 'Comet', 'Neon Kitsune', 'Glitch Unicorn', 'Polar Night', 'Aegis Field', 'Chrono Anchor']);
    assert.match(await cardButton(page, 'Aurora').textContent(), /sign in to buy/i);
    assert.match(await page.textContent('#sku-why'), /Guests can look around/);
    await cardButton(page, 'Aurora').click();
    await waitToast(page, /Purchases need a saved account/);
    await page.waitForSelector('#up-overlay.show', { timeout: 3000 });
    assert.equal(await page.isVisible('#sku-overlay.show'), false, 'no purchase sheet for a guest');
    assert.deepEqual(g.calls, []);
    await g.context.close();
  });

  await t.test('a phone: the Restricted tab takes a row of its own, and nothing is wider than the screen', async () => {
    const g = await open({ path: '/?shop=beta', viewport: { width: 390, height: 844 }, mobile: true });
    pages.push(g);
    const { page } = g;
    await page.click('#btn-guest');
    await page.waitForSelector('#hub-screen.active', { timeout: 20000 });
    await settle(page);
    await openAisle(page);
    const m = await page.evaluate(() => {
      const row = document.querySelector('.market-tabs').getBoundingClientRect();
      const tab = document.getElementById('market-tab-restricted').getBoundingClientRect();
      const scr = document.getElementById('market-screen');
      return { row: Math.round(row.width), tab: Math.round(tab.width), over: scr.scrollWidth - scr.clientWidth };
    });
    assert.equal(m.tab, m.row, 'a full row');
    assert.ok(m.over <= 0, `market overflows sideways by ${m.over}px`);
    await shot(page, '00-phone-aisle');
    await cardButton(page, 'Aurora').scrollIntoViewIfNeeded();
    await g.context.close();
  });

  await t.test('a local profile and an offline device are refused at the button', async () => {
    // LOCAL: no connection at the first visit, so the arcade offers a profile on this device only.
    let g = await open({ path: '/?shop=beta', offline: true });
    pages.push(g);
    await g.page.waitForSelector('#btn-local-play', { timeout: 10000 });
    await g.page.click('#btn-local-play');
    await g.page.waitForSelector('#hub-screen.active');
    await settle(g.page);
    assert.equal(await g.page.evaluate(() => isLocalSession()), true);
    await g.page.evaluate(() => openMarket());          // the event banner's door: the hub's is shut offline
    await g.page.click('#market-tab-restricted');
    await cardButton(g.page, 'Comet').click();
    await waitToast(g.page, /Save your progress online first/);
    assert.equal(await g.page.isVisible('#sku-overlay.show'), false);
    assert.deepEqual(g.calls, []);
    await g.context.close();

    // OFFLINE: a saved account whose connection drops.
    g = await open({ path: '/?shop=beta' });
    pages.push(g);
    await signUp(g.page, 'Dropped');
    await g.context.setOffline(true);
    await g.page.waitForFunction(() => offlineMode === true);
    await g.page.evaluate(() => openMarket());
    await g.page.click('#market-tab-restricted');
    assert.match(await g.page.textContent('#sku-why'), /Offline: buying needs a connection/);
    await cardButton(g.page, 'Comet').click();
    await waitToast(g.page, /Purchases need a connection/);
    assert.deepEqual(g.calls, []);
    await g.context.close();
  });

  await t.test('buying: the sheet, the age line, CONTINUE → the server → the provider\'s page', async () => {
    const g = await open({ path: '/?shop=beta' });
    pages.push(g);
    const { page } = g;
    const uid = await signUp(page, 'Buyer');
    buyer = { g, uid, page };
    const before = { open: await stat('_buy_open'), start: await stat('_buy_start') };
    await openAisle(page);
    assert.match(await cardButton(page, 'Aurora').textContent(), /^Buy · \$1\.99$/i);
    await cardButton(page, 'Aurora').click();
    await page.waitForSelector('#sku-overlay.show');
    assert.match(await page.textContent('#sku-heading'), /AURORA/);
    assert.match(await page.textContent('#sku-sub'), /\$1\.99 · one-time purchase · tax included/);
    assert.match(await page.textContent('#sku-body'), /Stripe's secure checkout page/);
    assert.equal(await page.isDisabled('#sku-go'), true, 'CONTINUE waits for the age line');
    assert.equal(await page.locator('#sku-body input:not([type=checkbox]), #sku-body iframe').count(), 0, 'no payment field of any kind');
    await page.check('#sku-age');
    assert.equal(await page.isDisabled('#sku-go'), false);
    await shot(page, '02-purchase-sheet');
    await Promise.all([page.waitForURL(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_browser/), page.click('#sku-go')]);
    assert.equal(await page.textContent('#fake-checkout'), 'FAKE CHECKOUT');
    // What was asked, and of whom.
    const post = g.calls.filter(c => c.method === 'POST');
    assert.equal(post.length, 1);
    assert.equal(post[0].url, H.SHOP_API + '/checkout');
    assert.deepEqual(JSON.parse(post[0].body), { sku: 'col_aurora' }, 'the page sends the sku and nothing else');
    assert.match(post[0].headers.authorization, /^Bearer \S+$/);
    const made = provider.seen.filter(x => x.method === 'POST' && x.path === '/v1/checkout/sessions');
    assert.equal(made.length, 1);
    assert.equal(made[0].form.get('metadata[uid]'), uid);
    assert.equal(made[0].form.get('line_items[0][price]'), 'price_col_aurora');
    assert.equal(made[0].form.get('success_url'), `${site.base}/?purchase=ok&sku=col_aurora&sid={CHECKOUT_SESSION_ID}`);
    assert.equal(await stat('_buy_open'), before.open + 1);
    assert.equal(await stat('_buy_start'), before.start + 1);
  });

  await t.test('paying: the webhook grants it, the way back says unlocked, it equips and draws — Credits untouched', async () => {
    const { page, uid } = buyer;
    const sid = [...provider.sessions.keys()].pop();
    const before = await A.db.get(`players/${uid}`);
    const okBefore = await stat('_buy_ok');
    const s = await pay(uid, 'col_aurora', 199, sid);
    buyer.pi = s.payment_intent;
    assert.equal((await A.db.get(`shop/ent/${uid}/col_aurora`)).s, 'active');
    // The provider sends the player back to the success address.
    await page.goto(`${site.base}/?purchase=ok&sku=col_aurora&sid=${sid}`);
    assert.equal(new URL(page.url()).search, '', 'the way back leaves the address bar at once');
    await page.waitForSelector('#hub-screen.active', { timeout: 20000 });
    await waitToast(page, /Aurora unlocked/);
    assert.equal(await page.evaluate(() => localStorage.getItem('pi_buy_pending')), null);
    assert.equal(await stat('_buy_ok'), okBefore + 1);
    await settle(page, 500);
    await openAisle(page);
    assert.match(await aisleCard(page, 'Aurora').locator('.sku-badge').textContent(), /OWNED/);
    await cardButton(page, 'Aurora').click();              // EQUIP
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim() === '#7dffc8',
                               null, { timeout: 10000 });  // the whole interface wears it
    assert.equal(await page.evaluate(() => user.equipped.colors), 'col-x-aurora');
    assert.equal(await A.db.get(`players/${uid}/equipped/colors`), 'col-x-aurora');
    await shot(page, '03-owned-equipped');
    // The colours shelf carries it too, owned, with Unequip.
    await page.click('.market-tab[data-tab="colors"]');
    const onShelf = page.locator('#shop-colors .sku-card').filter({ has: page.locator('.shop-name', { hasText: /^Aurora$/ }) });
    assert.match(await onShelf.locator('.sku-btn').textContent(), /unequip/i);
    // Money never became Credits or Points, and nothing was "owned" the Credits way.
    const after = await A.db.get(`players/${uid}`);
    assert.equal(after.credits, before.credits);
    assert.equal(after.totalPoints, before.totalPoints);
    assert.deepEqual(after.owned || null, before.owned || null);
    assert.equal(await page.evaluate(() => (user.owned.colors || []).includes('col-x-aurora')), false);
  });

  await t.test('the mirror: offline, an owned colour still draws', async () => {
    const state = await buyer.g.context.storageState();
    const g = await open({ offline: true, storageState: state });
    pages.push(g);
    await g.page.waitForSelector('#hub-screen.active', { timeout: 15000 });   // the boot fallback opens the mirror
    assert.equal(await g.page.evaluate(() => offlineMode), true);
    assert.equal(await cyan(g.page), '#7dffc8');
    assert.deepEqual(g.calls, []);
    await g.context.close();
  });

  await t.test('a refund takes it away: the default is drawn again, BUY comes back, the order says REFUNDED', async () => {
    const { page, uid } = buyer;
    assert.equal((await deliver(E.refunded({ pi: buyer.pi, amount: 199 }))).status, 200);
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim() === '#00f5ff', null, { timeout: 15000 });
    assert.equal((await A.db.get(`shop/ent/${uid}/col_aurora`)).s, 'revoked');
    await page.click('#market-tab-restricted');
    assert.match(await cardButton(page, 'Aurora').textContent(), /^Buy · \$1\.99$/i);
    await page.click('#btn-market-back');
    await page.click('#btn-settings');
    await page.waitForSelector('#settings-overlay.show');
    await page.waitForSelector('#set-shop-orders .sku-ord', { timeout: 10000 });
    const row = await page.textContent('#set-shop-orders .sku-ord');
    assert.match(row, /Aurora/);
    assert.match(row, /\$1\.99/);
    assert.match(row, /REFUNDED/);
    assert.match(row, new RegExp(buyer.pi));
    await page.locator('#set-shop').scrollIntoViewIfNeeded();
    await shot(page, '04-settings-purchases');
    await page.evaluate(() => closeSettings());
  });

  await t.test('Restore reads the account again (a listener that missed a grant)', async () => {
    const { page, uid } = buyer;
    await page.evaluate(() => entStop());                  // as if the live copy had dropped
    await pay(uid, 'cur_comet', 199);
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => owns('cur_comet')), false, 'nothing told the page');
    await page.click('#btn-settings');
    await page.waitForSelector('#settings-overlay.show');
    await page.click('#btn-shop-restore');
    await waitToast(page, /Restored 1 item/);
    assert.equal(await page.evaluate(() => owns('cur_comet')), true);
    assert.match(await page.textContent('#set-shop-state'), /1 OWNED/);
    await page.evaluate(() => closeSettings());
  });

  await t.test('the Supporter Pass: ◆ on the boards and on the card; another player sees ◆ but not a paid skin', async () => {
    const { page, uid } = buyer;
    await pay(uid, 'pass_supporter', 499);
    await pay(uid, 'skin_kitsune', 299);
    await page.waitForFunction(() => owns('pass_supporter') && owns('skin_kitsune'));
    assert.equal(typeof await A.db.get(`shop/badge/${uid}`), 'number');
    await page.evaluate(() => handleShopAction('equip', 'skins', 'skin-x-kitsune'));
    await page.waitForFunction(() => user.equipped.skins === 'skin-x-kitsune');
    // The Patron colour came with the pass.
    assert.equal(await page.evaluate(() => !!findItem('colors', 'col-x-patron')), true);
    // The board: SUP is read at most once a minute; start it fresh for this check.
    await page.evaluate(() => { SUP.at = 0; loadLeaderboard(); });
    await page.waitForSelector(`#lb-panel .lb-row[data-uid="${uid}"] .lb-sup`, { timeout: 10000 });
    await page.click(`#lb-panel .lb-row[data-uid="${uid}"]`);
    await page.waitForSelector('#pcard-overlay.show');
    assert.match(await page.textContent('#pc-sup'), /◆ SUPPORTER · since/);
    await shot(page, '05-player-card');
    assert.equal(await page.textContent('#pcard-body .pc-skin'), '🦊', 'your own card wears it');
    await page.evaluate(() => closeOverlay('pcard-overlay'));

    const other = await open({ path: '/?shop=beta' });
    pages.push(other);
    await signUp(other.page, 'Viewer');
    await other.page.waitForSelector(`#lb-panel .lb-row[data-uid="${uid}"] .lb-sup`, { timeout: 10000 });
    await other.page.click(`#lb-panel .lb-row[data-uid="${uid}"]`);
    await other.page.waitForSelector('#pcard-overlay.show');
    assert.match(await other.page.textContent('#pc-sup'), /◆ SUPPORTER/);
    assert.equal(await other.page.textContent('#pcard-body .pc-skin'), '🤖', 'a paid skin on someone else\'s record is not vouched for');
    await other.context.close();
  });

  await t.test('exhibition rounds: armed once, nothing banked, the Credits kit untouched', async t2 => {
    const { page, uid } = buyer;
    t2.after(() => home(page));
    await pay(uid, 'pu_aegis', 299);
    await pay(uid, 'pu_anchor', 299);
    await page.waitForFunction(() => owns('pu_aegis') && owns('pu_anchor'));
    await page.evaluate(() => { user.powerups['pu-shield'] = 1; });   // one Credits shield in the kit
    await openAisle(page);
    await cardButton(page, 'Aegis Field').click();         // ARM
    await waitToast(page, /EXHIBITION ARMED/);
    await page.click('#btn-market-back');
    await page.waitForSelector('#hub-screen.active');
    await settle(page, 300);
    assert.equal(await page.isVisible('#exhib-selector'), true, 'the hub says it is armed');
    await page.locator('#exhib-selector').scrollIntoViewIfNeeded();
    await shot(page, '06-hub-exhibition-armed');
    const before = await A.db.get(`players/${uid}`);
    const playBefore = await page.evaluate(() => (playState().modes.exhib || 0));

    await page.click('.games-grid .game-card[data-game="click"]');
    await page.waitForFunction(() => !!gTimer, null, { timeout: 15000 });   // the 3-2-1 is over, the clock runs
    assert.match(await page.textContent('#chaos-banner'), /EXHIBITION/);
    await shot(page, '07-exhibition-round');
    assert.match(await page.textContent('#g-title'), /EXHIBITION/);
    assert.equal(await page.evaluate(() => exhibArmed), false, 'one round only: the arming is used up');
    assert.deepEqual(await page.$$eval('#pu-dock .pu-btn', b => b.map(x => x.textContent.replace(/\s+/g, ''))), ['⚓+10s∞', '💠AEGISON']);
    assert.deepEqual(await page.evaluate(() => [survivedFatal(), user.powerups['pu-shield'], powerConsume('pu-shield'), user.powerups['pu-shield']]),
      [true, 1, false, 1], 'Aegis absorbs; the Credits shield is never spent');
    // CLICK FRENZY hands over no clock door, so the anchor takes the dilator's fallback: ten ticks held.
    const held = await page.evaluate(() => _clockSkip);
    await page.click('#pu-dock [data-xh="anchor"]');
    assert.equal(await page.evaluate(() => _clockSkip), held + 10, 'the anchor put ten seconds on the clock');
    for(let i = 0; i < 12; i++) await page.click('#click-btn');
    await page.waitForSelector('#exhib-overlay.show', { timeout: 40000 });
    assert.match(await page.textContent('#exhib-body'), /PTS · NOT BANKED/);
    assert.equal(await page.textContent('#exhib-body .xh-score b'), '96', '12 clicks × 8, shown — and kept nowhere');
    await shot(page, '08-exhibition-card');
    await page.waitForTimeout(2500);                        // any write a round would make has had time to land
    const after = await A.db.get(`players/${uid}`);
    for(const k of ['totalPoints', 'credits', 'xp', 'level', 'gamesPlayed', 'history', 'highScores', 'weekly', 'mbest', 'daily', 'streak', 'achievements'])
      assert.deepEqual(after[k] ?? null, before[k] ?? null, `${k} unchanged by an exhibition`);
    assert.equal(await page.evaluate(() => playState().modes.exhib || 0), playBefore + 1, 'counted as a play, anonymously');

    // PLAY AGAIN (EXHIBITION) arms the next one explicitly…
    await page.click('#xh-again');
    await page.waitForFunction(() => !!gTimer && !!exhibRound, null, { timeout: 15000 });
    await page.click('#btn-quit');
    await page.waitForSelector('#hub-screen.active');
    await settle(page, 300);
    assert.equal(await page.evaluate(() => exhibRound === null && vsResultTap === null && exhibArmed === false), true);
    // …and the round after that is an ordinary one, which banks.
    await page.click('.games-grid .game-card[data-game="click"]');
    await page.waitForFunction(() => !!gTimer, null, { timeout: 15000 });
    assert.doesNotMatch((await page.textContent('#g-title')) || '', /EXHIBITION/);
    assert.equal(await page.evaluate(() => exhibRound), null);
    for(let i = 0; i < 5; i++) await page.click('#click-btn');
    await page.waitForSelector('#results-screen.active', { timeout: 30000 });
    await page.waitForTimeout(2500);
    assert.ok((await A.db.get(`players/${uid}/totalPoints`)) > (before.totalPoints || 0), 'an ordinary round still pays');
    await page.click('#btn-hub');
    await page.waitForSelector('#hub-screen.active');
  });

  await t.test('fail safe: the kill switch closes buying; what is owned keeps working', async t2 => {
    const { page, uid } = buyer;
    await home(page);
    await A.db.set('shop/cfg/open', false);
    t2.after(() => A.db.remove('shop/cfg'));
    await openAisle(page);
    await page.waitForFunction(() => SHOP_CFG.open === false, null, { timeout: 10000 });
    assert.match(await cardButton(page, 'Ultraviolet').textContent(), /closed/i);
    assert.equal(await cardButton(page, 'Ultraviolet').isDisabled(), true);
    assert.match(await page.textContent('#sku-why'), /closed right now/);
    await shot(page, '09-kill-switch');
    assert.equal(await page.evaluate(() => owns('cur_comet') && !!findItem('cursors', 'cur-x-comet')), true);
    // The server says the same to anyone who asks anyway.
    const tok = await page.evaluate(() => auth.currentUser.getIdToken());
    const r = await fetch(worker.base + '/checkout', { method: 'POST', body: JSON.stringify({ sku: 'col_ultra' }),
      headers: { Origin: site.base, 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok } });
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { error: 'closed' });
    await A.db.remove('shop/cfg');
    await page.waitForFunction(() => SHOP_CFG.open === true, null, { timeout: 10000 });
    assert.match(await cardButton(page, 'Ultraviolet').textContent(), /^Buy/i);
    void uid;
  });

  await t.test('fail safe: the server unreachable → "nothing was charged", and the arcade plays on', async () => {
    const g = await open({ path: '/?shop=beta', workerDown: true });
    pages.push(g);
    const { page } = g;
    await page.click('#tab-login');
    // Signing in again on a fresh browser: the same account, by its email.
    const email = await buyer.page.evaluate(() => auth.currentUser.email);
    await page.fill('#l-email', email);
    await page.fill('#l-pass', 'secret123');
    await page.click('#btn-login');
    await page.waitForSelector('#hub-screen.active', { timeout: 20000 });
    await settle(page, 500);
    await openAisle(page);
    await cardButton(page, 'Ultraviolet').click();
    await page.check('#sku-age');
    await page.click('#sku-go');
    await page.waitForFunction(() => /Nothing was charged/.test(document.getElementById('sku-err').textContent), null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('pi_buy_pending')), null, 'no purchase is waited for');
    assert.equal(await page.isDisabled('#sku-go'), false, 'CONTINUE can be tried again');
    await page.evaluate(() => closeOverlay('sku-overlay'));
    await page.click('#btn-market-back');
    await settle(page, 300);
    await page.click('.games-grid .game-card[data-game="click"]');
    await page.waitForFunction(() => !!gTimer, null, { timeout: 15000 });
    await page.click('#btn-quit');
    await page.waitForSelector('#hub-screen.active');
    await g.context.close();
  });

  await t.test('fail safe: purchases unreadable (the rules without the shop block) — the aisle says so, play is untouched', async () => {
    const rules = H.repoRules();
    delete rules.rules.shop;
    await H.putRules(rules);
    try{
      const g = await open({ path: '/?shop=beta' });
      pages.push(g);
      await signUp(g.page, 'NoRules');
      await openAisle(g.page);
      await g.page.waitForFunction(() => ENT.denied === user.uid, null, { timeout: 10000 });
      assert.match(await g.page.textContent('#sku-why'), /can't be read from here right now/);
      assert.equal(await g.page.evaluate(() => shopOpen()), true, 'an unreadable kill switch reads as open');
      assert.deepEqual(g.log.filter(l => /pageerror/.test(l)), []);
      await g.page.click('#btn-market-back');
      await settle(g.page, 300);
      await g.page.click('.games-grid .game-card[data-game="click"]');
      await g.page.waitForFunction(() => !!gTimer, null, { timeout: 15000 });
      await g.page.click('#btn-quit');
      await g.page.waitForSelector('#hub-screen.active');
      await g.context.close();
    }finally{ await H.putRules(); }
  });

  await t.test('the way back: a cancel, and a browser nobody is signed in to', async () => {
    const { page } = buyer;
    const before = await stat('_buy_cancel');
    await page.evaluate(() => lsSet('pi_buy_pending', { sku: 'col_ultra', uid: user.uid, at: Date.now() }));
    await page.goto(`${site.base}/?purchase=cancel&sku=col_ultra`);
    assert.equal(new URL(page.url()).search, '');
    await page.waitForSelector('#hub-screen.active', { timeout: 20000 });
    await waitToast(page, /Checkout cancelled\. Nothing was charged\./);
    assert.equal(await page.evaluate(() => localStorage.getItem('pi_buy_pending')), null);
    assert.equal(await stat('_buy_cancel'), before + 1);

    const g = await open({ path: '/?purchase=ok&sku=col_ultra&sid=cs_test_elsewhere' });
    pages.push(g);
    assert.equal(new URL(g.page.url()).search, '');
    await g.page.waitForSelector('#buy-auth', { state: 'visible', timeout: 5000 });
    assert.match(await g.page.textContent('#buy-auth'), /PAYMENT RECEIVED/);
    await shot(g.page, '10-return-not-signed-in');
    await g.context.close();
  });

  await t.test('no provider script and no card field on our pages; the service worker leaves the shop\'s hosts alone', async () => {
    const html = ['index.html', 'legal/terms.html', 'legal/refunds.html', 'legal/privacy.html'].map(f => fs.readFileSync(path.join(H.ROOT, f), 'utf8')).join('\n');
    assert.doesNotMatch(html, /js\.stripe\.com|<script[^>]+stripe/i);
    assert.doesNotMatch(html, /autocomplete="cc-|name="card/i);
    // Every script any page in this run loaded: the site's own, and the Firebase SDK.
    const scripts = new Set(pages.flatMap(g => g.scripts));
    assert.ok(scripts.size > 0);
    for(const u of scripts){
      assert.ok(u.startsWith(site.base + '/') || u.startsWith('http://localhost:') || u.startsWith(`http://${DB_HOST}/`) ||   // (the database's long-poll fallback)
                /^https:\/\/www\.gstatic\.com\/firebasejs\//.test(u), u);
    }
    const sw = fs.readFileSync(path.join(H.ROOT, 'sw.js'), 'utf8');
    const BYPASS = new Function(sw.match(/const BYPASS = (\/.+\/);/)[0] + '; return BYPASS;')();
    for(const u of [H.SHOP_API + '/health', 'https://checkout.stripe.com/c/pay/cs_test_1', 'https://js.stripe.com/v3/'])
      assert.ok(BYPASS.test(u), u);
    assert.ok(!BYPASS.test(site.base + '/app.js?v=84'));
  });

  await t.test('the page never logged an uncaught error', () => {
    const errs = pages.flatMap(g => g.log.filter(l => /pageerror/.test(l)));
    assert.deepEqual(errs, []);
  });
});
