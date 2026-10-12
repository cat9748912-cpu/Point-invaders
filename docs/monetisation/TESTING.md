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

### The brief's facts: 32 claims, 28 ✅, 1 ⚠️, 3 ❓

#### Shape of the project

| # | Claim | Verdict | How checked | Evidence and notes |
|---|---|---|---|---|
| B1 | Static site on GitHub Pages, custom domain `pointinvaders.com` (`CNAME`) | ✅ | **execution:** `cat CNAME`; `curl` of the site | `CNAME` = `pointinvaders.com`. The site answers with `server: GitHub.com`. `https://cat9748912-cpu.github.io/Point-invaders/` → **301** to `https://pointinvaders.com/`. |
| B2 | `main` is what the public gets | ✅ | **execution:** fetched `sw.js`, `index.html`, `app.js?v=83`, `style.css?v=83` from the live site and `cmp`'d them against the repo; `git ls-remote origin` | All four are **byte-identical** to `main` = `94571c2` (the remote HEAD). The clone's local `origin/main` ref was stale (`6050254`) and has been refreshed. |
| B3 | No build step, bundler, framework, root `package.json`, tests, CI or `.github/` | ✅ | **execution:** `find . -type f` (excluding `.git`) | 10 files: `CNAME README.md app.js assets/ship62.js index.html og.jpg robots.txt sitemap.xml style.css sw.js` |
| B4 | Four real files plus `assets/ship62.js` | ✅ | **execution:** `wc -l` | `index.html` 1,913 · `app.js` 73,270 · `style.css` 6,451 · `sw.js` 127 · `assets/ship62.js` 2 (texture data). Also served: `og.jpg`, `robots.txt`, `sitemap.xml`, `README.md`. |
| B5 | Numbered `§` sections, prose comments, a `vNN` tag per feature | ✅ | **execution:** `grep` for banner headers and `\bv[0-9]{2}\b` | Last section is `§ 45 · v80` (`app.js:72509`). v81 retired § 41 Mashups (`app.js:71223`); v82 and v83 are tagged fixes with no section; the `v92`/`v97` hits are base64 noise. **Next free: `§ 46`, `v84`.** |
| B6 | `sw.js` precaches the three `?v=83` files; cache `point-invaders-v83` | ✅ | reading | `sw.js:4` (`CACHE`), `sw.js:13–19` (`SHELL`) |
| B7 | The `?v=` stamps in `index.html` and `sw.js` and `CACHE` move together | ✅ | reading | `sw.js:1–3, 10–12`; `index.html:75–80` (`style.css?v=83`), `index.html:1827` (`app.js?v=83`) |
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
| B29 | The rules enumerate top-level nodes; any other top-level write is refused | ❓ | reading (comments only) | Consistent with `app.js:5019–5021`, `51250–51252`, `55837–55839`, `17632`, `18900`. **The rules are not in the repo** (U1). |
| B30 | Validated shapes (`weekly` is exactly `{season, pts}`); one refused key fails the whole `update()` | ❓ | reading (comments) + Firebase documentation | `app.js:3191–3199`. The atomicity of a multi-path `update()` is documented RTDB behaviour. The rule text itself is U1. |
| B31 | A rate-limit rule refuses a `totalPoints` rise not stamped with `lastScoreAt` within 2.5 s | ❓ | reading (comments) | `app.js:6303–6305`, `app.js:4659`, `app.js:4735`, `app.js:68849`. Rule text is U1. |
| B32 | Rules cascade: a parent's `.write` cannot be revoked by a child, so nothing paid may live under the owner-writable `players/<uid>` | ✅ | Firebase documentation; the code writes there as the owner (`saveProfilePatch`) | **Execution planned:** the Phase 1 rules tests include a case showing that a nested `.write:false` under an owner-writable parent does not stop the owner. |

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

## Phase 1: server, rules, legal (not started)

## Phase 2: client (not started)

## Phase 3: go-live (not started)
