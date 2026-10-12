# Runbook: deploying the Restricted shelf's server

**Gate 1. Everything here is Stripe TEST mode.** Live mode is Phase 3 and has its own checklist.
You run these steps on your own machine; nothing in this repository can deploy by itself.

Allow about 45 minutes. The steps are in order, and each says what you should see. Where you paste a
key, paste it only where the step says: never in a chat, an issue or a commit.

---

## 0. What you need

- **Node.js 22 or 24** with npm, and git.
- **The Firebase CLI 15**: `npm install -g firebase-tools@15`.
- **Owner access** to the Firebase project `neal-with-roblox`.
- **A Stripe account** for your Singapore business (`dashboard.stripe.com`).
- *Optional, only to run the emulator tests yourself:* Java 21.
- *Optional, for step 7 if your Dashboard has no "Send test event" button:* the
  [Stripe CLI](https://docs.stripe.com/stripe-cli).

```sh
git clone https://github.com/cat9748912-cpu/Point-invaders.git
cd Point-invaders
git checkout claude/stoic-cori-irbsqk
(cd functions && npm ci)
firebase login
firebase use neal-with-roblox          # .firebaserc already names it; this just confirms access
```

*Optional* (all of these pass in the build environment; see `TESTING.md`):

```sh
cd functions
npm test             # 42 unit tests, no emulators needed
npm run test:emu     # 105 tests (the 42 above, plus 63 against the Auth + Database emulators, including YOUR rules file; needs Java)
npm run test:e2e     # 7 tests: the deployable function inside the Functions emulator (needs Java)
cd ..
```

---

## 1. Firebase: Blaze plan and a budget alert

Cloud Functions and Secret Manager need the pay-as-you-go **Blaze** plan.

1. Open the [Firebase console](https://console.firebase.google.com/) and select **neal-with-roblox**.
2. Bottom left: **Spark plan → Upgrade**. Choose **Blaze** and link a billing account.
3. Set a budget so a surprise can't happen quietly. Open the
   [Google Cloud billing page](https://console.cloud.google.com/billing), then: your billing account →
   **Budgets & alerts** → **Create budget**.
   - Projects: `neal-with-roblox`.
   - Amount: e.g. **US$10 per month**.
   - Alerts at 50 %, 90 % and 100 %, emailed to you.

What it should cost at this game's size: Cloud Functions' free tier covers 2 million calls a month.
Secret Manager is about US$0.06 per secret per month, and there are two. Storing the function's build
image costs a few cents.

Then check what is already deployed:

```sh
firebase functions:list
```

If anything other than `shop` is listed, it is left alone (our deploy only touches the `shop`
codebase), but tell me what is there.

---

## 2. Database rules

The repository's `database.rules.json` is **your rules exactly as you pasted them, plus one `shop` block
at the end**. It was checked mechanically: with `shop` removed, the file equals your rules.

1. Firebase console → **Realtime Database** → **Rules**.
2. Select all the text in the editor, replace it with the contents of `database.rules.json`, then
   **Publish**.
3. Update your own copy `_firebase/database.rules.json` to match (the code's comments call that copy the
   master).
4. *Optional:* **Data** tab → add `shop` → `cfg` → `open` = `true`. This is the kill switch. If it is
   missing, the shop counts as open.

**Check it** in the Rules tab's **Rules Playground**:

| Simulate | Location | Authenticated | Expected |
|---|---|---|---|
| read | `/shop/badge` | no | ✅ allowed |
| write | `/shop/ent/abc/col_aurora` | yes, uid `abc` | ❌ denied |
| read | `/shop/ent/abc` | yes, uid `abc` | ✅ allowed |
| read | `/shop/ent/abc` | yes, uid `xyz` | ❌ denied |

---

## 3. Stripe (test mode)

1. [dashboard.stripe.com](https://dashboard.stripe.com): switch **Test mode** on (top right), or use a
   **Sandbox**.
2. **Settings → Business → Public details:**
   - Support email: `cat9748912@gmail.com`
   - Website: `https://pointinvaders.com`
   - **Terms of service:** `https://pointinvaders.com/legal/terms.html`
   - **Privacy policy:** `https://pointinvaders.com/legal/privacy.html`

   The checkout's "I agree to the Terms" box needs the Terms URL set here.
3. **Settings → Managed Payments** ([direct link](https://dashboard.stripe.com/settings/managed-payments)).
   Start the eligibility review and **accept the Managed Payments terms**. Your business location must be
   Singapore. If Stripe offers Terms and Privacy fields under **Settings → Checkout**, put the same two
   URLs there too.
   - *If Stripe declines Managed Payments, stop and tell me.* The choices then are to sell as the
     merchant yourself (you would handle VAT/GST registrations) or to use another merchant-of-record
     provider. You told me you want the provider to handle taxes, so that is a decision for you, not a
     setting.
4. **Developers → API keys:**
   - **Create restricted key.** Name it `point-invaders-shop (test)` and give it only these permissions
     (everything else **None**):

     | Resource | Permission |
     |---|---|
     | Checkout Sessions | **Write** |
     | Refunds | **Write** |
     | Prices | Read |
     | Products | Read |
     | PaymentIntents | Read |
     | Charges | Read |

     Copy it (it starts `rk_test_`). You will paste it once, in step 5.
   - The standard **Secret key** (`sk_test_…`) on the same page is for the two setup scripts below, in
     your terminal only.

---

## 4. Products and prices (test)

From the repository root:

```sh
read -rs STRIPE_SECRET_KEY && export STRIPE_SECRET_KEY   # paste the TEST secret key (sk_test_…), press Enter; nothing is shown or saved
node scripts/seed-products.js            # dry run
node scripts/seed-products.js --apply
node scripts/seed-products.js            # again: every row should now say ok / ok
```

The dry run prints:

```
Mode: TEST   DRY RUN (add --apply to make these changes)

sku             price  product  price object
--------------  -----  -------  ------------
pass_supporter  $4.99  create   create
col_aurora      $1.99  create   create
col_ultra       $1.99  create   create
cur_comet       $1.99  create   create
skin_kitsune    $2.99  create   create
skin_unicorn    $2.99  create   create
wld_polar       $3.99  create   create
pu_aegis        $2.99  create   create
pu_anchor       $2.99  create   create
```

**Keep `STRIPE_SECRET_KEY` set for step 6.**

In the Dashboard's **Product catalog** you should now see nine products. Each has one price in USD,
marked **tax inclusive**, whose **lookup key** is the SKU. The tax code reads "Video Games – downloaded –
non subscription – with permanent rights".

---

## 5. Secrets and the first deploy

```sh
firebase functions:secrets:set STRIPE_SECRET_KEY        # paste the RESTRICTED key (rk_test_…) when asked
printf 'not-set-yet' | firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --data-file -
firebase deploy --only functions:shop
```

The first deploy takes a few minutes, and asks a few questions:

- To enable Cloud Functions, Cloud Build, Artifact Registry, Cloud Run and Secret Manager: answer **yes**.
- A value for each of the shop's three settings, `SHOP_MANAGED_PAYMENTS`, `SHOP_AUTO_REFUND_DUPES` and
  `SHOP_SITE`, with the right default already filled in: press **Enter** three times. The answers are saved
  in `functions/.env.neal-with-roblox`, which git ignores, so later deploys don't ask.
- How many days to keep old container images: press **Enter** for the default (1). It keeps storage costs
  near zero.
- If it ever offers to **delete** a function, answer **no** and tell me.

At the end it prints a line like:

```
Function URL (shop(asia-southeast1)): https://shop-xxxxxxxxxx-as.a.run.app
```

Check both of the function's addresses:

```sh
curl -s https://asia-southeast1-neal-with-roblox.cloudfunctions.net/shop/health; echo
curl -s https://shop-xxxxxxxxxx-as.a.run.app/health; echo     # the URL the deploy printed, + /health
```

Both should print `{"ok":true,"live":false}`.

---

## 6. The webhook endpoint (test)

The script registers exactly the seven events the code handles, on the API version the code was written
for (`2026-09-30.endive`). It then hands the signing secret straight to Firebase, so it never appears on
screen.

```sh
URL=https://asia-southeast1-neal-with-roblox.cloudfunctions.net/shop/webhook
node scripts/create-webhook-endpoint.js $URL                 # dry run: shows the URL, version and events
node scripts/create-webhook-endpoint.js $URL --apply | firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --data-file - --force
unset STRIPE_SECRET_KEY
firebase deploy --only functions:shop                        # picks up the new secret (harmless if --force already did)
```

<details><summary>Or, by clicking in the Dashboard</summary>

1. **Developers → Webhooks → Add destination.**
2. Events from: **Your account**.
3. API version: **2026-09-30.endive**.
4. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`,
   `charge.dispute.created`, `charge.dispute.closed`.
5. Destination type: **Webhook endpoint**, URL as above. Create it.
6. **Signing secret → Reveal.** Run `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET`, paste it,
   then run `firebase deploy --only functions:shop`.

</details>

---

## 7. Smoke tests

```sh
BASE=https://asia-southeast1-neal-with-roblox.cloudfunctions.net/shop
curl -s $BASE/health; echo
curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS $BASE/checkout -H 'Origin: https://pointinvaders.com' -H 'Access-Control-Request-Method: POST'
curl -s -X POST $BASE/checkout -H 'Content-Type: application/json' -d '{"sku":"col_aurora"}'; echo
curl -s -X POST $BASE/webhook -d '{}'; echo
```

| Command | Expected |
|---|---|
| health | `{"ok":true,"live":false}` |
| preflight from the site | `204` |
| checkout without a sign-in | `{"error":"auth"}` |
| webhook without a signature | `{"error":"signature"}` |

Then check that the signature works. In **Developers → Webhooks → your endpoint**, send a test event
(`checkout.session.completed`). If there is no such button, use the Stripe CLI instead: `stripe login` (test
mode), then `stripe trigger checkout.session.completed`.
The delivery should show **200**, with a body like `{"ok":true,"skipped":"not_ours",…}`. Test events do
not carry the game's metadata, so nothing is unlocked; the 200 proves the secret matches.

Logs:

```sh
firebase functions:log --only shop -n 30
```

Look for `webhook: handled` lines. You should never see a key, a token or an email in them.

---

## 8. What to send me (this starts Phase 2)

1. The **Function URL** the deploy printed, and the output of both `/health` calls.
2. That the **rules are published**, and whether you added `shop/cfg`.
3. **Managed Payments**: approved, under review, or declined.
4. The seed script's **final table**. It contains no secrets.
5. The **delivery status** of the test event (it should be 200).

Never send a key, the signing secret, or a screenshot that shows one.

---

## Troubleshooting

| What you see | Why | Fix |
|---|---|---|
| deploy: "must be on the Blaze plan" | the project is on Spark | step 1 |
| deploy: an API is not enabled, or a permission error on first deploy | the APIs are still switching on | wait a minute and run the deploy again |
| `/health` returns an HTML **403 Forbidden** | an organisation policy blocks public functions | Cloud console → **Cloud Run** → `shop` → **Security** → allow unauthenticated invocations |
| checkout → `{"error":"unpriced"}` | products not seeded in this mode | step 4 |
| checkout → `{"error":"provider"}`, and the log says `session refused by provider` with a `param` | usually Managed Payments not enabled yet, or the Terms URL missing | step 3.2–3.3 |
| webhook deliveries → **400** | the signing secret does not match the endpoint | step 6, then deploy again |
| webhook → `{"ignored":"mode"}` | a live key with a test endpoint, or the reverse | use the same mode for both |

## Undo

- **Close the shop now:** Realtime Database → **Data** → `shop/cfg/open` = `false`. New checkouts are
  refused; owned items keep working.
- **Remove the function:** `firebase functions:delete shop --region asia-southeast1`.
- **Rules:** paste your previous copy back, but only after removing the function.

## About merging this branch to `main`

Merging now is **safe for players**. The arcade is unchanged apart from the service-worker fix (v84) that
keeps the new `legal/` pages and any 404 out of the offline copy of the game. Merging would also:

- publish the three **draft** legal pages, each with a DRAFT banner. Do this if Stripe's review asks to
  see your terms, refund policy and privacy policy.
- make `functions/`, `scripts/`, `docs/` and the rules file readable at `pointinvaders.com/…`, as agreed
  at Gate 0. None of them contains a secret.

If nothing needs the pages live yet, waiting for Gate 2 is just as good. If you do merge now, Phase 2
moves to v85.
