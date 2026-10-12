# Point Invaders — direct-payment monetisation

**A brief for a Claude Opus 5.5 (max effort) session, plus your own checklist.**

Prepared 2026-10-12 from the code on branch `claude/keen-archimedes-xlcunn` (commit `94571c2`).
Part 1 is for you. Part 2 is the prompt you paste into Claude Code. Part 3 is how to run the session.

---

## Part 1 — For you

### 1.1 Three facts about the code that decide the design

1. **The game is a static site with no server of its own.** GitHub Pages serves `index.html`, `app.js`, `style.css`, `sw.js` at pointinvaders.com. There is no build step and no `package.json`. Accounts and every piece of player data live in Firebase (project `neal-with-roblox`: Auth + Realtime Database in `asia-southeast1`). Payments need a server to create checkout sessions and to receive the provider's "this was paid" callback, so this project gains its first backend code.

2. **The whole economy is written by the browser.** Credits, owned cosmetics and power-up counts are written straight to `players/<uid>` by `app.js`; the code calls it an "honour system" in several places. That is fine for a free economy. It is not fine for anything people pay for, because anything the browser can write a cheat can write. **Every paid item must be recorded by your server, in a database path the browser can only read.**

3. **Credits convert to Points both ways (1 CR = 100 PTS), Points are the leaderboard rank, and Credits can be staked on Bounties.** If money could buy Credits, money would buy leaderboard rank. **Real money must never become Credits or Points.** Paid things are separate unlocks that live outside the Credits wallet.

Everything in the prompt follows from those three.

### 1.2 Decisions you must make (fill in before you start)

The prompt has a decision table at the top. Here it is with recommended defaults. Accept the defaults or change them, then copy your answers into the prompt.

| # | Decision | Recommended default | Why |
|---|----------|--------------------|-----|
| D1 | Payment provider | **Stripe Checkout** (hosted page; no card fields on your site) | Lowest fees, best docs, Firebase-friendly. Pick **Paddle** or **Lemon Squeezy** instead if you want a merchant of record to handle worldwide sales tax/VAT for you (higher fee, zero tax admin). |
| D2 | Where the server code runs | **Firebase Cloud Functions (2nd gen)** in the existing `neal-with-roblox` project | Same project as the database, Admin SDK works with no key files, secrets manager built in. Needs the project on the **Blaze** (pay-as-you-go) plan; the free quota covers a small shop at ~$0/month. Alternative: a Cloudflare Worker holding a service-account key. |
| D3 | What is sold in v1 | **One-time unlocks only. No premium currency, no subscriptions.** | Simplest server logic, simplest refunds, no virtual-currency rules. Currency and subscriptions can come in v2. |
| D4 | The v1 catalogue | (a) **Black Market Clearance** supporter pass: board badge, wearable title, exclusive companion + colour. (b) A **Restricted shelf** of 6–8 exclusive cosmetics sold individually (skins, colours, cursor, exit state, world, music drive). (c) 2–3 **exclusive power-ups** (see D5). | Cosmetics are safe to sell. The pass is the easiest first SKU. |
| D5 | How exclusive power-ups work | **Permanent abilities with a daily charge, and none of them may change points, time or difficulty of a board-eligible run.** Examples: Second Wind (replay a failed mission once a day without losing streak/contract progress), Field Kit (kit restocks one of each consumable per UTC day), Deep Pockets Prime (kit cap +9). | Anything that raises score for money is pay-to-win on public boards and attracts chargebacks. If you *do* want score-affecting paid power-ups, the alternative rule is: runs that used one are excluded from every public board and say so on the results card. Choose one rule. |
| D6 | Prices and currency | Pass $4.99; cosmetics $1.99–$3.99; power-ups $2.99; priced in USD with Stripe's adaptive pricing on | Placeholders. You decide. |
| D7 | Refund policy | 14 days, no questions, if the item has not been equipped/used; otherwise no refunds on digital goods; chargeback = item revoked | Stripe requires a stated policy. Keep it short and honest. |
| D8 | Minimum age | 18, or 13+ with a parent's permission, stated in the Terms | Minors' purchases are the commonest chargeback source. |
| D9 | Who deploys the server code | **You**, from your own machine with the Firebase CLI, following Claude's runbook | Keeps live credentials off the cloud session. Alternative: give the session a test-mode Stripe key and a Firebase deploy token as environment secrets and let Claude deploy. |
| D10 | Rollout | Ship to main behind a flag (`?shop=beta` / `localStorage.pi_shop_beta`) in Stripe **test mode**, test a real purchase on pointinvaders.com with a test card, then flip to live | GitHub Pages only serves `main`, so this is how you test on the real domain safely. |

### 1.3 What YOU need to do

**Before the session — accounts and paperwork**

1. **Payment provider.** Create the Stripe account (or Paddle/Lemon Squeezy). Complete identity/business verification and add a bank account; live mode is blocked until that is done. Note which country/entity you are selling as.
2. **Tax.** Digital goods are taxed where the buyer lives in many places (EU/UK VAT, AU/NZ/SG GST, some US states). Either turn on Stripe Tax and register where it tells you to, or use a merchant of record (D1) and skip this. Get real advice for your country; this document is not it.
3. **Firebase.** Upgrade `neal-with-roblox` to the Blaze plan (needs a card; set a budget alert of, say, $10). Install the Firebase CLI on your machine (`npm i -g firebase-tools`, `firebase login`).
4. **Your current database rules.** The code says the rules enumerate the allowed top-level nodes and that a copy lives in `_firebase/database.rules.json` beside the project, which is **not in the repo**. Copy the full current rules from Firebase Console → Realtime Database → Rules and paste them into the prompt where marked. Claude cannot extend rules it cannot see, and the rules are the only thing standing between a cheat and a free item.
5. **Legal pages.** The site currently has no Terms, Privacy Policy or Refund Policy. Claude will draft them as static pages; you must read them, fix anything untrue, and ideally have someone qualified look at them. Their URLs go into the Stripe dashboard.
6. **Prices and names.** Fill in D4–D8 above.

**Before the session — the Claude Code environment**

7. Start the session on this repo, on branch `claude/keen-archimedes-xlcunn` (or a fresh branch off `main`). Model: Opus 5.5. Effort: max.
8. Network policy: allow `registry.npmjs.org`, `api.stripe.com`, `*.googleapis.com`, `*.firebaseio.com`, `*.firebasedatabase.app`, `*.cloudfunctions.net`, `*.run.app`, `github.com` (or use the unrestricted policy).
9. Setup script (optional, lets Claude run the emulators and tests in-session): install Java 17 (the Realtime Database emulator needs it), `npm i -g firebase-tools`, and the Stripe CLI.
10. Secrets (optional, only if you chose "Claude deploys" in D9): `STRIPE_SECRET_KEY` = a **test-mode** restricted key, `STRIPE_WEBHOOK_SECRET` from `stripe listen`, and a Firebase deploy credential. Never put a live key in a cloud session. Never paste any key into the chat.

**During the session — the four gates**

Claude stops at each gate and tells you exactly what it needs. Expect:

- **Gate 0 (design):** read `docs/monetisation/DESIGN.md`, confirm or change the decisions.
- **Gate 1 (server + rules ready):** paste the new rules block into the Console and Publish; run `firebase deploy --only functions`; set the two secrets with `firebase functions:secrets:set`; create the webhook endpoint in the Stripe dashboard (test mode) pointing at the deployed function URL; run the product-seeding script in test mode; give Claude the function base URL.
- **Gate 2 (client ready):** after merge to main, open `https://pointinvaders.com/?shop=beta` with a non-guest account and buy something with card `4242 4242 4242 4242`. Confirm the item unlocks, the entitlement shows in the Console, and a test refund revokes it.
- **Gate 3 (go live):** switch the secrets to live keys, create the live webhook endpoint, seed live products, flip the flag, bump the cache version, merge. Buy one real item yourself and refund it.

**After launch — ongoing**

- Watch the Stripe dashboard for disputes (respond within the deadline; you have the order log).
- Keep a support email address on the legal pages; most refund requests arrive there, not through Stripe.
- Every time you change prices or SKUs: update both catalogue copies (server and client; a test checks they match), re-run the seeding script, bump the cache version.
- Monthly: reconcile `shop/orders` in the database against Stripe payouts.

### 1.4 What Claude will do (summary of the prompt)

1. Audit the code paths that matter (auth, profile schema, the Black Market, service worker, rules constraints) and write a design document; stop at Gate 0.
2. Build `functions/` (checkout-session endpoint, webhook endpoint, catalogue, product seeder, secrets wiring, emulator config) with unit tests, and the full `database.rules.json` with the new `shop` block, plus a deploy runbook; stop at Gate 1.
3. Build the client: a 🔐 Restricted shelf in the Black Market, entitlement loading with an offline mirror, the buy → redirect → return → unlock flow, a Restore Purchases button, the supporter badge on boards and player cards, the exclusive power-ups, the beta flag, legal pages, service-worker bypasses and cache bump, funnel counters; stop at Gate 2.
4. Harden and verify: rules tests, webhook idempotency/signature/refund tests, catalogue-parity check, emulator end-to-end run, manual test-card runbook; stop at Gate 3 with a go-live checklist.

---

## Part 2 — The prompt

Copy everything between the two horizontal rules below into the Opus session as the first message. Fill in the `<<…>>` placeholders first.

---

You are implementing **direct-payment monetisation for Point Invaders**, a browser arcade in this repository. Players will pay real money, through a hosted checkout page, for exclusive items in the game's existing Black Market: a supporter pass, a shelf of exclusive cosmetics, and exclusive power-ups. Not ads. Not subscriptions. Not a premium currency (v1).

You are Opus 5.5 running at maximum effort. Use it: read widely before you design, verify every assumption below against the code, keep a running list of things you could not verify, and do not cut scope silently. Where a decision is mine, stop at the gate and ask; where it is routine, decide and note it.

### My decisions

| # | Decision | Answer |
|---|----------|--------|
| D1 | Payment provider | <<Stripe Checkout / Paddle / Lemon Squeezy>> |
| D2 | Server runtime | <<Firebase Cloud Functions 2nd gen in project neal-with-roblox / Cloudflare Worker>> |
| D3 | Product model | One-time, non-consumable unlocks only. No currency, no subscriptions. |
| D4 | v1 catalogue | <<e.g. supporter pass + 6–8 Restricted cosmetics + 2–3 exclusive power-ups; or "propose one at Gate 0">> |
| D5 | Paid power-up rule | <<A: paid power-ups never change points, time or difficulty of a board-eligible run / B: runs that used a paid power-up are excluded from all public boards and say so>> |
| D6 | Prices / currency | <<e.g. pass $4.99, cosmetics $1.99–$3.99, power-ups $2.99, USD, adaptive pricing on>> |
| D7 | Refund policy | <<e.g. 14 days if unused, otherwise none; chargeback revokes>> |
| D8 | Minimum age | <<18, or 13+ with guardian consent>> |
| D9 | Who deploys | <<I deploy from my machine with the Firebase CLI / you deploy using the secrets in this environment>> |
| D10 | Rollout | Ship to `main` behind a beta flag in Stripe test mode first, then flip to live. |

My current Realtime Database rules, copied from the Firebase Console (extend these; never replace what is there):

```json
<<PASTE THE FULL CURRENT RULES FILE HERE>>
```

### Facts about the codebase (verified on commit 94571c2; re-verify, then build on them)

**Shape of the project**
- Static site, GitHub Pages, custom domain `pointinvaders.com` (`CNAME`). `main` is what the public gets. No build step, no bundler, no framework, no `package.json` at the root, no tests, no CI, no `.github/`.
- Four real files: `index.html` (~1.9k lines), `app.js` (~73k lines, every feature in one file, organised in numbered `§` sections with long prose comments and a `vNN` version tag per feature), `style.css`, `sw.js`. Plus `assets/ship62.js`.
- `sw.js` precaches `./app.js?v=83`, `./style.css?v=83`, `./assets/ship62.js?v=83` and names cache `point-invaders-v83`. **The `?v=` stamps in `index.html` and `sw.js` and the `CACHE` constant must be bumped together on every deploy** (the comments in `sw.js` explain why). A `BYPASS` regex keeps Firebase traffic out of the cache; your API host and the payment provider's hosts must be added to it.
- Firebase compat SDK 9.23.0 is loaded from gstatic in `index.html` and precached by the service worker's `VENDOR` list. Adding another SDK script means adding it to both. Prefer calling your endpoint with plain `fetch` and a Firebase ID token in the `Authorization` header, so no new SDK is needed.
- The Firebase web config is at the top of the Firebase section in `app.js` (`const FB = {...}`, project `neal-with-roblox`, database `https://neal-with-roblox-default-rtdb.asia-southeast1.firebasedatabase.app`). It is public by design.

**Identity**
- Three kinds of session: a **local** session with no Firebase identity at all (`isLocalSession()`, uid rejected by rules), an **anonymous guest** (`signInAnonymously`, `user.isGuest === true`), and a **registered account** (email/password or Google). Guests upgrade with `linkWithCredential` / `linkWithPopup` in the Save Account modal (`openUpgrade`, `upgrade`, `upgradeGoogle`, around the `btn-save-acct` handler), **which keeps the same uid**. A local session is first turned into an anonymous guest by `claimLocalAccount()`.
- **A guest's `players/<uid>` record is deleted when their connection ends** (`gcPledge` sets `onDisconnect().remove()`), and `purgeGuestAccount()` deletes the identity. **Therefore guests, local sessions and offline mode must not be able to buy.** The buy button for a guest opens the Save Account modal instead.
- Offline mode: the profile is mirrored to `localStorage` (`pi_profile_v1`, `cacheProfile`, `readCachedProfile`) and the boot path races the database against a 6 s clock (`withTimeout`, `NET_WAIT`). Entitlements need the same mirror so a supporter's items still show offline.

**The economy and the Black Market**
- Profile schema: `ensureUserDefaults()`. Wallet is `credits`; cosmetics are `owned.<category>` (arrays of ids) and `equipped.<category>`; consumables are `powerups.<id>` counts. All written by the client through `saveProfilePatch(patch)` (an `update()` on `players/<uid>`, skipped for local/offline sessions, held for not-yet-whole guest records via `gcHold`).
- Catalogue: `SHOP_ITEMS` (categories `colors`, `cursors`, `skins`, `powerups`, `drives`, `exits`, plus `worlds` and `companions` added later in the file). Item flags: `default`, `earned`, `consumable` (+`stack`), `event:'haunt'|'coldboot'` (seasonal, shown on a Limited tab by `renderEventShelf`). Pricing/rarity helpers: `priceOf`, `featuredIds`, `getRarity`, `findItem`. Rendering: `renderShop(cat)`, `shopCardEl(cat,item)`, `bindShopButtons`, `handleShopAction(act,cat,id)`, `openMarket`, `switchMarketTab`, `refreshMarketBalances`, `applyEquippedCosmetics`. Markup: `#market-screen`, `.market-tabs`, `#panel-<cat>`, `#shop-<cat>` in `index.html`; CSS near `.market-tab` in `style.css`.
- Companions are written to the database as their own child writes (`cmpPush`) because the live rules did not name those keys; it is the house pattern for "a key the rules may not know yet".
- **Conversion runs both ways** (`btn-conv-to-credits`, `btn-conv-to-points`, `CONV_RATE = 100`), and Points are the public rank. Credits are also staked in Bounties (`§ 42`). This is why paid goods must live entirely outside `credits`, `totalPoints`, `owned.*` and `powerups.*`.
- Power-up kit: `powerHeld`, `powerConsume`, `stackCapFor`, `paintPowerKit`, `paintPowerDock`, `grantRandomConsumable`; the in-game dock is hidden in duels (`mp`) and speedruns (`spdOn()`). `runOverclock` marks an overclocked round. A daily-recharge pattern already exists for the Chrono Reserve perk (`perkDay`, UTC day key) and is the right model for paid power-ups with a daily charge.
- Leaderboards are derived client-side from a broad read of `players` (`loadLeaderboard`, `laneRow`, the Rival board, the lane boards). Titles are shown only when the record also holds the achievement. A supporter badge needs a path other players can read and the owner cannot write.
- `statsEvent(key)` increments public counters under `stats` (rules constrain key shapes); use it for a purchase funnel.
- There is a Formspree feedback relay (`sendFeedback`) and nothing else that talks to a server.

**The database rules (critical)**
- The rules **enumerate the top-level nodes** (`players`, `feedback`, `daily`, `rooms`, `live`, `stats`, `lab`, …); any other top-level write fails with `PERMISSION_DENIED`. A new node needs a new rules block, pasted in the Console by me.
- Some records have **validated shapes** (for example `weekly` must be exactly `{season, pts}`), and a refused key takes down the whole `update()` it rides in. Keep new client-written keys out of multi-key updates until the rules are known to accept them (the `cmpPush` pattern).
- A rate-limit rule refuses any `totalPoints` increase not stamped with a server `lastScoreAt` within 2.5 s. You will not be touching `totalPoints`.
- **Realtime Database rules cascade: once a parent path grants `.write`, a child rule cannot revoke it.** `players/<uid>` is owner-writable, so **nothing paid may be stored under `players/<uid>`.** All paid state goes in a new top-level node (call it `shop`) whose children are admin-only for writes.

### Non-negotiables

1. **Server-authoritative entitlements.** The browser never writes anything that unlocks a paid item. Grants and revocations are written only by the webhook handler with the Admin SDK.
2. **Money never becomes Credits or Points.** No SKU grants `credits`, `totalPoints`, consumable counts or anything convertible to them. Paid items cannot be staked, converted, traded or refunded into Credits.
3. **No payment details on our pages.** Hosted checkout only (redirect). No Stripe.js, no card fields, no provider script in `index.html`. This keeps us in the lightest PCI scope.
4. **Guests, local sessions and offline mode cannot buy.** The checkout endpoint rejects tokens whose `firebase.sign_in_provider` is `anonymous`.
5. **Webhooks are verified on the raw body and are idempotent.** Record each provider event id before acting; a replay is a no-op; respond 2xx only after the database write succeeds. Handle refunds and disputes by revoking.
6. **No secrets in the repository, ever.** Keys live in the Functions secret manager (or the provider's equivalent). Add a `.gitignore` for `functions/.env*`, service-account files and `node_modules`. Grep the diff for `sk_live`, `sk_test`, `whsec_`, `private_key` before every commit.
7. **Do not add a top-level database node other than `shop`**, and only with the rules block I paste. Do not change any existing rule's meaning.
8. **Do not deploy, create live products, or touch live mode** unless I say so at a gate. Do not push to `main`; push to the working branch and tell me.
9. **Keep offline play, the service-worker coupling and the house style intact.** Vanilla JS, one `app.js`, a new numbered `§` section with the same comment voice as its neighbours, version tag `v84` (or the next free number; check), all three `?v=` stamps and `CACHE` bumped together, no framework, no bundler for the client.
10. **Paid power-ups follow rule D5 exactly.** If A: none may change points, time or difficulty of a board-eligible run. If B: a run that used one is flagged and excluded from every public board, and the results card says so.
11. **Fail safe.** If the entitlement read fails, the API is unreachable, or the flag is off, the game must behave exactly as it does today. The shop must never block play.

### Architecture (build this; refine details in the design doc)

**Server (`functions/`, Node 20, plain JavaScript with JSDoc to match the repo)**
- `POST /checkout` — CORS allow-list (`https://pointinvaders.com`, the GitHub Pages origin, `http://localhost:*`). Verifies `Authorization: Bearer <Firebase ID token>` with the Admin SDK; 403 for anonymous providers; validates `sku` against the server catalogue; 409 if already owned; per-uid rate limit (one session per ~10 s, recorded under `shop/rl/<uid>`); creates a Checkout Session: `mode: 'payment'`, one line item resolved by **price lookup key = sku** (so test and live modes each carry their own prices and no price ids are hard-coded), `client_reference_id: uid`, `metadata: {uid, sku, v: 1}`, `customer_email` from the token when present, `success_url: https://pointinvaders.com/?purchase=ok&sku=<sku>&sid={CHECKOUT_SESSION_ID}`, `cancel_url: https://pointinvaders.com/?purchase=cancel`, terms-of-service consent collection, adaptive pricing / automatic tax per D6. Returns `{url}`.
- `POST /webhook` — raw body, signature verification, idempotency via `shop/events/<event.id>` (transaction: set-once). Handles `checkout.session.completed` (only when `payment_status === 'paid'`), `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. On grant: `shop/ent/<uid>/<sku> = {s:'active', at, o:<sessionId>, p:<amount_total>, c:<currency>}`, `shop/orders/<uid>/<sessionId> = {sku, amount, currency, pi, at, s}`, index `shop/pi/<payment_intent> = {uid, sku, sid}` so a later charge event can find the order, and for the pass `shop/badge/<uid> = true`. On refund/dispute: `s:'revoked'`, badge removed. Logs are structured; secrets via `defineSecret`; region `asia-southeast1`; small `maxInstances`.
- `catalog.js` — the server catalogue (sku, name, category, kind, price label, lookup key). A seeding script `scripts/seed-products.js` creates/updates products and prices with lookup keys in whichever mode the key it is given belongs to.
- `firebase.json`, `.firebaserc`, emulator config, `database.rules.json` containing my full current rules plus:
  ```json
  "shop": {
    "ent":    { "$uid": { ".read": "auth != null && auth.uid == $uid", ".write": false } },
    "orders": { "$uid": { ".read": "auth != null && auth.uid == $uid", ".write": false } },
    "badge":  { ".read": true, ".write": false },
    "events": { ".read": false, ".write": false },
    "pi":     { ".read": false, ".write": false },
    "rl":     { ".read": false, ".write": false }
  }
  ```
  (Adjust to the real file's conventions. Admin SDK writes bypass rules, so `.write: false` is correct for every admin-only child.)
- If D2 is Cloudflare Worker instead: same two endpoints, Admin writes through the database REST API with a service-account-minted OAuth token held as a Worker secret, ID-token verification against Google's public keys. Same rules block.

**Client (`app.js`, `index.html`, `style.css`, `sw.js`)**
- A new `§` section: a client copy of the catalogue (`SHOP_SKUS`), `SHOP_API` base URL constant, beta flag (`?shop=beta` sets `localStorage.pi_shop_beta`; the shelf and all buy paths are inert without it until Gate 3).
- Entitlements: `ENT` state, `entListen(uid)` with `.on('value')` on `shop/ent/<uid>`, mirror in `localStorage` (`pi_ent_v1`, keyed by uid, cleared on logout/account purge), `owns(sku)`. Offline uses the mirror. The server copy always wins when online.
- The **🔐 Restricted** tab in `.market-tabs` (check how the row wraps; the Limited tab's `has-event` padding trick shows the constraint). Premium items are `SHOP_ITEMS` entries with `sku:` and are also listed on their category shelves with a lock/price label; `shopCardEl` renders a real-money price and a BUY button for `sku` items; owned ones equip exactly like Credits-bought ones (reuse `equipped.*`, which is harmless to leave client-written: equipping is not owning). Ownership checks for premium items go through `owns(sku)` everywhere `owned.*` is consulted for them.
- Buy flow: `buyPremium(sku)`: local/offline → toast; anonymous → toast and open the Save Account modal; else write `pi_buy_pending = {sku, at}`, `POST /checkout` with the ID token, `location.assign(url)`.
- Return flow: on boot, read `?purchase=`, immediately `history.replaceState` to the clean canonical URL (the SEO files care about one canonical address), then show a processing toast and wait for `owns(sku)` via the listener for up to ~20 s; on timeout say it is still processing and point at Restore Purchases; on `cancel` toast and clear the pending marker. Guard against the iOS standalone-PWA case where the return lands in the browser instead of the installed app: the entitlement is server-side, so the next open of the app picks it up.
- **Restore Purchases** in Settings: one-shot re-read of `shop/ent/<uid>`, toast the result.
- Supporter badge: `loadLeaderboard` and the player card read `shop/badge` once per load (cache ~60 s) and mark names; the pass also grants its exclusive companion/colour/title through `owns()`.
- Exclusive power-ups per D5, gated by `owns()`, with a daily charge recorded like `perkDay`.
- `sw.js`: add the functions host(s) and the provider's hosts to `BYPASS`; bump `CACHE` and the three `?v=` stamps (and in `index.html`).
- Legal pages as static files (`legal/terms.html`, `legal/privacy.html`, `legal/refunds.html`) in the site's visual style, linked from Settings and the Restricted shelf, with placeholders for my business name and support email clearly marked. Put their URLs in the runbook for the provider dashboard.
- `statsEvent` counters for the funnel (`_buy_open`, `_buy_start`, `_buy_ok`, `_buy_cancel`), after checking the `stats` rule's key pattern accepts them.
- Optional, if cheap: a Dossier line ("Supporter since …") and one ARC tutorial line for the shelf.

### Phases and gates

**Phase 0 — audit and design.** Read the sections named above and anything they touch. Write `docs/monetisation/DESIGN.md`: the final SKU list with ids, names, categories, prices and exactly what each unlocks; the data model; the endpoint contracts; the rules block; the client state machine for buy/return/restore; the D5 rule as implemented; the list of assumptions you verified and the ones you could not; open questions. Propose the catalogue if D4 says to. **Stop at Gate 0** and ask me to approve.

**Phase 1 — server, rules, legal drafts.** Build `functions/` with unit tests (signature failure → 400; valid completed event → grant; same event replayed → no second write; refund → revoked; dispute → revoked; anonymous token → 403; unknown sku → 400; already owned → 409), rules tests with `@firebase/rules-unit-testing` against the database emulator (client cannot write `shop/ent`, can read only its own, `shop/badge` readable by all and writable by none), the catalogue-parity script (server `catalog.js` vs client `SHOP_SKUS`), the seeding script, and `docs/monetisation/RUNBOOK.md` with the exact commands and dashboard clicks for me: Blaze, `firebase functions:secrets:set`, `firebase deploy --only functions`, pasting the rules, creating the webhook endpoint with the exact event list, seeding products, and what URL to give you back. Run everything you can run here (emulators, tests). **Stop at Gate 1** with the runbook.

**Phase 2 — client.** Everything under "Client" above, wired to the API base URL I give you. Verify in a real browser (Playwright is available) against the emulators where possible, and by reasoning where not. Keep the diff to `app.js` localised: one new section plus minimal, commented hooks in `shopCardEl`, `handleShopAction`, `renderShop`, `openMarket`, `loadLeaderboard`/`laneRow`, boot, logout, Settings. **Stop at Gate 2** with a manual test script for me (test card `4242 4242 4242 4242`, what to see at each step, how to refund in the dashboard and what should happen in the game).

**Phase 3 — go-live pack.** A go-live checklist (live secrets, live webhook, live seeding, flag flip, cache bump, merge order, a real purchase and refund by me, what to watch for the first week), rollback steps (flag off; functions keep running harmlessly), and a short `docs/monetisation/OPERATIONS.md` (adding a SKU, changing a price, handling a dispute, reconciling orders). **Stop at Gate 3.**

### Deliverables

- `functions/` with tests passing locally; `database.rules.json`; `firebase.json`; `.firebaserc`; `.gitignore`.
- The client changes with the cache version bumped.
- `legal/*.html` drafts.
- `docs/monetisation/DESIGN.md`, `RUNBOOK.md`, `OPERATIONS.md`, and a `TESTING.md` with what was verified by execution versus by reading.
- Commits in small, descriptive steps on the working branch; no model names in commit messages or code comments.

### How to work

- Verify before you build: every "fact" above gets a line in `TESTING.md` saying how you checked it.
- When the code contradicts this brief, the code wins; tell me what changed.
- Prefer the house pattern over a new one: `withTimeout`/`NET_WAIT` for network calls, `lsGet`/`lsSet` for mirrors, `toast`/`snd` for feedback, `saveProfilePatch` for the few client-written keys, `cmpPush`-style separate child writes where the rules may not know a key.
- Report what fails, with output. If a test cannot be run here (no Java, no network), say so and give me the command to run instead.
- Finish each phase fully before stopping at its gate. At each gate, give me a short status: what is done, what you verified, what you need from me, in that order.

---

## Part 3 — Running the session

1. Open Claude Code on this repository, on branch `claude/keen-archimedes-xlcunn` (or a new branch off `main`). Select Opus 5.5 and set effort to max.
2. Fill in the `<<…>>` placeholders in Part 2, including the rules JSON, and paste the whole of Part 2 as the first message.
3. At each gate, do the items in section 1.3 and reply with what Claude asked for (the function base URL after Gate 1, the test-purchase result after Gate 2).
4. Do not merge to `main` until Gate 2 says the beta flag is in place; then merge, test on the real domain in test mode, and only then do Gate 3.
5. Keep the live Stripe key on your machine. If you chose "Claude deploys", give the session only test-mode keys.

### Notes

- Fees (check current numbers before deciding D1): Stripe roughly 2.9% + a fixed fee per card charge in most countries, tax handling extra; merchants of record roughly 5% + a fixed fee with tax included.
- Nothing here is legal or tax advice. The Terms, Privacy and Refund pages need a human read, and tax registration depends on your country and on where your players are.
- If this file is merged to `main`, GitHub Pages will serve it publicly at `/docs/MONETISATION_PROMPT.md`. It contains nothing secret, but delete it or move it out of the site root once you have used it if you would rather it was not public.
