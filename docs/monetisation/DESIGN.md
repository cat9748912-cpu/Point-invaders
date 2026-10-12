# 🔐 The Restricted shelf: direct payments for Point Invaders

**Design: approved at Gate 0 (2026-10-12). Phase 1 (server, rules, legal drafts) built, awaiting Gate 1.
At Gate 1 you couldn't use Firebase's Blaze plan, so the server moved from Cloud Functions to a Cloudflare
Worker on the free plan (D2, § 2 item 18).**
Version tag `v84`, new section `§ 46` (the next free numbers: `§ 45 · v80` is the last section,
v81–v83 were fixes without sections, and § 41 was retired in v81).
Audited against commit `94571c2` on branch `claude/stoic-cori-irbsqk`.

Companion files:
- [`TESTING.md`](TESTING.md): for every fact in the brief and every test run, how it was checked and what
  was found.
- [`RUNBOOK.md`](RUNBOOK.md): the deploy steps.

---

## 0. Summary

Players pay real money on a **hosted checkout page** for **one-time, non-consumable unlocks** in a new
**🔐 Restricted** aisle of the Black Market. A small server (one Cloudflare Worker) creates checkout
sessions and receives the payment provider's webhooks. It is the **only writer** of entitlements, which live
in a new top-level database node, `shop`, that clients can read but never write. The game reads entitlements
with a live listener, mirrors them to `localStorage` for offline play, and draws owned items exactly like
Credits-bought ones. Paid items never touch `credits`, `totalPoints`, `owned.*` or `powerups.*`.

```
 browser (app.js § 46)                      Worker `point-invaders-shop` (Cloudflare)       Stripe
 ─────────────────────                      ───────────────────────────────────────         ──────
 BUY ─▶ POST /checkout  (Bearer ID token) ─▶ verify token · refuse guests · catalogue ─────▶ Checkout Session
        ◀── { url } ◀──────────────────────── rate limit · reuse open session ◀────────────  (hosted page)
 location.assign(url) ─────────────────────────────────────────────────────────────────────▶ customer pays
                                             POST /webhook (raw body, signed) ◀───────────── event
                                             verify · claim event id · transition order
                                             ── REST, admin token ──▶ RTDB shop/ent, orders, pi, badge
 shop/ent/<uid>  .on('value') ◀───────────── (rules: owner may READ, nobody may WRITE)
 owns(sku) → shelf, equip, cosmetics; mirror pi_ent_v1 for offline
```

At Gate 0 you approved every recommendation below, answered the open questions (§ 14), and pasted the rules
file (§ 6).

---

## 1. Decisions (D1–D10), as agreed at Gate 0

The brief arrived with its `<<…>>` placeholders unfilled. I recommended an answer for each, and you approved
all of them on 2026-10-12: "i approve". Your business is in **Singapore**, and you want the payment provider
to handle taxes. Singapore is on Stripe's Managed Payments list, so D1 is settled as Stripe Checkout with
Managed Payments.

| # | Decision | Brief | Agreed | Why |
|---|----------|-------|----------------|-----|
| D1 | Payment provider | *unfilled* | **Stripe Checkout with Managed Payments** (Link as merchant of record), business in Singapore. If Stripe's review declines Managed Payments, we stop and decide (RUNBOOK § 3). | The whole architecture in the brief is Stripe-shaped (lookup keys, sessions, test card). Managed Payments keeps that exact integration and moves VAT/GST in 80+ countries, fraud and disputes to Stripe. It lists **video games** as an eligible category. See § 8.2. |
| D2 | Server runtime | *unfilled* | Agreed at Gate 0: Firebase Cloud Functions 2nd gen. **Changed at Gate 1: a Cloudflare Worker on the free plan**, because you can't use Blaze, which Cloud Functions require. | No card and no monthly cost. The trade-offs are in § 2, item 18: the Admin SDK's work is now done over REST, and Cloudflare holds a key with full access to the database. |
| D3 | Product model | One-time non-consumables only | **As written.** | |
| D4 | v1 catalogue | *unfilled* | Supporter Pass, 6 Restricted cosmetics and 2 exhibition power-ups (**9 SKUs**, § 3). The pass ships **without** the Beacon companion (Q8); Beacon can follow later. | All data-only items that reuse existing renderers. |
| D5 | Paid power-up rule | *A or B unfilled* | **Either A or B: the design satisfies both.** Paid power-ups only work in **Exhibition rounds**, which are off every board and pay nothing, from their first frame (§ 3.3). | Under B, any run whose points still reached `totalPoints` would turn money into Points. Excluding the whole run is the only reading of B that keeps non-negotiable 2. That is also exactly what A needs. |
| D6 | Prices / currency | *unfilled* | USD base: pass $4.99, colours and cursor $1.99, skins $2.99, world $3.99, power-ups $2.99. **Tax-inclusive** prices; Adaptive Pricing on (always on under Managed Payments). | Tax-inclusive means a $4.99 tag is what a player in the EU, UK or AU pays, which their consumer law expects. |
| D7 | Refund policy | *unfilled* | **14 days, no questions asked, on request**. A refund or chargeback removes the item; a dispute you win restores it. | Simple to explain and to operate. Under Managed Payments Stripe may refund within 60 days on its own, so revocation must be automatic either way. |
| D8 | Minimum age | *unfilled* | **13+, with a parent or guardian's permission under 18**: a required checkbox in the purchase sheet, plus the provider's terms checkbox. | The Firebase project name (`neal-with-roblox`) hints at a young audience. See § 14, Q9. |
| D9 | Who deploys | *unfilled* | **You deploy from your machine** with Cloudflare's `wrangler`, following `RUNBOOK.md`. | This environment has no Firebase or Stripe credentials (checked by name only), and non-negotiable 8 forbids deploying without a gate anyway. |
| D10 | Rollout | Beta flag on `main` in test mode, then live | **As written**, plus a server-side kill switch (`shop/cfg/open`) and a purge of test-mode grants at go-live (§ 5.5, § 12). | |

---

## 2. Where the code changed the brief

The brief's facts held on almost every point (see `TESTING.md`). These are the places where the code, or
the outside world, forced a different design. You accepted items 1–15 at Gate 0. Items 16 and 17 came up
while building Phase 1.

1. *(Superseded by item 18: no Cloud Functions runtime is used now.)* **Node 20 → Node 24.** Google decommissions the `nodejs20` runtime on **2026-10-30**, 18 days from now.
   After that date a function on it can no longer be deployed or updated. `firebase-tools` 15.33 lists
   `nodejs24` as GA (deprecation 2028-04-30). `firebase-admin` 14 needs Node ≥ 22. The code also runs on
   Node 22, which is how the tests run here.
2. **Premium items do not go inside `SHOP_ITEMS`.** They live in their own table (`SKU_ITEMS`, next to the
   client catalogue `SHOP_SKUS`). Two hooks join them in: `findItem()` (lookups) and `renderShop()` (shelves).
   Inside `SHOP_ITEMS` they would leak into four Credits-economy loops that iterate the table:
   - the daily featured rotation, which discounts items by Credits price (`featuredIds`, `app.js:6023`);
   - the rarity bands, where a premium item's missing Credits price would re-band every shelf (`getRarity`, `app.js:6063`);
   - Supply Drop's random consumable grant (`grantRandomConsumable`, `app.js:17187`);
   - the crew colour palette (`crewColors`, `app.js:71630`).

   A separate table keeps money out of the Credits economy by construction, including any loop you write later.
3. **One ownership gate, more hook points than the brief listed.** `findItem()` returns a premium item only
   when the player owns it and the shelf is on. Every place that draws an equipped item (colour, cursor,
   skin, world, companion, exit, drive, about nine call sites) therefore falls back to the default by itself
   when an item isn't owned, is refunded, or the flag is off. Three places check `owned.*` directly and need
   their own small hooks:
   - `cmpState()` (`app.js:70025`) resets any equipped companion missing from `owned.companions` and **writes
     that reset back to the server**, so a paid companion would be unequipped on every fresh device;
   - `applyLoadout()` (`app.js:44905`);
   - the cursor's animated tier, which is derived from its Credits price (`app.js:6157`).
4. **The market can be opened offline.** The capture-phase door guard (`app.js:1356`) blocks `#btn-market`
   while offline, but the event banner's **LIMITED STOCK** button calls `openMarket()` directly
   (`app.js:47743`). The buy path therefore checks offline, local and guest state itself and does not rely on
   the door.
5. **Paid power-ups are confined to Exhibition rounds** (§ 3.3). For context, the four Credits power-ups already
   change time (Dilator), survival (Shield), pay (+30 %, Overclock) and difficulty (Dampener) in board-eligible
   runs (`app.js:17130–17157`). D5 holds paid items to a stricter standard than anything sold for Credits today.
6. **`shop/badge/<uid>` holds a timestamp ("supporter since"), not `true`.** It is still truthy, and it gives the
   Dossier its "Supporter since …" line for free.
7. **A public-read kill switch, `shop/cfg/open`.** You flip it in the Firebase Console. The server then
   refuses new checkouts (503) and the shelf shows "closed". Owned items keep working. Rollback becomes a
   console click instead of a client deploy waiting on service-worker caches.
8. **`customer_email` is pre-filled only when the token says `email_verified`.** Stripe makes a pre-filled email
   read-only. This game does not verify email/password addresses, so a typo would otherwise send the receipt
   to a stranger with no way to fix it. Google accounts are verified, so they keep the pre-fill.
9. **`firebase.json` has no deploy targets at all**: it only configures the emulators the tests use. Your rules
   live in the Console, and the code says the full copy is kept at `_firebase/database.rules.json` "beside the
   project, not deployed" (`app.js:51367`, `app.js:55839`). A `firebase deploy` from this repo must never
   overwrite them. The rules tests load `database.rules.json` directly into the emulator instead.
10. **Everything merged to `main` is public.** `https://pointinvaders.com/README.md` is served raw today, which
    shows that repository files are published as they are. `worker/`, `database.rules.json` and `docs/`
    would be too. They contain no secrets by design, but a rules file and a runbook are a map for anyone
    probing. See § 14, Q3.
11. **The service worker caches every navigation response as `./index.html`** (`sw.js:70–80`). That includes
    GitHub's 404 page and, once they exist, `legal/*.html`. Opening the Terms page inside the installed app
    would replace the cached game shell with the Terms page, and the next offline launch would show it.
    The navigation handler now caches only successful navigations to the shell itself (the v84 bump).
    **Done in Phase 1, moved forward from Phase 2,** so that the branch is safe to merge as soon as the legal
    pages exist. The bug was reproduced and the fix verified in
    Chromium (TESTING.md, Phase 1).
12. **A refused `stats` write switches off all play counters for the session** (`stSend` sets
    `ST_ON = false`, `app.js:51270`). The funnel keys `_buy_open`, `_buy_start`, `_buy_ok` and `_buy_cancel`
    pass the client's pattern (`^_[a-z_]{1,14}$`, `app.js:51343`). Your `stats` rule accepts them too
    (proven in the emulator, § 6), so Phase 2 adds them.
13. **Rules tests use `@firebase/rules-unit-testing` 5.0.x with `firebase` 12.x.** Version 6 needs
    Node ≥ 24.12, and this environment has Node 22.22.
14. **Duplicate-payment protection** beyond the brief's 409. The server reuses an open checkout session for
    the same item and refuses while a paid session's webhook is in flight. In the rare race that still pays
    twice, the duplicate is refunded automatically, as you approved (§ 14, Q6).
15. **Return URL follows the caller's allow-listed origin**, and only in test mode, so a test from
    `http://localhost:8080` comes back to localhost. In live mode it is always `https://pointinvaders.com/`.
16. **The third `?v=` stamp lives in `app.js`, not `index.html`.** `assets/ship62.js` is loaded by a script
    tag whose URL comes from `PI_ASSET_FILES` (`app.js:24408`). A bump touches `sw.js` (CACHE + 3 stamps),
    `index.html` (2 stamps) **and** that one line of `app.js`. With the line missed, the precached chunk
    is never read.
17. *(Superseded by item 18: a Worker scales on its own.)* **`maxInstances: 10`, not 5.** A 256 MiB gen-2
    function gets a fraction of a CPU and therefore handles one request at a time.
18. **The server is a Cloudflare Worker, not a Cloud Function (Gate 1).** You couldn't use the Blaze plan, which
    Cloud Functions require. Cloudflare's free plan needs no card and allows 100,000 requests a day, 10 ms of CPU
    per request (time waiting on the network doesn't count) and 50 outgoing calls per request. The shop uses
    well under all three. Neither the Admin SDK nor Stripe's Node library runs in a Worker, so `worker/src` does
    their jobs itself:
    - **Database:** the REST API with an administrator's access token, which bypasses the rules just as the
      Admin SDK does. Transactions are compare-and-swap with ETags: a write that loses a race gets 412 and is
      recomputed from the server's value. Proven against the emulator.
    - **Database key:** a service account whose only role is **Firebase Realtime Database Admin**, kept as a
      Cloudflare secret. The Worker signs a JWT with it and trades it at Google for a one-hour token.
      **This is the main trade-off.** The key can read and write the whole database, including players'
      Credits and Points, and it lives outside Google, so anyone who gets into your Cloudflare account could
      take it. It is never in this repository or on a screen. Turn on two-factor sign-in at Cloudflare, and
      delete and replace the key if it is ever exposed (RUNBOOK, Undo).
    - **Who is asking:** Firebase ID tokens are checked by Firebase's documented recipe for servers without the
      Admin SDK: the signature against Google's published keys, then aud, iss, sub, exp, iat and auth_time. uids
      that couldn't be database keys are refused.
    - **Dropped: `checkRevoked`.** The revocation check needs admin access to every player's sign-in record. Now
      a disabled account's token can still open a checkout for at most an hour, and its holder pays for it.
    - **Stripe:** the seven calls over `fetch`, with the API version pinned and idempotency keys on every POST.
      Webhook signatures are checked with WebCrypto over the raw bytes, cross-checked against Stripe's own
      library in both directions.
    - **Non-negotiable 1, reworded:** "written only by the webhook handler with the Admin SDK" becomes "with an
      administrator's token over the REST API". It is the same privilege and the same bypass of the rules, and
      still only the webhook handler writes grants.
    - **Non-negotiable 6:** the keys live in Cloudflare's secret store, "the provider's equivalent".

---

## 3. Product: the v1 catalogue (D4, agreed)

### 3.1 SKUs

The SKU id is the Stripe **price lookup key**, the key under `shop/ent/<uid>/`, and the value in checkout
metadata. Ids are `[a-z0-9_]{3,40}`. Client item ids use an `-x-` infix (`col-x-aurora`), so they can never
collide with a future Credits item. Names, hex values and emoji are **placeholders for your art direction**.

| SKU | Name | Aisle | Proposed price | What it unlocks | Build cost |
|-----|------|-------|----------------|-----------------|------------|
| `pass_supporter` | Supporter Pass | 🔐 Restricted (top card) | $4.99 | ◆ **SUPPORTER** chip on every board and player card; **Patron** colour `col-x-patron` (`#ffe9a8`); "Supporter since …" Dossier line. *(The Beacon companion was deferred at Gate 0, Q8.)* | data |
| `col_aurora` | Aurora | 🎨 Colours | $1.99 | colour `col-x-aurora` (`#7dffc8`) | data |
| `col_ultra` | Ultraviolet | 🎨 Colours | $1.99 | colour `col-x-ultra` (`#6e5bff`) | data |
| `cur_comet` | Comet | 🖱️ Cursors | $1.99 | cursor `cur-x-comet` ☄️, drawn with the animated **epic** cursor | data + one token (`fx:'epic'`) |
| `skin_kitsune` | Neon Kitsune | 🤖 Skins | $2.99 | skin `skin-x-kitsune` 🦊 | data |
| `skin_unicorn` | Glitch Unicorn | 🤖 Skins | $2.99 | skin `skin-x-unicorn` 🦄 *(renamed from `skin_seraph` before anything was seeded, so the permanent id matches the name)* | data |
| `wld_polar` | Polar Night | 🌍 Worlds | $3.99 | world `wld-x-polar`, a tint-only aurora sky over every 3D mission and open world | data (a `tint`, no `look`) |
| `pu_aegis` | Aegis Field | ⚡ Power-ups (exhibition) | $2.99 | in an Exhibition round, every fatal hit is absorbed | small hooks (§ 9.7) |
| `pu_anchor` | Chrono Anchor | ⚡ Power-ups (exhibition) | $2.99 | in an Exhibition round, **+10 s per press**, any number of times | small hooks (§ 9.7) |

Every premium item shows on the 🔐 Restricted aisle **and** on its own category shelf, with a lock and a
real-money price instead of a 💎 price. Once owned, it equips and unequips exactly like a Credits item, through
the existing `equipped.<cat>` key. Equipping isn't owning, so that key can stay client-written.

### 3.2 What paid items can never do

- Never grant or touch `credits`, `totalPoints`, `owned.*`, `powerups.*`, `xp`, perks, medals, records,
  contracts, achievements, titles, bounties or weekly/daily/lane/event/crew/glitch boards.
- Never be converted, staked, traded, gifted or refunded into Credits.
- Never appear in the featured rotation, rarity bands, Supply Drop, event shelf or crew palette, because they
  are not in `SHOP_ITEMS` (§ 2, item 2).
- The ◆ SUPPORTER chip is the only public marker, and it reads from `shop/badge`, which only the server writes.
  It is deliberately not an achievement or title: those are owner-writable (`titleOf`, `app.js:47912`).

### 3.3 D5 as implemented: Exhibition rounds

A paid power-up does nothing in an ordinary round. You **arm** an exhibition from either toy's card on the
Restricted aisle ("🎟️ ARM FOR NEXT ROUND"), and the hub shows an **EXHIBITION ARMED · tap to disarm** chip.
The next **plain mission-grid round** becomes an **Exhibition round** carrying every exhibition toy you own, and
it opens with a banner (like the chaos banner): "🎟️ EXHIBITION · nothing is banked this round". The arming is
for **one round only**, so nobody plays a string of rewardless rounds by forgetting a switch;
**PLAY AGAIN (EXHIBITION)** on its card arms the next one explicitly. "Plain" uses the predicate the game already has in `bntyArm()` (`app.js:71460`): a
`SOLO_START` mission that is not a duel, Boss Rush, Endless, Daily Hack, Anomaly, challenge, Glitch Run,
speedrun, party turn, Lab run, campaign chapter, tournament or open world.

An Exhibition round works like a Brick Lab practice run (`app.js:51885`), plus the armed toy:

| | Ordinary round | Exhibition round |
|---|---|---|
| Points, Credits, XP, level | paid out | **none** |
| Medals, grid records, contracts, campaign, achievements | settled | **none**: the result is taken by `vsResultTap` before `showResultsCard()` and `saveScore()` |
| All-time, weekly, daily, lane, event, crew boards | eligible | **excluded** |
| Bounties, challenges, replay code, pace ghost | yes | **no** |
| Chaos / Heat modifiers | as armed | **off** |
| Credits power-ups (dock) | usable | **hidden and never spent** (the same rule a Lab run has in `survivedFatal`) |
| Aegis / Chrono Anchor | — | active, if owned and armed |
| Results card | normal | "🎟️ EXHIBITION · Aegis Field: no points, credits or XP; not on any board", then PLAY AGAIN (EXHIBITION) / HUB |
| Play counter (`stats`) | yes | yes: anonymous, counts plays only |

**Under A:** the round was never board-eligible, so a paid power-up never changed a board-eligible run.
**Under B:** the run that used one is excluded from every board and its card says so. It also pays nothing,
which is what keeps money from becoming Points.
A mid-round "flip to exhibition" variant of B is possible but costly: it would have to unwind a round's chaos,
heat, bounty, daily, campaign and challenge state halfway through. I don't recommend it.

**Daily charge:** the brief suggested a `perkDay`-style daily recharge. Since an Exhibition round pays nothing,
an owned toy has **unlimited use**, as agreed at Gate 0 (§ 14, Q7). Adding scarcity later is a two-line change
using the `perkDay` pattern (a UTC `dayKey()`), kept in the device mirror and not on the server.

---

## 4. Architecture and trust boundaries

| Component | Trusted for | Never trusted for |
|---|---|---|
| Browser (`app.js § 46`) | Showing the shelf; asking for a checkout; drawing owned items | Any unlock, price, uid or ownership claim |
| Firebase Auth ID token | Who the caller is (`uid`, `sign_in_provider`, `email_verified`) | — |
| Worker `point-invaders-shop` | Turning a verified uid and a known SKU into a checkout session; applying signed provider events | — |
| Service account key (a Cloudflare secret) | Administrator access to the Realtime Database, for the Worker only | anything else: its only role is Realtime Database Admin |
| Stripe | Amounts, payment status, refunds, disputes (via signed webhooks) | — |
| RTDB `shop/*` | The entitlement of record (admin-written only) | — |

The client sends **only** `{ sku }` and its ID token. The uid comes from the verified token; the price comes
from the provider by lookup key. Checkout metadata is written by the server and cannot be edited by the buyer.

---

## 5. Data model: `shop/*`

All writes come from the Worker with an administrator's token over the REST API, which bypasses the rules as
the Admin SDK would. Clients get **read only** where
listed, **never write**. Times are server milliseconds. Stripe ids (`cs_…`, `pi_…`, `evt_…`) are valid RTDB keys.

```
shop/
  cfg                       { open: true|false }                       public read     (§ 5.5)
  badge/<uid>               <ms supporter since>                       public read
  ent/<uid>/<sku>           { s, at, u, o, p, c, lm, ord: {<sid>: state} }   owner read
  orders/<uid>/<sid>        { sku, amount, currency, pi, at, s, lm, d? }     owner read
  events/<eventId>          { t, st: 'claimed'|'done', at, lm }        no client access
  pi/<payment_intent>       { uid, sku, sid }                          no client access
  rl/<uid>                  { at, o: {<sku>: {id: <sid>, exp: <s>}} } no client access
```

| Path | Fields | Written when | Read by |
|---|---|---|---|
| `ent/<uid>/<sku>` | `s` 'active' / 'revoked' (derived from `ord`); `at` first grant; `u` last change; `o` the order that last changed it; `p`/`c` amount and currency of the granting order; `lm` Stripe livemode; `ord` map of that SKU's orders → state | every order transition, inside **one transaction on this node** | the owner's live listener, Restore, the function's 409 check |
| `orders/<uid>/<sid>` | receipt line; `s` copies the order state for display; `d:1` marks an auto-refunded duplicate | after the transaction | the owner (Settings → Purchases) |
| `badge/<uid>` | supporter-since ms; removed when the pass is not active | after the pass node's transaction | everyone (boards, cards) |
| `events/<id>` | idempotency claim (§ 7.3) | start and end of each webhook | function only |
| `pi/<pi>` | map a charge, refund or dispute back to the order | on completion | function only |
| `rl/<uid>` | `at` last session time (10 s limit); `o` open session per SKU for reuse | on `/checkout` | function only |

### 5.1 Order state machine (monotonic)

| From | Event | To |
|---|---|---|
| (none) | `checkout.session.completed`, paid | `paid` |
| (none) | `checkout.session.completed`, unpaid (delayed method) | `pending` |
| `pending` | `checkout.session.async_payment_succeeded` | `paid` |
| `pending` | `checkout.session.async_payment_failed` | `failed` |
| `paid` | `charge.dispute.created` | `disputed` |
| `disputed` | `charge.dispute.closed`: won / warning_closed | `paid` |
| `disputed` | `charge.dispute.closed`: lost | `lost` ■ |
| any but ■ | `charge.refunded` (full) | `refunded` ■ |
| (none) | a refund or dispute seen before the completion | `refunded` ■ / `disputed` |
| ■ `refunded`, `lost` | anything | unchanged (terminal) |

A completion event only ever moves an order out of (none) or `pending`. Any other transition not listed
leaves the order as it is.

- **Entitlement:** `ent.s = 'active'` if any order in `ord` is `paid`, else `'revoked'`. `pending`, `failed`,
  `disputed`, `refunded` and `lost` don't count. (`disputed` is a revocation; winning the dispute restores it.)
- **Order independence:** because states only move forward and refunded/lost are terminal, a late or replayed
  `checkout.session.completed` can never re-grant a refunded order.
- **Partial refunds** (a goodwill refund on part of the amount) are logged and do **not** revoke. Only a full
  refund (`charge.refunded === true`) revokes.
- **Concurrency:** the transition and the re-derivation of `s` happen in one compare-and-swap transaction on
  `ent/<uid>/<sku>` (an ETag-conditioned write, recomputed on a 412). Two events for the same player and SKU arriving at once (Stripe delivers concurrently)
  cannot interleave. `orders` and `badge` are written after the transaction commits, from the committed value.

### 5.2 Badge

`badge/<uid>` is set to the pass's first-grant time while `ent/<uid>/pass_supporter.s === 'active'`, and
removed when it isn't. It is re-derived from the committed pass node on every pass event, and by the reconcile
script (Phase 3). That makes the badge eventually correct even after the rare concurrent-write race described
in `OPERATIONS.md`.

### 5.3 Test-mode grants

D10 runs the beta in Stripe **test mode against the production database**, so beta testers' entitlements are
real rows. Every row records `lm` (livemode). At go-live, `scripts/purge-test-grants.js` removes every `lm:false`
grant and its badge, with a dry run first, and the checklist runs it before the flag flips.

### 5.4 What is *not* stored

No card data (it never reaches us), no email addresses (Stripe has them), no names. The only personal link is
`uid → SKU, amount, currency, Stripe ids`, plus the public `uid → supporter since`.

### 5.5 Kill switch (agreed at Gate 0)

`shop/cfg = { open: true }`, written by you in the Console. With `open: false`, `/checkout` answers
`503 {error:'closed'}` and the client shows the aisle as closed. Owned items, restore and the webhook keep
working, because refunds must still revoke. A missing node counts as **open**, so forgetting to create it
breaks nothing.

---

## 6. Database rules

You pasted your Console rules at Gate 0. `database.rules.json` in the repository is **exactly those rules,
plus this block** after `lab`, in your file's style (`===`, explicit `.read`/`.write: false`). It was checked
mechanically: with `shop` removed, the file deep-equals what you pasted, and the only text change is the
inserted block.

```json
"shop": {
  "cfg":    { ".read": true,  ".write": false },
  "badge":  { ".read": true,  ".write": false },
  "ent": {
    "$uid": { ".read": "auth != null && auth.uid === $uid", ".write": false }
  },
  "orders": {
    "$uid": { ".read": "auth != null && auth.uid === $uid", ".write": false }
  },
  "events": { ".read": false, ".write": false },
  "pi":     { ".read": false, ".write": false },
  "rl":     { ".read": false, ".write": false }
}
```

What your file settled:

- **No grant above `shop`.** Your root is `".read": false, ".write": false`, so nothing cascades into `shop`.
  The rules tests run the whole file in the emulator and prove that no client can write anywhere under
  `shop`, its own entitlements included (TESTING.md, Phase 1).
- **`badge` is a public read**, matching `players` (`".read": true`).
- **The funnel keys are accepted.** `stats/d/$day/$k` allows `^[a-z0-9_]+$` up to 16 characters, stepping
  +1, so `_buy_open`, `_buy_start`, `_buy_ok` and `_buy_cancel` are in. This was proven in the emulator,
  which resolves U2.
- `players/$uid/$other` validates `true`. Unknown keys under a player's own record are accepted, which is
  why `cmpPush`-style child writes work. It is also one more reason nothing paid may live there.

---

## 7. Endpoint contracts

One Cloudflare Worker, **`point-invaders-shop`**, on the free plan (§ 2, item 18). Base URL, set when you first
deploy: `https://point-invaders-shop.<your-subdomain>.workers.dev`. Routes: `POST /checkout`, `POST /webhook`,
`GET /health`. `/health` answers `{ok, live, db}`, or names any missing secret.

Secrets, set with `npx wrangler secret put`: `STRIPE_SECRET_KEY` (a **restricted key**, § 10),
`STRIPE_WEBHOOK_SECRET` and `FIREBASE_SERVICE_ACCOUNT`. Settings (`[vars]` in `worker/wrangler.toml`): `SITE`,
`PROJECT_ID`, `DATABASE_URL`, `MANAGED_PAYMENTS`, `AUTO_REFUND_DUPES`. Logs are one JSON object per line (Workers
Logs) and never contain
tokens, emails or full request bodies.

### 7.1 `POST /checkout`

Request: `Authorization: Bearer <Firebase ID token>`, `Content-Type: application/json`, body `{"sku":"col_aurora"}`.

| Step | Check | Failure |
|---|---|---|
| 1 | `OPTIONS` preflight: `Origin` must be `https://pointinvaders.com` or `https://cat9748912-cpu.github.io` (it redirects to the domain), or `http://localhost:*` / `http://127.0.0.1:*` **in test mode only**. Responds with `Vary: Origin`, methods `POST, OPTIONS`, headers `Authorization, Content-Type`, max-age 600. | 403 `origin` |
| 2 | method is `POST` | 405 |
| 3 | `shop/cfg/open !== false` | 503 `closed` |
| 4 | the ID token: signature against Google's keys, aud, iss, sub, exp, iat, auth_time (no revocation check, § 2, item 18) | 401 `auth` |
| 5 | `decoded.firebase.sign_in_provider !== 'anonymous'` | 403 `guest` |
| 6 | `sku` is in the server catalogue | 400 `bad_sku` |
| 7 | `ent/<uid>/<sku>.s !== 'active'` | 409 `owned` |
| 8 | A stored open session for this SKU (`rl/<uid>/o/<sku>`, more than 2 min to expiry) is retrieved: `open` → **return it** (no new session, no rate limit); `complete` and `paid` → the webhook is in flight | 409 `owned_pending` |
| 9 | rate limit: a transaction on `rl/<uid>/at` allows one **new** session per 10 s | 429 `slow` + `retryAfter` |
| 10 | price = `prices.list({ lookup_keys:[sku], active:true, limit:1 })` | 503 `unpriced` (logged); a provider error is 502 `provider` |
| 11 | `checkout.sessions.create(params)`, store `{id, exp}` in `rl/<uid>/o/<sku>` | 502 `provider` |

Success: `200 {"url":"https://checkout.stripe.com/c/pay/cs_…","id":"cs_…"}`.

Session parameters (the brief's list, adjusted for verified Stripe API facts):

| Parameter | Stripe as merchant | Managed Payments |
|---|---|---|
| `mode` | `payment` | `payment` |
| `line_items` | `[{ price: <resolved id>, quantity: 1 }]` | same |
| `client_reference_id` | uid (max 200 chars) | same |
| `metadata`, `payment_intent_data.metadata` | `{ uid, sku, v: '1' }` | same |
| `customer_email` | token email **only if `email_verified`** | same |
| `success_url` | `<site>/?purchase=ok&sku=<sku>&sid={CHECKOUT_SESSION_ID}` | same |
| `cancel_url` | `<site>/?purchase=cancel&sku=<sku>` | same |
| `consent_collection.terms_of_service` | `required` (needs the Terms URL in Dashboard → Settings → Public details) | `required`: not on Stripe's forbidden list; to confirm in test mode |
| `custom_text.terms_of_service_acceptance.message` | "I agree to the [Terms] and the [Refund policy]. I am 18 or older, or a parent or guardian has agreed to this purchase." (both linked to `<site>/legal/…`) | same |
| `custom_text.submit.message` | "Unlocks <item> on your Point Invaders account straight away. A one-time purchase: it never becomes Points or Credits." | same |
| `adaptive_pricing.enabled` | `true` (per D6) | **omitted**: always on, and passing it is refused |
| `automatic_tax.enabled` | `true` only if Stripe Tax is set up | **omitted** (refused) |
| `managed_payments.enabled` | — | `true` |
| `expires_at` | now + 35 min. Stripe's minimum is 30 min from its own clock; the margin covers clock skew, and a short life keeps duplicate windows short. | same |
| `submit_type`, `locale`, `allow_promotion_codes` | **omitted**: the defaults (`auto`, `auto`, no codes) are what we want, and a parameter never sent is one Managed Payments can't refuse | same |

### 7.2 `POST /webhook`

The raw body bytes (`request.arrayBuffer()`) and the `Stripe-Signature` header, checked with an HMAC-SHA256 in
WebCrypto using the provider's scheme and its default 5-minute tolerance. Bad signature → **400**. Handled, ignored or unmappable → **200**. Any
database or provider failure → **500** (Stripe retries for up to 3 days).

| Event | Condition | Order transition |
|---|---|---|
| `checkout.session.completed` | `mode=payment`, `metadata.v='1'`, `metadata.uid === client_reference_id`, SKU known; `payment_status=paid` | → `paid` (grant), write `pi/<pi>`, clear `rl/<uid>/o/<sku>` |
| | `payment_status=unpaid` (delayed method) | → `pending` |
| `checkout.session.async_payment_succeeded` | | `pending` → `paid` |
| `checkout.session.async_payment_failed` | | `pending` → `failed` |
| `checkout.session.expired` | | clear `rl/<uid>/o/<sku>` |
| `charge.refunded` | `charge.refunded === true` | → `refunded` |
| | partial refund | log only |
| `charge.dispute.created` | (inquiries too) | `paid` → `disputed` |
| `charge.dispute.closed` | `won` or `warning_closed` | `disputed` → `paid` |
| | `lost` | → `lost` |
| any other type, or `livemode` ≠ key mode, or no `metadata.v` (e.g. a Payment Link made in the Dashboard) | | 200, logged, nothing written |

Charges and disputes map back through `pi/<payment_intent>`. If that row doesn't exist yet (a refund seen
before the completion was processed), the Worker falls back to the PaymentIntent's own `metadata`
`{uid, sku}` and `checkout.sessions.list({ payment_intent })` to find the session. The order is then recorded
straight away in its terminal state, so the late completion cannot grant it.

### 7.3 Idempotency

1. **Claim:** a transaction on `shop/events/<id>`:
   - `done` → reply 200 and do nothing (**a replay is a no-op**);
   - `claimed` and under 2 minutes old → 409 (Stripe retries later);
   - missing, or a stale claim → write `{st:'claimed', at}`.
2. **Act:** the monotonic transition from § 5.1, in one transaction. Any provider side effect carries a Stripe
   idempotency key (the duplicate refund uses `dup-refund:<pi>`).
3. **Finish:** set `st:'done'`, **then** reply 200. If step 2 throws, the claim is released (best effort) and
   the reply is 500. A crash between steps leaves a stale claim that the next retry takes over.

This is "record the event id before acting" from the brief. It still never answers 2xx before the write has
landed, and it doesn't lose the event when a write fails.

### 7.4 Duplicates

Reusing open sessions (§ 7.1, step 8) prevents almost all double payments. If a second order for a SKU the
player already holds still reaches `paid`, it is kept as `paid`, flagged `d:1`, and, if
`SHOP_AUTO_REFUND_DUPES` is on, refunded through the API with `reason: 'duplicate'`. The `charge.refunded`
event then closes it. The item stays active through the first order the whole time.

---

## 8. Provider configuration (Stripe)

### 8.1 Products and prices

`scripts/seed-products.js` reads `worker/src/catalog.js`. For each SKU it creates or updates a **product**
(name, description, `tax_code`, `metadata.pi_sku` and `pi_kind`) and a **price** (`unit_amount`, `currency: 'usd'`,
`lookup_key = sku`, `transfer_lookup_key: true`, `tax_behavior: 'inclusive'`). A changed amount creates a new
price and moves the lookup key, and the old price is archived. The mode comes from the key itself
(`sk_test_`/`rk_test_` or `sk_live_`/`rk_live_`). It **refuses a live key without `--live`**, and dry-run is
the default. Test and live prices therefore exist independently, and no price id is ever hard-coded.

Tax code: `txcd_10201000` (Video Games, non-subscription, permanent rights) is the closest eligible code for a
permanent in-game unlock. A browser game is streamed, but no "streamed, permanent" code exists. Please confirm
it with whoever does your tax (§ 14, Q5).

### 8.2 Merchant of record: Managed Payments versus you

| | Stripe, you as merchant | Stripe **Managed Payments** (Link as merchant of record) |
|---|---|---|
| Who owes VAT/GST/sales tax | **you**: register where required. The EU and UK tax digital sales from a non-resident seller from the first sale. | Stripe, in 80+ countries |
| Disputes | you respond | Stripe responds (dispute fees still apply) |
| Buyer support | you | Link support first; Stripe may refund on its own within 60 days, or if you don't answer within 48 h |
| Receipts | Stripe receipts (enable in Dashboard) | sent by Link; statement shows `LINK.COM* …` |
| Your eligibility | wherever Stripe operates | business in US, CA, most of the EU, GB, CH, NO, AU, HK, JP or SG, **after a Stripe eligibility review**; buyers anywhere except CN, CU, IR, KP, RU, SY and a few territories |
| Code difference | — | one param, `SHOP_MANAGED_PAYMENTS`, shapes the session (§ 7.1). The webhook is identical. |

Fees differ: check stripe.com/pricing for your country. Your business is in Singapore, which is on the list, so
the right-hand column applies once Stripe's eligibility review passes (§ 14, Q1; RUNBOOK § 3).

### 8.3 Webhook endpoint

URL `<base>/webhook`. **API version `2026-09-30.endive`**, the version `stripe` 23.0.0 pins, so event payloads
match the code. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`,
`charge.dispute.created`, `charge.dispute.closed`. There is one endpoint per mode, each with its own signing
secret.

`scripts/create-webhook-endpoint.js` creates it with exactly that list, read from the code's own `HANDLED`
set, on that API version. With `--apply` it prints the signing secret alone, with no newline, so it can be
piped straight into `npx wrangler secret put STRIPE_WEBHOOK_SECRET` without appearing on screen (RUNBOOK § 6). It refuses a
live key without `--live`, and refuses to touch an existing endpoint for the same URL unless given `--replace`,
because an existing endpoint's secret can't be read back.

---

## 9. Client (`app.js § 46 · v84`, `index.html`, `style.css`, `sw.js`)

### 9.1 State

```js
const SHOP_API  = '';            // set at Gate 1 from your deploy; '' → the aisle stays hidden
const SHOP_LIVE = false;         // Gate 3 flips this; until then ?shop=beta opts a device in
const SHOP_SKUS = [ … ];         // the client catalogue: sku, name, kind, price label, grants (parity-checked)
const SKU_ITEMS = { colors:[…], cursors:[…], skins:[…], worlds:[…], companions:[…] };
var ENT = { uid:null, items:{}, live:false, ref:null };   // shop/ent/<uid>, mirrored as pi_ent_v1
```

- `shopOn()` = `SHOP_API && (SHOP_LIVE || pi_shop_beta)`: the feature flag. `?shop=beta` sets
  `pi_shop_beta` and `?shop=off` clears it. Both are removed from the address bar with `history.replaceState`,
  the same way `clBoot` and `labBoot` do it (`app.js:51107`, `52834`).
- `shopOpen()` = `shopOn()` and `shop/cfg/open !== false`: whether buying is allowed. The kill switch closes
  buying only.
- `owns(sku)` = `shopOn() && ENT.items[sku] && ENT.items[sku].s === 'active'`. It doesn't depend on `shopOpen()`,
  so closing the shop never takes away what people own.
- **Listener** `entSync()`, called from `enterHub()`. It is idempotent: it attaches `.on('value')` to
  `shop/ent/<uid>` once per uid, for any non-local session with a live `auth.currentUser` matching `user.uid`
  (a guest reads an empty node, which keeps the upgrade path seamless). Each value replaces `ENT.items`,
  writes the mirror `pi_ent_v1 = {uid, at, items}`, and repaints the cosmetics, the open market and the hub.
  A read error such as `PERMISSION_DENIED`, before the rules are pasted, keeps the mirror and logs once.
- **Mirror:** loaded synchronously at `loadUser`/`offlineResume` time for the same uid, so an owned colour
  doesn't flash default on boot. The server copy replaces it the moment it arrives. It is cleared on logout
  and on guest purge (`forgetLocalProfile`, `app.js:3334`).

### 9.2 The shelf

- Tab **🔐 Restricted**, placed **after** the hidden Limited tab, hidden unless `shopOn()`. The grid
  (`style.css:6086`) then lays out as 5 + 5 on desktop with no event running. While `has-event` is set, the
  tab spans a full row (10 + a full row), and on phones it always spans a full row, so the grid never leaves
  an orphan cell. With the flag off, the row renders exactly as today's: the new button carries `hidden`,
  which the grid already skips (`style.css:6088`).
- Panel: the pass card on top, then the cosmetics and the two power-ups, a short note ("One-time purchases.
  They never become Points or Credits, and never change a score on any board.") and links to
  Terms · Refunds · Privacy.
- Card states: **BUY · $1.99** (real-money price label, distinct styling), **EQUIP**, **UNEQUIP**,
  **🎟️ ARM / ARMED** for power-ups, and **SIGN IN TO BUY** for guests.

### 9.3 Buy flow

```
BUY ─▶ checks: shopOn ▸ !isLocalSession ▸ !offlineMode && navigator.onLine ▸ !auth.currentUser.isAnonymous ▸ !owns
        │ local      → toast "Save your progress online first (⚙️ Settings)"
        │ offline    → toast "Purchases need a connection"
        │ guest      → toast "Purchases need a saved account" + open Save Account (same uid afterwards)
        ▼
   purchase sheet (#sku-overlay, the .fb-overlay shell): item, what it unlocks, price, "paid on Stripe's
   secure page", D8 checkbox, Terms/Refunds/Privacy links   [statsEvent _buy_open]
        ▼ CONTINUE
   lsSet pi_buy_pending {sku, at} · getIdToken(true) · POST /checkout (15 s timeout: cold start + Stripe)
        │ 409 owned / owned_pending → "Already yours: unlocking…" (+ Restore)
        │ 429 → "One moment: try again in a few seconds"     │ 503 → "The Restricted aisle is closed right now"
        │ network / 5xx → "Couldn't reach checkout. Nothing was charged."
        ▼ 200 {url}                                            [statsEvent _buy_start]
   location.assign(url)
```

### 9.4 Return flow

- **Boot** (`shopBoot()`, called at the end of § 46's own wiring block, the way § 22 and § 25 call `clBoot()`
  and `labBoot()` at `app.js:51225` and `54274`, so no existing code changes): read `purchase`, `sku`, `sid`;
  store them in `sessionStorage pi_buy_ret`; **immediately** `history.replaceState` to the clean address
  (canonical `https://pointinvaders.com/`).
- **After the hub opens** (`shopHub()` from `enterHub`):
  - `ok`: toast "Confirming your purchase…", then wait for `owns(sku)` through the listener for up to **20 s**.
    → "✅ <item> unlocked" + `snd('purchase')` + `_buy_ok`; or, on timeout, "Still processing. It will appear
    on its own, or use ⚙️ Settings → Restore Purchases. Ref …<last 6 of sid>".
  - `cancel`: toast "Checkout cancelled. Nothing was charged." + `_buy_cancel`, and clear the pending marker.
- **The listener does the real work.** Whenever ENT changes and `pi_buy_pending` names a SKU that is now
  owned, the unlock toast fires and the marker clears, whether or not a return URL was seen. This is what makes
  installed apps work, whatever the platform does with the out-of-scope checkout page. The behaviour I expect
  is below; it is unverified until your Gate 2 device run.
  - On **Android**, checkout opens in a Custom Tab over the installed app, and the app's own listener sees the
    grant.
  - On **iOS (home-screen app)**, the return lands in an in-app Safari view whose storage is separate, so it
    isn't signed in. That view shows a banner on the auth screen in the challenge-link slot: "✅ Payment
    received. Return to Point Invaders: your item is waiting on your account." The app picks the grant up when
    it is next in front.
- The pending marker expires after 24 h.

### 9.5 Restore Purchases (Settings → 🔐 Purchases)

A one-shot `once('value')` on `shop/ent/<uid>` with `withTimeout`, which replaces ENT and the mirror, then a
toast: "Restored N items" or "No purchases on this account". The section also lists each order (date, item,
amount, status) from `shop/orders/<uid>`, the support email, and the three legal links. Painted by a hook at the
end of `paintSettings()` (`app.js:46709`). Hidden unless `shopOn()`.

### 9.6 Supporter chip

`supChip(uid)` → `<em class="lb-sup" title="Supporter">◆</em>`, from a cache of one `shop/badge` read
(refreshed when older than 60 s, read at most once per board load). It shows on `lbRows` (`app.js:8060`),
`laneRow` (`app.js:44745`) and the player card (`app.js:47954`). A failed read shows no chips and nothing else
changes.

### 9.7 Exhibition rounds (hooks)

| Hook | What it adds |
|---|---|
| `prepGame` (`app.js:3690`) | `exhibArm(gid)`: if a toy is armed, owned, and the round is plain (the `bntyArm` predicate), the round becomes Exhibition. No chaos roll or Heat, and `vsResultTap = exhibTap` at the countdown, as Lab does. |
| `survivedFatal` (`app.js:16540`) | in an Exhibition round with Aegis: absorb, `toast('🛡️ AEGIS ABSORBED')`; never spend a Credits shield |
| `powerConsume` (`app.js:17161`) | refuses in an Exhibition round (Credits consumables are never spent on a round that pays nothing) |
| `paintPowerDock` (`app.js:17213`) | in an Exhibition round, shows **⚓ +10s** (Chrono Anchor) instead of the Credits kit; pressing it uses the Time Dilator's own clock door (`roundClockAdd` / `_clockSkip`) |
| `Ghost.begin` / `beginPace` | skip in Exhibition, as for Lab: no ghost or pace best is recorded from a shielded run |
| `exhibTap` | stops the round and shows the EXHIBITION card (§ 3.3). **Nothing is banked.** |

### 9.8 All hooks into existing code

Each hook is one or two lines, `typeof`-guarded, and commented `// v84 — 🔐 § 46`:
`findItem` (`app.js:5996`), the cursor tier in `applyEquippedCosmetics` (`app.js:6157`), `openMarket` (`6206`),
`shopCardEl` (`6328`), `renderShop` (`6392`), `handleShopAction` (`6405`), `lbRows` and `loadLeaderboard`
(`8060`/`8084`), `laneRow` (`44745`), `renderPlayerCard` (`47954`), `applyLoadout` (`44905`), `cmpKnown` and
`cmpState` (`70007`/`70025`), `enterHub` (`3440`), logout (`3381`), `forgetLocalProfile` (`3334`),
`paintSettings` (`46709`), `window.openSaveAccount` (beside `app.js:18702`), and the exhibition hooks in § 9.7.
Boot needs no hook (§ 9.4). Optional: one Dossier line in `renderDossier` (`5339`) and one ARC line after the
tour's `mk-tabs` step (`72823`), both flag-gated (the ARC line marked `opt:1`).

### 9.9 Fail-safe matrix (non-negotiable 11)

| Condition | Aisle | Buying | Owned items | ◆ chips | Play |
|---|---|---|---|---|---|
| flag off / `SHOP_API` empty | hidden | inert | not resolved: defaults drawn | none | **as today** |
| API unreachable | shown | toast, nothing charged | drawn | shown | as today |
| `shop/ent` read refused (rules not pasted) | shown, nothing owned | server still grants; the client can't see it, so it says so and points at Restore | defaults | none | as today |
| offline | door blocked (the event banner can still open it) | refused | from the mirror | boards are offline anyway | as today |
| local session | — | refused: "save first" | — | — | as today |
| guest | shown | opens Save Account | — | — | as today |
| `shop/cfg/open = false` | "closed" | refused (client and server 503) | drawn | shown | as today |

### 9.10 Service worker and stamps

- `BYPASS` gains `workers\.dev|stripe\.com` (Phase 2). POSTs already bypass, since `sw.js:64`
  skips non-GET; this covers any GET and documents the hosts.
- Navigation caching **was fixed in Phase 1**: only a successful navigation to the arcade itself (the scope
  root or `index.html`, with any query) is stored as the offline shell (§ 2, item 11).
- A version bump moves **seven strings** together: `CACHE` and the three `SHELL` stamps in `sw.js`, the two
  stamps in `index.html` (`style.css`, `app.js`), and `PI_ASSET_FILES` in `app.js:24408` (§ 2, item 16).
  Phase 1 used **v84** for the service-worker fix. If this branch reaches `main` before Phase 2 (for example
  so Stripe's review can see the legal pages), the client ships as **v85** and the section is tagged
  `§ 46 · v85`. Otherwise it stays v84, because no device has cached v84 yet.
- No new SDK scripts. Calls use plain `fetch` and the ID token, so `VENDOR` is unchanged.

---

## 10. Security and privacy

| Threat | Control |
|---|---|
| A client forges an entitlement or badge | `shop/*` has no client write rule; only the Worker's admin token writes. Rules tests prove it. |
| The database key leaks | Only one role (Realtime Database Admin); kept only as a Cloudflare secret, never in the repository or on screen; Cloudflare two-factor sign-in recommended; delete and replace the key in Google Cloud IAM if it is ever exposed (RUNBOOK, Undo). It still grants the whole database, which is the price of D2. |
| Spoofed webhook | Signature check on the raw body with the endpoint secret, 400 otherwise |
| Replayed webhook | `events/<id>` claim/done, plus monotonic order states |
| Buying for someone else's uid | uid comes only from the verified token; the body is `{sku}` only |
| Price tampering | the client never sends a price; the server resolves it by lookup key |
| Open redirect | success and cancel URLs are built from an allow-listed origin only |
| CSRF | bearer token in a header, not a cookie; strict CORS allow-list |
| Guest buys, then the record is deleted | anonymous providers get 403; buying needs a saved account (same uid after upgrade) |
| Test and live mixing | separate keys, secrets and endpoints per mode; `lm` stored; livemode-mismatched events ignored; test grants purged at go-live |
| Leaked secret key | Cloudflare's secret store only. `.gitignore` covers `.dev.vars*`, `.env*`, service-account JSON files, `*.local` and `node_modules`. Before every commit the diff is grepped for `sk_live`, `sk_test`, `rk_live`, `rk_test`, `whsec_` and `private_key`; each hit is read by hand, because these docs name the prefixes. A stricter pattern for real key shapes (`(sk\|rk\|pk)_(live\|test)_[0-9A-Za-z]{10,}`, `whsec_[0-9A-Za-z]{10,}`, and a PEM header `-----BEGIN [A-Z ]*PRIVATE KEY-----`) must come back empty. The function uses a **restricted key** (`rk_…`) limited to Checkout Sessions (write), Refunds (write), and Prices, Products, PaymentIntents and Charges (read). That covers the seven calls the code makes (`checkout.sessions` create/retrieve/list, `prices.list`, `refunds.create`, `paymentIntents.retrieve`, `charges.retrieve`). Products (read) isn't called directly and is kept as a margin. Disputes arrive inside the signed event, so no Disputes permission is needed. |
| Cost blow-up | None possible: the free plan has hard limits and no card. Past 100,000 requests a day the Worker refuses until the next day; the game carries on, and Stripe retries webhooks for 3 days. Also a per-uid 10 s limit on new sessions. |
| Supply chain | exact dependency versions and a committed `package-lock.json` |
| Card data | never touches our pages (hosted checkout redirect; no Stripe.js), which is the lightest PCI scope: self-assessment SAQ A |

**Privacy.** The site has **no privacy policy, terms or cookie notice today** (searched `index.html` and
`app.js`). `legal/privacy.html` therefore has to describe the whole arcade, not just payments: Firebase Auth,
the public boards and player cards, the grid chat, the feedback form (archived to the database and emailed
through Formspree with uid, user agent and screen size), anonymous play counters, localStorage, Google Fonts
and gstatic, plus Stripe and Link for payments and the public supporter chip. It was drafted from the code in
Phase 1 (§ 11). It is not legal advice and should be reviewed.

---

## 11. Legal pages

**Drafted in Phase 1.** `legal/terms.html`, `legal/privacy.html` and `legal/refunds.html` are standalone
static pages in the arcade's look: `#04040e`, Orbitron/Rajdhani, neon accents, inline CSS, no scripts. Each
has a "← Back to the arcade" link and links to the other two. The game will open them with
`target="_blank" rel="noopener"` (Phase 2), so an installed full-screen app (no browser chrome) never gets
stuck on one.

Your Gate 0 answers are filled in: the support email `cat9748912@gmail.com`, Singapore (law and courts, and
the PDPA in the privacy policy), Link as merchant of record, D7's 14-day refund, and D8's 13+ with a guardian's
permission under 18. Two placeholders remain, **⟦BUSINESS NAME⟧** (terms and privacy) and **⟦EFFECTIVE
DATE⟧** (all three). Each page carries a DRAFT banner until they are filled in. The privacy policy covers the
whole arcade, not only payments (§ 10).

The EU/UK rule for digital content is that the 14-day withdrawal right ends at immediate delivery **only** if
the buyer agreed to that. D7's 14-day goodwill refund makes this moot. The checkout consent text is worded so
it stays valid if you ever tighten D7. These drafts are not legal advice; have them reviewed.

---

## 12. Operations preview (written in Phase 3)

The go-live order:
1. Live secrets.
2. Live webhook (API version above).
3. Live seeding (`--live`).
4. Managed Payments terms accepted, if chosen.
5. Purge test grants.
6. `SHOP_LIVE = true`, with the next free version number (§ 9.10).
7. Merge.
8. A real purchase and refund by you.

Rollback is `shop/cfg/open = false` and then the flag; the Worker can keep running. `OPERATIONS.md` will
cover adding a SKU, changing a price, handling a dispute and reconciling (a script that compares Stripe's paid
sessions with `shop/orders` and repairs badges).

---

## 13. Verification: summary

Full ledger in [`TESTING.md`](TESTING.md). The brief makes **32 claims**. After Phase 1:

- **30 hold as written.** Among them, the live site is byte-identical to `main` (`94571c2`), checked by
  fetching it. The three rules claims (B29–B31) were unseen at Gate 0; they are now **proven by execution**
  against your rules file in the Database emulator.
- **2 hold with a difference:** the market tab row is a CSS grid now (B20), and the third `?v=` stamp lives
  in `app.js`, not `index.html` (B7; § 2, item 16).

Beyond the brief, the audit recorded **12 code findings** and **5 external facts**. One of those facts is the
Node 20 decommission. All of them feed § 2. Of the **6 items only you or a live run could confirm**:

1. your live database rules: **resolved**, you pasted them;
2. whether the `stats` rule accepts `_buy_*` keys: **resolved**, it does (emulator);
3. whether any rule above `shop` grants access: **resolved**, none does (emulator);
4. your business country: **Singapore**; Managed Payments eligibility still waits on Stripe's review;
5. whether `neal-with-roblox` is on the Blaze plan: **resolved**. It isn't, and won't be; the server moved to
   Cloudflare (§ 2, item 18);
6. live Stripe behaviour: Managed Payments plus `consent_collection`, the iOS and Android installed-app
   returns. **One part is resolved:** a guest who saves an account gets a token whose `sign_in_provider` is
   `password`, so the server lets them buy (Auth emulator). The rest needs test keys or a device: Gate 2
   (your manual test-mode run) and Gate 3 (live).

What ran here: the **Auth and Database emulators**, the Worker's own bundle in **Cloudflare's local runtime
(workerd)** against them, the handler unit tests (a fake Stripe client with real signature generation), the rules
tests against your file, and Chromium for the service worker and the legal pages. Stripe's API can't be called without keys, so session creation is tested against a fake that
asserts the exact parameters in § 7.1.

---

## 14. Open questions: answered at Gate 0

You approved every recommendation ("i approve"), named your country and support email, and pasted the rules.
The answers are kept here, next to the questions they settle.

| # | Question | Answer |
|---|---|---|
| Q1 | D1: business country, and Managed Payments? | **Singapore; Stripe Checkout with Managed Payments**, because you want the provider to handle taxes. Stripe's eligibility review is still to come (RUNBOOK § 3). If Stripe declines, we stop and decide. |
| Q2 | The rules file | **Pasted.** `database.rules.json` is that file plus the `shop` block (§ 6). |
| Q3 | Server files on `main` are public (§ 2, item 10) | **Accepted.** They contain no secrets, and Firebase's model assumes rules are known. |
| Q4 | D4 catalogue (§ 3.1) | **Approved**: nine SKUs. `skin_seraph` became `skin_unicorn` before anything was seeded, so the permanent id matches the name. Names, hexes and emoji stay yours to change at any time (the seed script updates names); a SKU id is permanent once seeded. |
| Q5 | D6 prices, tax-inclusive pricing, tax code | **Approved.** The tax code `txcd_10201000` still needs a nod from whoever does your tax. |
| Q6 | Auto-refund duplicate payments? | **Yes** (`SHOP_AUTO_REFUND_DUPES`, on by default). |
| Q7 | Exhibition power-ups: unlimited, or a daily charge? | **Unlimited** (§ 3.3). |
| Q8 | Beacon companion | **Deferred.** The pass ships with the chip and the Patron colour. |
| Q9 | D8 audience | **13+, with a parent or guardian's permission under 18**: in the terms, the checkout consent text, and the purchase sheet's checkbox (Phase 2). If your audience skews young, take legal advice: the arcade already collects emails and persistent ids, so children's-privacy rules would apply beyond payments. |
| Q10 | D7 refunds | **Approved:** 14 days, no questions asked. A refund or chargeback removes the item; a won dispute restores it. |
| Q11 | `shop/cfg` kill switch (§ 5.5) | **Yes**, it is in the rules block. |
| Q12 | `badge` read | **`true`**, which matches `players` in your file. |
| Q13 | Support email | **`cat9748912@gmail.com`**: on the legal pages, and in RUNBOOK § 3 for Stripe's public details. |
| Q14 | D9: who deploys | **You**, from your machine, following `RUNBOOK.md`. |

---

## 15. Phase plan

| Phase | Builds | Verified by | Gate asks you for |
|---|---|---|---|
| **0** ✅ | `DESIGN.md`, `TESTING.md` | reading the code; npm/Java/Node checks; Stripe and Google docs | the answers in § 14 and the rules file: **received** |
| **1** ✅ (this) | `worker/` (the Cloudflare Worker: handlers, catalogue, REST clients, tests; it was `functions/` until Gate 1), `database.rules.json`, `firebase.json`, `.firebaserc`, `.gitignore`, `scripts/seed-products.js`, `scripts/catalog-parity.js`, `scripts/create-webhook-endpoint.js`, `legal/*.html` drafts, `RUNBOOK.md`; moved forward from Phase 2: the `sw.js` navigation fix and the v84 stamps | 67 unit tests; 63 more against the Auth and Database emulators, your rules file included; 9 end-to-end tests of the real bundle in Cloudflare's local runtime; the service worker and legal pages in Chromium; secret greps | the RUNBOOK: published rules, a service-account key, the Worker deployed and its address, test-mode seeding, the webhook. Also the business name and effective date for the legal pages. |
| **2** | `app.js § 46` and hooks, `index.html`, `style.css § 46`, `sw.js` `BYPASS` and the stamps (v84, or v85 if this branch has reached `main`; § 9.10) | Playwright against the Auth, Database and Functions emulators (buy-flow states, offline, guest, a flag-off screenshot diff of the market against `main`); reasoning where Stripe is needed | your manual test-mode run (test card `4242 4242 4242 4242`, refund in the Dashboard → item disappears) |
| **3** | go-live checklist, rollback, `OPERATIONS.md`, `scripts/purge-test-grants.js`, reconcile script | dry runs against the emulator | live secrets, live seeding, the flag flip, a real purchase and refund |
