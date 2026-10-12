# Verification ledger

What was checked, how, and what it showed. Every fact in the brief gets a line. Later phases add their
test runs below, keeping verification **by execution** (a command was run and its output read) separate from
verification **by reading** (the code or a document was read).

Legend: ✅ holds · ⚠️ holds, with a difference the design accounts for · ❓ cannot be confirmed from here
(who confirms it, and when, is given).

---

## Phase 0: audit (2026-10-12, commit `94571c2`)

**How "the code" was read.** `app.js` is 73,270 lines, so it was not read end to end. It was read section by
section where the brief or the design touches it. The function names in the brief were located with `grep`
and their bodies read in full. Line numbers below are for commit `94571c2`.

### The brief's facts: 32 claims, 28 ✅, 1 ⚠️, 3 ❓ at Phase 0; 30 ✅, 2 ⚠️, 0 ❓ after Phase 1

Phase 1 changed four verdicts (B7, B29–B31) and executed B32. The rows say so; the evidence is under
[Phase 1](#phase-1-server-rules-legal-2026-10-12).

#### Shape of the project

| # | Claim | Verdict | How checked | Evidence and notes |
|---|---|---|---|---|
| B1 | Static site on GitHub Pages, custom domain `pointinvaders.com` (`CNAME`) | ✅ | **execution:** `cat CNAME`; `curl` of the site | `CNAME` = `pointinvaders.com`. The site answers with `server: GitHub.com`. `https://cat9748912-cpu.github.io/Point-invaders/` → **301** to `https://pointinvaders.com/`. |
| B2 | `main` is what the public gets | ✅ | **execution:** fetched `sw.js`, `index.html`, `app.js?v=83`, `style.css?v=83` from the live site and `cmp`'d them against the repo; `git ls-remote origin` | All four are **byte-identical** to `main` = `94571c2` (the remote HEAD). The clone's local `origin/main` ref was stale (`6050254`) and has been refreshed. |
| B3 | No build step, bundler, framework, root `package.json`, tests, CI or `.github/` | ✅ | **execution:** `find . -type f` (excluding `.git`) | 10 files: `CNAME README.md app.js assets/ship62.js index.html og.jpg robots.txt sitemap.xml style.css sw.js` |
| B4 | Four real files plus `assets/ship62.js` | ✅ | **execution:** `wc -l` | `index.html` 1,913 · `app.js` 73,270 · `style.css` 6,451 · `sw.js` 127 · `assets/ship62.js` 2 (texture data). Also served: `og.jpg`, `robots.txt`, `sitemap.xml`, `README.md`. |
| B5 | Numbered `§` sections, prose comments, a `vNN` tag per feature | ✅ | **execution:** `grep` for banner headers and `\bv[0-9]{2}\b` | Last section is `§ 45 · v80` (`app.js:72509`). v81 retired § 41 Mashups (`app.js:71223`); v82 and v83 are tagged fixes with no section; the `v92`/`v97` hits are base64 noise. **Next free: `§ 46`, `v84`.** |
| B6 | `sw.js` precaches the three `?v=83` files; cache `point-invaders-v83` | ✅ | reading | `sw.js:4` (`CACHE`), `sw.js:13–19` (`SHELL`) |
| B7 | The `?v=` stamps in `index.html` and `sw.js` and `CACHE` move together | ✅ → ⚠️ (Phase 1) | reading; **Phase 1: execution** (`grep` for every stamp) | `sw.js:1–3, 10–12`; `index.html:75–80` (`style.css?v=83`), `index.html:1827` (`app.js?v=83`). **Difference found in Phase 1:** a third file's stamp lives in `app.js:24408`, `PI_ASSET_FILES = { ship62: 'assets/ship62.js?v=…' }`, the URL the page actually loads `assets/ship62.js` from. A bump that misses it leaves the precached chunk unread. v84 moved all seven strings (DESIGN § 2, item 16; § 9.10). |
| B8 | A `BYPASS` regex keeps Firebase traffic out of the cache | ✅ | reading | `sw.js:60`: `firebaseio\.com\|firebasedatabase\.app\|identitytoolkit\|securetoken\|google-analytics`. Also, `sw.js:64` returns early for every non-GET request, so a `POST` to the new API is never cached anyway. |
| B9 | Firebase compat SDK 9.23.0 from gstatic, precached by `VENDOR` | ✅ | reading | `index.html:71–73`; `sw.js:26–30` |
| B10 | Web config `const FB = {…}`, project `neal-with-roblox`, the asia-southeast1 database | ✅ | reading | `app.js:1246–1254` |

#### Identity

| # | Claim | Verdict | How checked | Evidence and notes |
|---|---|---|---|---|
| B11 | Three kinds of session: local, anonymous guest, registered | ✅ | reading | local: `isLocalSession()` `app.js:1465`, uid `local-…` `app.js:1468`. Guest: `signInAnonymously` `app.js:3114`. `user.isGuest` comes from `auth.currentUser.isAnonymous` (`app.js:3277`). |
| B12 | Guests upgrade in the Save Account modal with `linkWithCredential` / `linkWithPopup`, keeping the uid | ✅ | reading | `openUpgrade` `app.js:18673` (refuses non-guests); `upgrade` `app.js:18728` → `linkWithCredential` `app.js:18757`; `upgradeGoogle` `app.js:18801` → `linkWithPopup` `app.js:18819`; `btn-save-acct` → `openUpgrade` `app.js:18699`. The modal's closer is exposed as `window.closeSaveAccount` (`app.js:18702`). |
| B13 | `claimLocalAccount()` turns a local session into an anonymous guest | ✅ | reading | `app.js:1488–1539` |
| B14 | A guest's `players/<uid>` is deleted when the connection ends; `purgeGuestAccount()` deletes the identity | ✅ | reading | `gcPledge` → `onDisconnect().remove()` `app.js:68692–68700`; `purgeGuestAccount` `app.js:3361–3379` |
| B15 | Offline mirror and boot race | ✅ | reading | `LS_PROFILE='pi_profile_v1'` `app.js:1281`, `NET_WAIT=6000` `app.js:1283`, `withTimeout` `app.js:1292`, `cacheProfile` `app.js:1308`, `readCachedProfile` `app.js:1315` |

#### The economy and the Black Market

| # | Claim | Verdict | How checked | Evidence and notes |
|---|---|---|---|---|
| B16 | Profile schema in `ensureUserDefaults()`: `credits`, `owned.<cat>`, `equipped.<cat>`, `powerups.<id>` | ✅ | reading | `app.js:3158–3228` |
| B17 | `saveProfilePatch(patch)`: an `update()` on `players/<uid>`, skipped for local/offline sessions, held by `gcHold` | ✅ | reading | `app.js:16200–16211`; `gcHold` `app.js:68836`. The mirror is written first, unconditionally. |
| B18 | `SHOP_ITEMS` categories and flags; Limited tab by `renderEventShelf` | ✅ | reading | `app.js:5894–5994` (colors, cursors, skins, powerups, drives, exits); `worlds` `app.js:50528`; `companions` `app.js:69972`; flags `default`/`earned`/`consumable`+`stack`/`event`; `renderEventShelf` `app.js:47843` |
| B19 | Helper and rendering functions exist under the names given | ✅ | **execution:** `grep -n` for each definition | `findItem` 5996 · `featuredIds` 6016 · `priceOf` 6035 · `getRarity` 6054 · `applyEquippedCosmetics` 6151 · `openMarket` 6206 · `refreshMarketBalances` 6240 · `switchMarketTab` 6261 · `shopCardEl` 6328 · `bindShopButtons` 6386 · `renderShop` 6392 · `handleShopAction` 6405 |
| B20 | Markup `#market-screen`, `.market-tabs`, `#panel-<cat>`, `#shop-<cat>`; tab CSS near `.market-tab`; the `has-event` padding trick shows the row's constraint | ⚠️ | reading | Markup `index.html:850–923`. **Difference:** the tab row is now a **CSS grid**: five across, three on phones, and the Limited tab spans a row on phones (`style.css:6075–6093`, § 38). The `has-event` padding rule (`style.css:4330–4342`) is from the earlier flex row. The new tab's placement follows the grid (DESIGN § 9.2). |
| B21 | Companions write their own children (`cmpPush`) because the rules may not name them | ✅ | reading | `app.js:69962–69970` (comment), `cmpPush` `app.js:70042–70057` |
| B22 | Conversion both ways at `CONV_RATE = 100`; Points are the public rank; Credits are staked in Bounties | ✅ | reading | `CONV_RATE` `app.js:5887`; `btn-conv-to-credits` `app.js:6279`; `btn-conv-to-points` `app.js:6295` (stamps `lastScoreAt`); Bounties § 42 `app.js:71229` |
| B23 | Power-up kit; dock hidden in duels and speedruns; `runOverclock` | ✅ | reading | `powerHeld` 17157 · `powerConsume` 17161 · `stackCapFor` 17177 · `grantRandomConsumable` 17185 · `paintPowerDock` 17213 (`mp` 17205/17215, `spdOn()` 17216) · `paintPowerKit` 17340 · `runOverclock` 16318, set 17306, cleared 3675 |
| B24 | Daily recharge pattern: Chrono Reserve `perkDay` keyed by UTC day | ✅ | reading | `perkDailyGrant` `app.js:17087–17103`; `dayKey` = ISO UTC date `app.js:4867` |
| B25 | Boards derived client-side from broad reads of `players` | ✅ | reading | `loadLeaderboard` `app.js:8084` (`orderByChild`, whole node; the Rival board is its `friends` scope); `loadLaneBoards` `app.js:44666` (`limitToLast(60)`); `laneRow` `app.js:44745`; rows rendered by `lbRows` `app.js:8060` |
| B26 | Titles shown only when the record also holds the achievement | ✅ | reading | `titleOf` `app.js:47912–47915` |
| B27 | `statsEvent(key)` increments counters under `stats` | ✅ | reading | `app.js:51343–51346`. The client requires `^_[a-z_]{1,14}$`; `_buy_open`, `_buy_start`, `_buy_ok` and `_buy_cancel` pass. **Whether the `stats` rule accepts them is U2.** A refused write turns counting off for the session (`stSend` `app.js:51270–51281`). |
| B28 | Formspree relay; nothing else talks to a server | ✅ | **execution:** `grep` for `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `https://` hosts | `sendFeedback` `app.js:18388` → `formspree.io` (and archives to `feedback`). The only other `fetch` is the `?stats` panel's REST read of this project's own `stats.json` (`app.js:51407`). `/api/feedback` at `app.js:18436` is inside a comment. |

#### The database rules

| # | Claim | Verdict | How checked | Evidence and notes |
|---|---|---|---|---|
| B29 | The rules enumerate top-level nodes; any other top-level write is refused | ❓ → ✅ (Phase 1) | reading (comments only); **Phase 1: execution** against your pasted rules | Consistent with `app.js:5019–5021`, `51250–51252`, `55837–55839`, `17632`, `18900`. **Phase 1:** your root is `.read`/`.write: false`, and a write to an unnamed top-level node is refused in the Database emulator (rules test "B29"). |
| B30 | Validated shapes (`weekly` is exactly `{season, pts}`); one refused key fails the whole `update()` | ❓ → ✅ (Phase 1) | reading (comments) + Firebase documentation; **Phase 1: execution** | `app.js:3191–3199`. **Phase 1:** `{season, pts}` is accepted, an extra key is refused, and an `update()` carrying one refused key writes none of its keys (rules test "B30"). |
| B31 | A rate-limit rule refuses a `totalPoints` rise not stamped with `lastScoreAt` within 2.5 s | ❓ → ✅ (Phase 1) | reading (comments); **Phase 1: execution** | `app.js:6303–6305`, `app.js:4659`, `app.js:4735`, `app.js:68849`. **Phase 1:** a rise needs `lastScoreAt` equal to the server's `now`, and a second rise inside 2.5 s is refused (rules test "B31"). |
| B32 | Rules cascade: a parent's `.write` cannot be revoked by a child, so nothing paid may live under the owner-writable `players/<uid>` | ✅ | Firebase documentation; the code writes there as the owner (`saveProfilePatch`); **Phase 1: execution** | **Phase 1:** the owner writes an arbitrary key under `players/<uid>` with your rules, and in a minimal rules file a child `.write: false` under a granting parent does not stop the write (rules tests "B32" and "B32 (cascade)"). |

### Found in the audit (beyond the brief)

| # | Finding | How checked | Where it lands in the design |
|---|---|---|---|
| X1 | Putting premium items inside `SHOP_ITEMS` would enter four Credits-economy loops: `featuredIds` (6023), `getRarity` (6063, where a missing price re-bands every shelf), `grantRandomConsumable` (17187), `crewColors` (71630) | **execution:** `grep -n SHOP_ITEMS` (22 lines), each read | DESIGN § 2.2: separate `SKU_ITEMS` table |
| X2 | `cmpState()` resets an equipped companion missing from `owned.companions` **and pushes the reset** (`app.js:70025–70029` → `cmpPush`); `applyLoadout` checks `owned.*` directly (`44905`); the animated cursor tier comes from the Credits price (`6157`) | reading | § 2.3 hooks |
| X3 | The event banner's LIMITED STOCK button opens the market without passing the offline door guard (`app.js:47743` against the guard at `1356–1371`) | reading | § 2.4: the buy path checks for itself |
| X4 | The four Credits power-ups already change time, survival, pay and difficulty in board-eligible runs | reading `app.js:17130–17157`, `17253–17324` | § 2.5, § 3.3 (D5) |
| X5 | Practice-run plumbing exists: `vsResultTap` takes a Lab result before `showResultsCard`/`saveScore` (`app.js:4363`, `labTap` 52302); `survivedFatal` refuses during Lab (16540–16548); `Ghost.begin` skips Lab (3792); `bntyArm` holds the plain-round predicate (71460) | reading | § 3.3, § 9.7 Exhibition rounds |
| X6 | Every repo file on `main` is published as-is: `/README.md` → 200 `text/markdown`; `/README.html`, `/CNAME`, `/.nojekyll` → 404 | **execution:** `curl` | § 2.10, Q3 |
| X7 | The service worker caches **every** navigation response as `./index.html`, whatever its path or status (`sw.js:70–80`) | reading | § 2.11: fix in v84 before `legal/*.html` ships |
| X8 | The owner keeps the full rules file at `_firebase/database.rules.json`, beside the project, "not a deploy file" (`app.js:51367`, `55839`, `51547`); comments mention an owner rule "(a)" for guest records (`68524`) and `players/$uid/$other` accepting keys (`57619`) | reading | § 2.9: no `database` deploy target |
| X9 | There is no privacy policy, terms or cookie notice anywhere on the site | **execution:** `grep -i` across `index.html` and `app.js` | § 10: the privacy draft covers the whole arcade |
| X10 | No Content-Security-Policy meta tag, so a new `fetch` host needs no CSP change | reading `index.html` head | § 9.10 |
| X11 | URL parameters follow one house pattern: read, stash in `sessionStorage`, `history.replaceState(history.state, '', …)` (`clBoot` 51107, `labBoot` 52834), with the boot call at the end of the section's own wiring (51225, 54274) | reading | § 9.4: `shopBoot()` needs no hook |
| X12 | Overlays share the `.fb-overlay` shell through `openOverlay`/`closeOverlay` (`app.js:18259–18300`); Settings has a `set-sec` per topic, painted by `paintSettings()` (46709) | reading | § 9.3 purchase sheet, § 9.5 |

### External facts

| # | Fact | Verdict | How checked |
|---|---|---|---|
| E1 | Cloud Run functions decommission `nodejs20` on **2026-10-30** (deprecated 2026-04-30); `nodejs22` and `nodejs24` are current | ⚠️ brief said Node 20 | web search of Google's runtime-support pages (2026-10-12); **execution:** `firebase-tools@15.33.0` `lib/deploy/functions/runtimes/supported/types.js`, which lists `nodejs24` GA with deprecation 2028-04-30 |
| E2 | Engines: `firebase-admin` 14.5.0 needs node ≥ 22; `firebase-functions` 7.4.0; `stripe` 23.0.0 needs ≥ 20; `@firebase/rules-unit-testing` 6.0.0 needs ≥ 24.12.0 (5.0.x needs ≥ 20 with peer `firebase@^12`); `firebase-tools` 15.33.0 | ✅ | **execution:** `npm view <pkg> version engines.node peerDependencies` |
| E3 | `stripe@23.0.0` pins API version **`2026-09-30.endive`** and ships `webhooks.constructEvent` | ✅ | **execution:** `npm pack stripe@23.0.0`, then `grep` |
| E4 | Checkout Session: `consent_collection.terms_of_service: 'required'` needs a Terms URL in Dashboard public settings; `expires_at` is 30 min to 24 h; `client_reference_id` ≤ 200 chars; `customer_email`, `adaptive_pricing`, `managed_payments.enabled`, `ui_mode` default `hosted_page`; `line_items` take a **price id**, so lookup keys are resolved server-side | ✅ | read `docs.stripe.com/api/checkout/sessions/create` (2026-10-12) |
| E5 | Managed Payments: merchant of record covering tax in 80+ countries; **video games** are eligible (tax codes `txcd_1020100x`); supported business countries listed; it refuses `adaptive_pricing` (always on), `automatic_tax`, `payment_method_types`, `invoice_creation`, statement-descriptor and `receipt_email` params; Stripe may refund within 60 days; receipts come from Link; needs API version ≥ `2025-03-31.basil` | ✅ | read `docs.stripe.com/payments/managed-payments` (overview, eligibility, update-checkout, how-it-works) |

### Environment (what Phase 1 can execute here)

| # | Fact | How checked |
|---|---|---|
| V1 | Node v22.22.0, npm 10.9.4, OpenJDK 21.0.12.1, Ruby 3.3.6, Python 3.13; **not installed:** Firebase CLI, Stripe CLI, Jekyll; the npm registry is reachable directly | **execution:** `--version` for each; `npm view` |
| V2 | No Firebase or Google service account and no Stripe key in the environment, checked by **variable name only** (no values printed). A gcloud access token exists from the environment's proxy setup; it was not used and will not be used against your project. | **execution:** `env \| cut -d= -f1 \| grep …`; `gcloud auth list` shows no account |

### Not verifiable from here (6)

Status after Phase 1: U1–U3 resolved; U4 and U6 in part; U5 open. See
[the six open items](#the-six-open-items-after-phase-1).

| # | What | Who and when |
|---|---|---|
| U1 | The live rules text (B29–B31, X8) | you paste `_firebase/database.rules.json` at Gate 0; Phase 1 rules tests run against it |
| U2 | Whether the `stats` rule accepts the `_buy_*` keys | from U1; until confirmed, the funnel stays off |
| U3 | That no rule above `shop` (i.e. at the root) grants read or write | from U1, then proved in the emulator |
| U4 | Your business country, Stripe availability and Managed Payments eligibility | you (Q1); Stripe's review |
| U5 | Whether `neal-with-roblox` is on Blaze and already has Cloud Functions (the `shop` codebase keeps any existing ones untouched) | you, at deploy time (Gate 1) |
| U6 | Live provider behaviour: Managed Payments plus `consent_collection`; dispute events under Managed Payments; the iOS and Android installed-app return paths; the ID token's `sign_in_provider` straight after `linkWithCredential` (the client forces a token refresh anyway) | the Gate 2 manual test (test mode), the Gate 3 live purchase; the token claim can be checked earlier against the Auth emulator in Phase 2 |

### Commit hygiene (Phase 0)

**Execution:** before each commit, two greps over `git diff`:

1. **The brief's literal list** (`sk_live|sk_test|rk_live|rk_test|whsec_|private_key`). Two hits, both in
   `DESIGN.md` prose naming key **prefixes** (§ 8.1 and the § 10 table). I read both by hand; neither is a key.
2. **Real key shapes**: `(sk|rk|pk)_(live|test)_[0-9A-Za-z]{10,}`, `whsec_[0-9A-Za-z]{10,}`, a PEM
   header (`-----BEGIN`, capitals, `PRIVATE KEY-----`), and a service-account JSON `private_key` field whose
   value starts with that header. **No matches** (grep exit 1) over the diff and over the whole working tree.

Two early versions of the strict pattern matched their own descriptions (plain `BEGIN PRIVATE KEY`, then a
quoted JSON fragment). Neither match was a key. The patterns now require the full shapes a real secret has,
and this description deliberately doesn't spell them out contiguously.

---

## Phase 1: server, rules, legal (2026-10-12)

*This section records the first build, on Cloud Functions. At Gate 1 the server moved to a Cloudflare Worker:
see [Phase 1, revised](#phase-1-revised-the-server-on-cloudflare-workers-gate-1-2026-10-12) below. The rules,
service-worker and legal-page results here still stand.*

Commits on `claude/stoic-cori-irbsqk`, in order:

| Commit | What |
|---|---|
| `e0ec4b1` | the rules file with the `shop` block; `firebase.json`, `.firebaserc`, `.gitignore` |
| `13745b0` | the server: catalogue, checkout, webhook, ledger |
| `f250883` | the server tests: unit, emulator integration, rules, end to end |
| `f76a68e` | the product seeding and catalogue parity scripts |
| `ea8a936` | draft legal pages |
| `c107d9d` | the service-worker fix and the v84 stamps |
| `dd98251` | the webhook-endpoint script |
| after `dd98251` | two more unit assertions; the legal pages' tab icon; the runbook; these documents |

### Environment

Node v22.22.0 · firebase-tools 15.33.0 (Auth, Database and Functions emulators) · OpenJDK 21 ·
playwright-core 1.64.0 driving the preinstalled Chromium. The emulators run as project **`demo-pi-shop`**. A
`demo-` project id cannot reach any real Firebase project, so no test touched `neal-with-roblox`. The function
targets Node 24 (`engines`). Here it runs on Node 22, which every dependency accepts (E2); the Functions
emulator notes the mismatch and carries on.

### Test runs (execution)

Run in `functions/` after `npm ci`. Last run: the tree committed with this section.

| Suite | Command | Result | What it covers |
|---|---|---|---|
| Unit | `npm test` | **42 / 42 pass**, exit 0 | the catalogue and its validator, config, CORS, routing, every checkout-session parameter and the exact set of them, the order state machine, the transaction helper, and the seed, parity and webhook-endpoint scripts (against a fake Stripe client) |
| Emulator | `npm run test:emu` | **105 / 105 pass**, exit 0 | the 42 again, plus **60 cases** against the Auth and Database emulators: checkout 22, webhook 26, rules 12. `node:test` counts each of the three groups as a test too, hence 63. |
| End to end | `npm run test:e2e` | **7 / 7 pass**, exit 0 | the deployable `index.js` inside the Functions emulator, with its secrets and params loaded the way a deploy loads them: 6 cases, plus the group |
| Parity | `node scripts/catalog-parity.js` | exit **2**: "No client catalogue in app.js" | expected until Phase 2 adds the client's block; with `--allow-missing` it exits 0 |

Harmless output seen in the logs:
- `MetadataLookupWarning`: there is no Google metadata server here.
- "Firebase Authentication function was not triggered due to emulation error": there are no auth triggers.
- The Node 24/22 note above.

The Functions emulator writes `functions/.env.local` (the params' defaults), and the end-to-end setup writes
`functions/.secret.local` (fake test values). `git check-ignore -v` shows both ignored by `.gitignore`'s
`*.local`.

The Stripe client is a fake in every test: no key exists here. It records each call and its parameters, and
the webhook tests sign their payloads with the real `stripe` library's signing helper, so the signature check
is the real one.

### The non-negotiables: what proves each

| # | Non-negotiable | By execution | By reading |
|---|---|---|---|
| 1 | Server-authoritative entitlements | Rules tests: no client can write its own entitlement, order or badge, anyone else's, or `cfg`, `events`, `pi` or `rl`. Webhook tests: grants come only from correctly signed events. | Every path the server touches is under `shop/` (`ledger.js:39`, `db.ref('shop/' + p)`). The client doesn't change until Phase 2. |
| 2 | Money never becomes Credits or Points | The catalogue test feeds the validator each mistake, and it refuses all of them: a grant that isn't an `-x-` item id, one item granted by two SKUs, an exhibition SKU that grants an item, a bad SKU id, a fractional amount, a missing pass. | `grep`: the server never writes `credits`, `totalPoints`, `owned` or `powerups`; its only writes are under `shop/`. |
| 3 | Hosted checkout only | A session test asserts the exact set of parameters, with no `ui_mode`, so Stripe's own hosted page. A mutation adding `ui_mode: 'embedded'` makes it fail. `grep -ci stripe index.html` → 0. | Against `main` (`94571c2`), the only changes to `index.html`, `app.js` and `style.css` are the three stamp lines (`git diff -U0`). |
| 4 | Guests, local sessions and offline mode can't buy | An anonymous token → 403 `guest` (integration and end to end). A disabled account → 401. A local session has no token, and a request without one → 401. | Offline is a client check (Phase 2). |
| 5 | Webhooks: raw body, idempotent, 2xx only after the write; refunds and disputes revoke | Signature over the raw bytes: a pretty-printed, correctly signed body is accepted; a changed byte is refused (also end to end). A replay → 200 and no write of any kind. Two simultaneous deliveries are safe. A database failure → 500, and the redelivery completes. A full refund revokes; a dispute revokes; a won dispute restores; a lost one is final. | `webhook.js:71–73`: `finishEvent`, then `send(200)`; any error releases the claim and answers 500. |
| 6 | No secrets in the repository | The two greps before every commit (below); `git check-ignore` on what the emulators wrote. | `.gitignore` |
| 7 | Only `shop` added; no existing rule changed | With `shop` removed, `database.rules.json` deep-equals your pasted rules (Python `json`, and a normalised `diff` with no output). The rules tests run your whole file. | |
| 8 | No deploy, no live mode, no push to `main` | Nothing was deployed: no credentials exist here (V2). Every push went to `claude/stoic-cori-irbsqk`. | `firebase.json` has no `database` target. |
| 9 | Offline play, the service-worker coupling, house style, v84 | The service-worker runs below. v84 moved all seven strings. | |
| 10 | D5 | Phase 2 (client) | DESIGN § 3.3 |
| 11 | Fail safe | Server half: the kill switch → 503, and any value other than `false` is open; an unseeded SKU → 503; a provider error → 502, with nothing remembered as open. | The client half is Phase 2. |

### Test cases (execution)

<details><summary><strong>Unit: 42 tests</strong> (<code>test/unit/</code>, no emulator)</summary>

- live mode comes from the key prefix
- origins: the site always; localhost only in test mode; nothing else
- return site: never anything the caller made up
- CORS headers for an allowed origin, refusal for another, nothing needed without one
- route: the last path segment, whichever URL form
- catalogue: valid, nine SKUs, labels, and its validator catches mistakes
- a session is ours only with our metadata version, a matching uid and a known SKU
- keep(): "no change" is null against a null, undefined against real data
- next(): the documented transitions
- next(): terminal states never move, whatever arrives
- next(): a completion only ever moves an order out of nothing or pending
- next(): a won dispute only restores a disputed order
- isActive(): any paid order
- applyToNode(): first grant
- applyToNode(): no change → node null (the transaction is not written)
- applyToNode(): refund revokes and keeps the history
- applyToNode(): a second paid order of the same SKU is a duplicate, remembered in the node
- applyToNode(): a won dispute is not a duplicate, and refunded-then-rebought restarts "since"
- applyToNode(): a dispute while another order is paid keeps the item
- seed: an empty account gets one product and one tax-inclusive USD price per SKU
- seed: running it again changes nothing
- seed: a changed amount makes a new price that takes the lookup key; the old one is archived
- seed: a renamed product is updated in place
- seed: the key decides the mode, and a live key needs --live
- parity: no markers → null; a matching client catalogue → no problems
- parity: every kind of drift is reported
- parity: the CLI exits 0 / 1 / 2, and the block runs in an empty sandbox
- parity: today's app.js has no client catalogue yet (Phase 2 adds it)
- webhook endpoint: a dry run creates nothing and lists the seven handled events
- webhook endpoint: --apply creates it on the pinned API version and prints ONLY the secret, no newline
- webhook endpoint: an existing endpoint for the URL is refused, or replaced with --replace
- webhook endpoint: bad URL, missing key, and the live guard
- the line item is the resolved price, quantity one
- uid and sku travel in client_reference_id, session metadata and payment-intent metadata
- return URLs: the site, the sku, and the provider template left unencoded
- terms are required, and the consent text links the terms and refund policy and states the age rule
- expires 35 minutes out (the provider minimum is 30)
- Managed Payments: on, and none of the parameters it refuses
- hosted checkout only: exactly these parameters, and no ui_mode
- without Managed Payments: Adaptive Pricing asked for, no managed flag
- the email is pre-filled only when it is verified
- a localhost site (test mode) is used as given

</details>

<details><summary><strong>Checkout: 22 cases</strong> (<code>test/integration/checkout.test.js</code>, real Auth emulator tokens)</summary>

- CORS preflight: the site → 204 with headers; another origin → 403
- localhost: allowed in test mode, refused in live mode
- GET → 405
- no token → 401; a forged token → 401
- anonymous (guest) token → 403 guest
- a guest who saves their account (linkWithCredential, same uid) can buy
- a disabled account → 401 (checkRevoked)
- unknown or missing sku → 400
- already owned → 409
- a revoked entitlement can be bought again
- success: the exact session parameters, and the open session remembered
- a verified email is pre-filled
- without Managed Payments: Adaptive Pricing, no managed flag
- test mode from localhost returns to localhost
- a second request hands back the open session: same URL, no new session, no rate limit
- the open session was paid and the webhook is in flight → 409 owned_pending
- a new session inside 10 s → 429 with Retry-After; allowed again after
- the rate limit is per player
- kill switch shop/cfg/open = false → 503; anything else is open
- no price for the lookup key (not seeded) → 503 unpriced
- the provider refuses → 502, and nothing is remembered as open
- unknown route → 404; health → 200

</details>

<details><summary><strong>Webhook: 26 cases</strong> (<code>test/integration/webhook.test.js</code>, real Database emulator)</summary>

- a bad signature → 400 and nothing is written (wrong secret, tampered body, none)
- the signature is checked over the RAW bytes: odd formatting that is correctly signed is accepted
- GET → 405
- checkout.session.completed (paid) → grant: entitlement, receipt line, payment-intent index, open session cleared
- the same event replayed → 200 duplicate, and no second write of any kind
- two deliveries of one event at the same moment: one is handled, the other is told to come back
- the pass lights the public badge with "supporter since"
- charge.refunded (full) → revoked; the pass badge goes with it
- a partial refund keeps the item
- charge.dispute.created → revoked; closed won → restored; lost → gone for good
- an inquiry that closes without a dispute restores the item
- a dispute without a payment intent is traced through its charge
- a refund that arrives BEFORE the completion: recorded refunded, and the late completion grants nothing
- a refund for a payment that is not ours (no metadata) is ignored
- a delayed payment method: pending grants nothing; success grants; failure never does
- checkout.session.expired forgets the open session, if it is still that one
- paid twice for one item: the second payment is refunded automatically, the item stays
- with auto-refund off, a duplicate is flagged but not refunded
- the duplicate refund fails → 500, the claim is released, and the redelivery refunds
- the database fails after the grant → 500; the redelivery completes the rest
- a fresh claim held by another delivery → 409; a stale one is taken over
- a live event at a test endpoint (or the reverse) is ignored
- an event type the shop does not handle is acknowledged and not recorded
- a session the server did not create (no metadata version, uid mismatch, unknown sku) unlocks nothing
- evidence: a naive transaction that answers "no change" to the first null aborts without asking the server
- …and the ledger does not fall into it: a won dispute applied from a fresh process restores the item

</details>

<details><summary><strong>Rules: 12 cases</strong> (<code>test/integration/rules.test.js</code>, your file in the Database emulator)</summary>

- a player cannot write their OWN entitlement, order or badge
- a player cannot write someone else's either, and a signed-out client nothing at all
- no client can write the switch, the event log, the index or the rate limit
- a player can read their own entitlements and orders, and no one else's
- the badge and the switch are public reads; the server-only nodes are not readable at all
- B29: a top-level node the rules do not name is refused
- B30: weekly is exactly {season, pts}, and one refused key fails the whole update()
- B31: a totalPoints rise needs lastScoreAt === now, and a second one inside 2.5 s is refused
- B32: the owner writes anywhere under players/<uid>, which is why nothing paid lives there
- B32 (cascade): a child .write:false cannot take back a parent's grant
- U2: the stats rule takes the purchase funnel keys (+1 only, lower case only)
- the players board is still a public read (and the badge matches it)

</details>

<details><summary><strong>End to end: 6 cases</strong> (<code>test/e2e/function.test.js</code>, the Functions emulator)</summary>

- GET /health → test mode, from the secret key's prefix
- webhook: a correctly signed, oddly formatted payload is accepted (raw body) and the grant lands
- webhook: a body changed after signing → 400
- checkout: CORS preflight from the site
- checkout: a guest token → 403; another origin → 403; an unknown sku → 400
- an unknown route → 404

</details>

**One finding worth knowing: the transaction trap.** A Realtime Database transaction first runs its update
function against the *locally cached* value. In a fresh server process that value is `null`, even when the
database holds data. An update function that answers "no change" (`undefined`) to that first `null` aborts
the transaction without ever asking the server. The test runs such a naive function against existing data in
the emulator: it is called **once**, with `null`, and the change is lost. The ledger's `keep()` answers `null`
to a `null`, which makes the SDK fetch the real value and call again. The paired test applies a won dispute
from a fresh process, and the item is restored.

### Service worker (Chromium, execution)

Run on the content of commit `c107d9d`. `sw.js`, `index.html`, `app.js` and `style.css` are unchanged since
(`git diff --stat c107d9d` is empty). The site was served by a local `python3 -m http.server` started by the
harness. "Offline" means the harness killed that server with SIGKILL, because Playwright's `setOffline` doesn't
cover a service worker's own fetches. An earlier attempt that relied on `setOffline`, and on SIGTERM (which
didn't stop the server), gave a misleading result and was discarded.

| Check | Result |
|---|---|
| **The bug, reproduced** on v83 (the `main` service worker, with the legal pages added): open `/`, then Terms, a missing page (404) and Privacy; read the cache | `./index.html` in the cache had become the Privacy page. With the server killed, launching `/` showed the Privacy page instead of the arcade. |
| **The fix** (v84), same visits | The cached `./index.html` is still the arcade. With the server killed, `/` and a checkout return address (`/?purchase=ok&sku=…&sid=…`) both open the arcade. |
| **Upgrade** v83 → v84 | About 4 s after the reload, only `point-invaders-v84` remains, holding `/`, `/app.js?v=84`, `/assets/ship62.js?v=84`, `/index.html` and `/style.css?v=84`. |

The harness was a scratch script. Phase 2 commits a re-runnable browser suite that includes these checks.

### Legal pages (Chromium, execution)

Re-run on the final pages, served locally, at 1280 × 900 and 375 × 812:
- All three answer 200, have no horizontal scroll (`scrollWidth` = `clientWidth`), run no script, and log no
  console errors.
- Their relative links (`terms.html`, `refunds.html`, `privacy.html`, `../`) all answer 200.
- The first run logged one 404, Chromium's automatic `/favicon.ico` request. The arcade builds its icon with a
  script and these pages have none, so each page now inlines the same icon as a static `data:` URI (generated
  from `index.html`'s own code). The re-run had no 404s in the server log.
- Two screenshots were looked at, refunds at phone width and terms at desktop width: the palette, fonts,
  draft banner and placeholders render as intended.

Placeholders left: ⟦BUSINESS NAME⟧ (terms, privacy) and ⟦EFFECTIVE DATE⟧ (all three).

### Verified by reading only

- **The restricted key's permissions** (RUNBOOK § 3). Derived from the seven Stripe calls the code makes:
  `checkout.sessions` create/retrieve/list, `prices.list`, `refunds.create`, `paymentIntents.retrieve` and
  `charges.retrieve`. Stripe enforces them only against a real key, so the first proof is your smoke test.
- **Stripe's real payloads.** The fake events follow the API reference for `2026-09-30.endive`. The first real
  payload is the test event in RUNBOOK § 7; full purchases come in your Gate 2 run.
- **Managed Payments accepting `consent_collection` and the `custom_text`.** Not on Stripe's list of refused
  parameters; still U6.

### The six open items after Phase 1

| # | Status | Evidence |
|---|---|---|
| U1 | ✅ resolved | You pasted the rules at Gate 0. The rules tests run against that file plus the `shop` block. |
| U2 | ✅ resolved | Rules test "U2": `_buy_open`, `_buy_start`, `_buy_ok` and `_buy_cancel` are accepted (+1 only, lower case only). |
| U3 | ✅ resolved | Your root is `.read`/`.write: false`, and the rules tests show no client write lands anywhere under `shop`. |
| U4 | in part | Singapore (Gate 0). Managed Payments eligibility is Stripe's review (RUNBOOK § 3). |
| U5 | open | Your deploy (RUNBOOK § 1, `firebase functions:list`). |
| U6 | in part | **The linked-account token:** after an email credential is linked to an anonymous user (same uid), the Auth emulator's fresh ID token says `sign_in_provider: 'password'`, so the server lets them buy (checkout test "a guest who saves their account…"). Linking with Google wasn't run here. The rest (Managed Payments with `consent_collection`, dispute events under Managed Payments, the installed-app return paths) is Gate 2 and Gate 3. |

### Commit hygiene (Phase 1)

**Execution:** before each Phase 1 commit, the same two greps as Phase 0 ran over the staged diff. Before
this commit they also ran over the whole Phase 1 diff (`git diff 53308b4`, including the uncommitted files)
and the whole working tree:

1. **The brief's literal list.** I read every hit. Each is one of: documentation or a code comment naming
   key prefixes (`rk_test_…`, `whsec_…`); the inputs of the key-prefix tests (`sk_live_x`,
   `sk_test_abc` and the like); the end-to-end fake key `sk_test_e2e`; or the signing-only fake `sk_test_signing_only`.
   None is a key. `package-lock.json` has no hits.
2. **Real key shapes:** no matches (grep exit 1) over the Phase 1 diff and over the working tree outside
   `node_modules`.

One problem was caught and fixed before committing: a fake signing secret in the tests was the webhook-secret
prefix followed by a long word, which is exactly a real secret's shape, so the strict pattern rightly matched
it. Every fake signing secret was renamed `test-signing-secret-*`.

---

## Phase 1, revised: the server on Cloudflare Workers (Gate 1, 2026-10-12)

You couldn't use the Blaze plan, so D2 changed (DESIGN § 2, item 18). Commits: `bd360c1` (the port), `b8aead1`
(the new tests), and the documentation commits that carry this section.

### Facts checked before building

| # | Fact | Verdict | How checked |
|---|---|---|---|
| E6 | Workers free plan: 100,000 requests a day; 10 ms CPU per request, not counting network waits; 50 outgoing calls per request; 128 MB; 3 MB per Worker | ✅ | Cloudflare's limits and pricing pages (web search, 2026-10-12) |
| E7 | Realtime Database REST conditional writes: `X-Firebase-ETag: true` on a GET returns an `ETag`; a PUT with `if-match` gets **412** with the current value and ETag when it is stale; a missing node's ETag is `null_etag` | ✅ | Firebase REST reference; **execution** against the Database emulator: all four behaviours, plus server timestamps and multi-path PATCH |
| E8 | REST authentication with a service account's OAuth token: `Authorization: Bearer <token>` is accepted, with the scopes `firebase.database` and `userinfo.email`; such a token bypasses the rules | ✅ | Firebase "Authenticate REST requests" (read 2026-10-12) |
| E9 | IAM: `roles/firebasedatabase.admin` is the only Realtime Database role with `instances.update`. No separate data permission exists. | ✅ (reading) | Google Cloud IAM reference. That this role alone can read and write data is **confirmed only by your smoke test** (`/health` → `db: ok`, then the test event → 200). |
| E10 | Google's JWK endpoint for securetoken publishes exactly the key ids of the documented x509 endpoint | ✅ | **execution:** `curl` of both, ids compared (4 = 4) |
| E11 | `wrangler secret put` reads a piped value when stdin isn't a terminal, and trims trailing whitespace; for a Worker that doesn't exist yet it offers to create a draft | ✅ | reading wrangler 4.142.0's own source (`cli.js`) |
| E12 | Workers Logs is included in the free plan (`[observability] enabled = true`) | ✅ | Cloudflare's Workers Logs page |
| E13 | wrangler 4.142.0 (2026-09-27) needs Node ≥ 22; it bundles workerd 1.20260926.1; the lockfile also lists the Windows and macOS builds of workerd and esbuild, so `npm ci` works on your PC | ✅ | **execution:** `npm view`; the lockfile entries |
| E14 | Cloudflare's local runtime runs here: WebCrypto RSA and HMAC, settings, and `fetch` to a local port | ✅ | **execution:** a throwaway Worker under `wrangler dev` |

### Test runs (execution)

| Suite | Command (in `worker/`) | Result |
|---|---|---|
| Unit | `npm test` | **67 / 67 pass** |
| Emulator | `npm run test:emu` | **130 / 130 pass**: the 67, plus 60 cases against the Auth and Database emulators (checkout 22, webhook 26, rules 12), plus the 3 groups |
| End to end | `npm run test:e2e` | **9 / 9 pass**: 8 cases plus the group, run against the real bundle in **workerd** via `wrangler dev`, the emulators, and a local stand-in for Stripe's API |
| Bundle | `npx wrangler deploy --dry-run` | builds; **54.29 KiB** (15.28 KiB gzipped), against a 3 MB limit; bindings as in `wrangler.toml` |
| Parity | `node scripts/catalog-parity.js` | exit 2, as before (Phase 2 adds the client's block) |
| CPU | WebCrypto timings in Node 22 | signing the hourly Google token **0.72 ms**; importing the account key 0.11 ms; verifying an ID token 0.08 ms; importing one Google key 0.05 ms; HMAC of a 4 KB webhook 0.07 ms. A fresh isolate's first checkout needs about 1 ms of CPU for crypto, against the 10 ms allowance. Measured in Node, whose native crypto is comparable to workerd's; the local runtime doesn't enforce the CPU limit, so this is the closest available evidence. |

<details><summary><strong>New unit tests</strong> (25)</summary>

- **Stripe client** (`stripe.test.js`, 8):
  - form encoding;
  - a whole session round-tripped through the encoding;
  - the key, the pinned version and idempotency keys;
  - every call's address;
  - error fields, with no retry on a 400;
  - one retry on a network error or 5xx, with the same idempotency key, and none when the provider says not to;
  - signatures: wrong secret, tampered body, too old, malformed, v0 only, no secret;
  - **Stripe's own library**: its test header passes our check, and our signature passes its `constructEvent`.
- **Service-account tokens** (`google.test.js`, 3):
  - the assertion's header and claims, with its signature verified by the public key;
  - reuse until 5 minutes before expiry;
  - refusals that never echo the assertion.
- **ID tokens** (`idtoken.test.js`, 5):
  - a genuine token;
  - every claim Firebase lists;
  - a changed claim, another key, alg `none`, a missing kid, HS256, malformed input;
  - key caching and rotation, with refetches limited to one a minute;
  - emulator mode accepts only unsigned tokens, and still checks the claims.
- **REST client** (`rtdb.test.js`, 5):
  - addresses, the token header and silent writes;
  - a compare-and-swap commit, and "leave it" writing nothing;
  - 412 → recomputed on the server's value;
  - endless contention gives up with `db_contention`;
  - a refused token is `db_denied`.
- **Entry point** (`worker.test.js`, 4):
  - unconfigured: `/health` names what is missing, and everything else is 503;
  - a key file that isn't a service account;
  - emulator or fake-provider settings refused next to a live key;
  - a configured Worker routes requests.
- **HTTP helpers** (1, replacing the old `keep()` test): JSON answers that are never cached, and a preflight
  with no body.

</details>

<details><summary><strong>Integration changes</strong></summary>

- Checkout: "a disabled account → 401 (checkRevoked)" became "a token for another project, or an expired one →
  401". `checkRevoked` was dropped (DESIGN § 2, item 18).
- Webhook: the two Admin SDK transaction-trap cases became two compare-and-swap cases:
  - **"a write that lands between the read and the write is not lost"**: a client whose first conditional write is
    preceded by someone else's write. It is refused once (412) and re-run on the server's value, and both writes
    end up in the node.
  - **"concurrent deliveries for one player and item"**: four completions at once. All four orders land, the item
    stays active, and three are flagged as duplicates.
- Every database read and write in the tests now goes through the Worker's own REST client, with the emulator's
  administrator token.

</details>

<details><summary><strong>End to end in workerd</strong> (8)</summary>

- `/health`: test mode, and the database answers;
- the CORS preflight from the site;
- a guest token → 403, another origin → 403, an unknown sku → 400;
- a saved account gets a hosted page. The request the stand-in Stripe received was checked:
  - the key and the pinned API version;
  - an idempotency key;
  - the price, uid and metadata;
  - Managed Payments on, and no Adaptive Pricing;
  - the return URL, and no email locked in.

  Asking again hands back the same page.
- a correctly signed, oddly formatted webhook grants the pass and lights the badge, and its replay is a no-op;
- a body changed after signing → 400, and nothing is written;
- an unknown route → 404;
- the Worker's log output holds no key, signing secret, ID token or email.

</details>

### The non-negotiables after the move

Unchanged from the Phase 1 table: 2, 3, 4, 7, 8, 9 and 10. The rest:

| # | What changed | Proof |
|---|---|---|
| 1 | Grants are written with an administrator's token over REST instead of the Admin SDK: the same privilege, and still only by the webhook handler | the rules tests (unchanged); every server write goes through `shop/…` in `ledger.js` |
| 5 | Raw bytes come from `request.arrayBuffer()`; the HMAC is WebCrypto's | the unit tests, including the cross-check with Stripe's library; end to end in workerd (an oddly formatted body passes, a changed one is refused) |
| 6 | The secrets are Cloudflare secrets. `.dev.vars*`, `.env*` and service-account key files (`neal-with-roblox-*.json`) are git-ignored. | `git check-ignore -v`; the log test end to end; the secret greps below |
| 11 | An unconfigured Worker answers 503 and the game carries on; a refused database key shows on `/health` | `worker.test.js`; the troubleshooting rows in RUNBOOK |

### Verified by reading only

- That **Firebase Realtime Database Admin** alone lets a service account read and write data (E9). Your `/health`
  and test event prove it; RUNBOOK troubleshooting covers `db: denied`.
- That **Windows Command Prompt** pipes into `npx wrangler secret put` as a Mac terminal does. It should: npx
  starts wrangler with inherited input, and wrangler reads piped input (E11). The runbook has a click-only fallback
  for the webhook secret.
- **Cloudflare's real runtime**, as opposed to its local copy (workerd), and Google's real token endpoint and
  database. These are first exercised by your `/health` call and the Stripe test event.

### The six open items, updated

U5 (Blaze, other functions) is **resolved**: there is no Blaze plan and no Cloud Function. U4 and U6 are unchanged
(Managed Payments review; live provider behaviour at Gates 2–3).

### Commit hygiene

Both greps ran on each commit's staged diff. The literal list matched only:
- comments and prose naming key prefixes;
- the `private_key` field names in `google.js` and its tests;
- short fake keys: `sk_test_unit`, `rk_test_unit`, `rk_live_unit` and `sk_test_e2e`.

The strict pattern found nothing (exit 1). The tests generate every RSA key at run time, so no key, real or fake,
is stored in the repository.

---

## Phase 2: client (not started)

## Phase 3: go-live (not started)
