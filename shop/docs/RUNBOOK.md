# Runbook: putting the Restricted shelf's server online

**Gates 1 and 2. Everything here is Stripe TEST mode.** Live mode is Phase 3 and has its own checklist.
Steps 0–8 put the server online (Gate 1, done). **Step 9 is Gate 2:** trying the game's 🔐 Restricted aisle with
Stripe's test card.
The server is a **Cloudflare Worker on the free plan**: no card and no Firebase Blaze plan. You run these steps
on your own computer; nothing in this repository can deploy by itself.

**Where things are (since 2026-10-13).** Everything for the shop is in the repository's **`shop`** folder: the
server (`shop/worker`), the scripts (`shop/scripts`), these documents (`shop/docs`) and the rules file. The game
itself stays at the top. If you downloaded the code before this date, your copy has `worker` at the top instead;
it still works for every command below.

Allow about 45 minutes. Each step says what you should see. The commands are for **Windows Command Prompt**; where
a Mac or Linux terminal needs something different, that is given too.

**Keys are passwords.** Paste one only where a step says: into a command's prompt. Never paste one into a chat
(this one included), an email, a file or a screenshot.

---

## 0. What you need

- **Node.js 22 or 24**: the LTS version from [nodejs.org](https://nodejs.org).
- **A free Cloudflare account**: [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up). No card.
- **A Stripe account** for your Singapore business ([dashboard.stripe.com](https://dashboard.stripe.com)).
- **Owner access** to the Firebase project `neal-with-roblox`. The free Spark plan is fine.

**Get the code.** Open [the repository on GitHub](https://github.com/cat9748912-cpu/Point-invaders), click the
green **Code** button, then **Download ZIP**, and unzip it.

**Open Command Prompt in the right place.** In File Explorer, open the unzipped folder, then the folder of the same
name inside it, then **`shop`** (you should see `worker`, `scripts` and `docs`). Click the address bar, type
`cmd`, and press Enter. Then:

```
cd worker
npm ci --omit=dev
```

That downloads Cloudflare's tool (wrangler) and Stripe's library, which the setup scripts use, in a minute or two.
Warnings are fine. **Every command below runs in this `worker` folder** (`shop\worker`).

*Optional: run the tests yourself.* Run `npm ci` without `--omit=dev`, then `npm test` (67 tests). The emulator
suites `npm run test:emu` (130) and `npm run test:e2e` (9) also need Java 21 and `npm install -g firebase-tools`.

---

## 1. Database rules

*Skip this if you already published them.*

1. Firebase console → **Realtime Database** → **Rules**.
2. **If you've changed your rules there since you pasted them to me, stop and tell me first.**
3. Open `database.rules.json` (in the `shop` folder) with **Notepad**, then press **Ctrl+A** and **Ctrl+C**.
4. In the Rules editor press **Ctrl+A**, then **Ctrl+V**, then click **Publish**.
5. Paste the same text into your own master copy, `_firebase/database.rules.json`, and save it.

The file is your rules exactly as you pasted them, plus one `shop` section that no player's browser can write to.

---

## 2. A key that lets the Worker write to the database

The Worker runs outside Google, so it needs its own key: a **service account** with exactly one role. The Firebase
project is also a Google Cloud project, and this costs nothing.

1. Open [console.cloud.google.com](https://console.cloud.google.com) and pick the project **neal-with-roblox** at
   the top.
2. Menu ☰ → **IAM & Admin** → **Service Accounts** → **+ Create service account**.
   - Name: `point-invaders-shop` → **Create and continue**.
   - Role: search for and pick **Firebase Realtime Database Admin** → **Continue** → **Done**. Give it no
     other role.
3. Click the new account, open the **Keys** tab → **Add key** → **Create new key** → **JSON** → **Create**.
   A file named like `neal-with-roblox-1a2b3c4d5e6f.json` downloads.

That file can read and write your whole database. **Don't put it in the project folder, upload it or send it.**
You hand it to Cloudflare in step 5, then delete it.

---

## 3. Stripe (test mode)

*Skip what you've already done.*

1. In [dashboard.stripe.com](https://dashboard.stripe.com), turn on **Test mode** (top right), or use a **Sandbox**.
2. **Settings → Business → Public details:**
   - Support email: `cat9748912@gmail.com`
   - Website: `https://pointinvaders.com`
   - **Terms of service:** `https://pointinvaders.com/legal/terms.html`
   - **Privacy policy:** `https://pointinvaders.com/legal/privacy.html`

   The checkout's "I agree to the Terms" box needs the Terms address set here. The two pages go live when this branch
   is merged (see the end).
3. **Settings → Managed Payments** ([direct link](https://dashboard.stripe.com/settings/managed-payments)): start
   the eligibility review and accept the terms. Nothing today depends on the answer. *If Stripe declines, tell me.*
4. **Developers → API keys:**
   - **Create restricted key.** Name it `point-invaders-shop (test)`. Set these permissions and leave everything
     else at **None**. It starts `rk_test_`, and you paste it once, in step 5.

     | Resource | Permission |
     |---|---|
     | Checkout Sessions | **Write** |
     | Refunds | **Write** |
     | Prices | Read |
     | Products | Read |
     | PaymentIntents | Read |
     | Charges | Read |

   - The standard **Secret key** (`sk_test_…`) on the same page is only for the two setup scripts, in your
     Command Prompt.

---

## 4. Products and prices (test)

*If you already ran this, run just the last line: every row should say `ok`.*

```
set /p STRIPE_SECRET_KEY=Paste the TEST secret key (sk_test_...) and press Enter: 
node ../scripts/seed-products.js
node ../scripts/seed-products.js --apply
node ../scripts/seed-products.js
```

On a Mac, use `read -rs STRIPE_SECRET_KEY && export STRIPE_SECRET_KEY` for the first line instead.

- The first run is a preview. It says `Mode: TEST`, with `create` on every row.
- The second creates the nine products.
- The third should say `ok` on every row. Copy that table for me.

**Keep this window open:** step 6 uses the same key. If you close it, run the `set /p` line again.

---

## 5. Put the Worker online

```
npx wrangler login
```

Your browser opens Cloudflare: sign in and click **Allow**.

```
npx wrangler deploy
```

If it asks to register a **workers.dev subdomain**, say yes and pick a short name. At the end it prints the
Worker's address, like:

```
https://point-invaders-shop.<your-subdomain>.workers.dev
```

Copy it. Now give the Worker its keys; each command asks for the value and shows nothing while you paste:

```
npx wrangler secret put STRIPE_SECRET_KEY
```

When asked, paste the **restricted** key (`rk_test_…`) and press Enter.

```
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT < 
```

Type that line as shown, ending with a space, but **don't press Enter yet**. Drag the downloaded
`neal-with-roblox-….json` file onto the Command Prompt window: its path appears. Then press Enter.
**Then delete that file** and empty the Recycle Bin. On a Mac: `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT <`,
then a space and the file's path.

**Check:** open `https://point-invaders-shop.<your-subdomain>.workers.dev/health` in your browser. It should show:

```
{"ok":false,"error":"config","missing":["STRIPE_WEBHOOK_SECRET"]}
```

That is expected until step 6. Anything else missing means a `secret put` didn't take: run it again.

---

## 6. Connect Stripe to the Worker (the webhook)

The webhook is how Stripe tells the Worker "this was paid" or "this was refunded". The script registers exactly the
seven events the code handles, on the API version it was written for, and hands the signing secret straight to
Cloudflare without showing it. In the same window as step 4, put your own address in the first line:

```
set URL=https://point-invaders-shop.<your-subdomain>.workers.dev/webhook
node ../scripts/create-webhook-endpoint.js %URL%
node ../scripts/create-webhook-endpoint.js %URL% --apply | npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

- The first script line is a preview: the address, the API version and the seven events.
- The second creates the endpoint, and wrangler stores its secret.

On a Mac, write `URL=…` without `set`, and `$URL` instead of `%URL%`.

Then close the Command Prompt window: that forgets the Stripe key it held.

<details><summary>If that last line fails: create the webhook by clicking instead</summary>

1. Stripe → **Developers → Webhooks → Add destination**.
2. Events from: **Your account**. API version: **2026-09-30.endive**.
3. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`,
   `charge.dispute.created`, `charge.dispute.closed`.
4. Destination type: **Webhook endpoint**, with your `…/webhook` address. Create it.
5. **Signing secret → Reveal**, and copy it.
6. In Command Prompt, in the `worker` folder: `npx wrangler secret put STRIPE_WEBHOOK_SECRET`, paste it, and press
   Enter.

</details>

---

## 7. Check that it works

1. Open `https://point-invaders-shop.<your-subdomain>.workers.dev/health`. It should now show:

   ```
   {"ok":true,"live":false,"db":"ok"}
   ```

   `"live":false` means test mode, which is right. `"db":"ok"` means the Worker can reach your database with its key.
2. In Stripe → **Developers → Webhooks** → your endpoint → **Send test event** → `checkout.session.completed`.
   The delivery should show **200**, with a response containing `"skipped":"not_ours"`. That proves the secret
   matches, and that the Worker can write to the database: test events don't carry the game's details, so nothing is
   unlocked. If there's no such button, install the [Stripe CLI](https://docs.stripe.com/stripe-cli), run
   `stripe login`, then `stripe trigger checkout.session.completed`.
3. *Optional, in Command Prompt:*

   ```
   curl -s -X POST %URL% -d "{}"
   ```

   This should print `{"error":"signature"}`.

**Logs:** Cloudflare dashboard → **Workers & Pages** → `point-invaders-shop` → **Logs**, or run `npx wrangler tail`
in the `worker` folder. You should never see a key, a token or an email address in them.

---

## 8. What to send me (this starts Phase 2)

1. The Worker's address, and what `/health` showed.
2. That the **rules are published**.
3. **Managed Payments**: approved, under review or declined.
4. The seed script's **final table**. It contains no secrets.
5. The test event's **delivery status** (it should be 200).

Never send a key, the signing secret, the JSON key file, or a screenshot that shows one.

---

## 9. Gate 2: buy something with Stripe's test card

The game on **pointinvaders.com** has the 🔐 Restricted aisle since 2026-10-13, switched off for everyone. This
switches it on for your browser and buys something with your Worker and Stripe's sandbox. **Nothing is charged**:
a sandbox only takes test cards. It uses your **real** database, so sign in with your own account. About 15
minutes, and you don't need Command Prompt unless step 3 sends you there.

1. **Open the game with the shop switched on.** In Chrome or Edge, go to:
   ```
   https://pointinvaders.com/?shop=beta
   ```
   The `?shop=beta` part switches the aisle on for this browser only; the address bar drops it straight away.
   (`?shop=off` switches it off again.) Sign in with your account.
2. **Find the aisle.** Hub → **🛒 Black Market** → **🔐 Restricted** (the last tab). You should see nine items,
   each with a price. No such tab? Reload the page once: the new version can take a minute to arrive.
3. **Buy one.** Press **BUY · $1.99** on **Aurora**, tick the age box, and press **CONTINUE · $1.99**. You should
   land on Stripe's checkout page, marked as a test or sandbox.
   - **"📡 Couldn't reach checkout. Nothing was charged."** instead? Managed Payments is probably not switched
     on in your sandbox. In Stripe, still in the sandbox: **Settings → Managed Payments**. Switch it on and
     accept its terms if the page lets you, then press CONTINUE again. If it can't be switched on yet (the
     review), open Command Prompt in the **`worker` folder you deployed from at Gate 1** and run:
     ```
     npx wrangler deploy --var MANAGED_PAYMENTS:false
     ```
     Your sandbox checkout then runs without Managed Payments (no tax line) while you test. Put it back after
     Gate 2 with `npx wrangler deploy` in the same folder.
4. **Pay with the test card.** Card number `4242 4242 4242 4242`, any future date (`12/34`), any three digits,
   any name. If it asks for an email or a phone number, use your own. Press **Pay**.
5. **Come back.** Stripe sends you back to the game. You should see **"🔐 Confirming your purchase…"**, then,
   within a few seconds, **"✅ Aurora unlocked — thank you!"**. In the Black Market, Aurora now says **🔐 OWNED**.
   Press **EQUIP**: the whole game turns mint green.
6. **The receipt in the game.** ⚙️ Settings → **🔐 PURCHASES**: the order shows **✅ PAID**, with a reference
   starting `pi_`.
7. **Refund it.** In Stripe (sandbox): **Transactions** → the $1.99 payment → **Refund payment** → the full
   amount → **Refund**. Within a few seconds the game's colour goes back to cyan, Aurora says **BUY** again,
   and Settings → Purchases says **↩️ REFUNDED**.
8. **If you have time** (all optional):
    - **The Supporter Pass:** buy it the same way. A gold ◆ appears beside your name on the leaderboard (allow a
      minute), and the **Patron** colour unlocks.
    - **An exhibition:** buy **Aegis Field**, then press **🎟️ ARM FOR NEXT ROUND** on its card and play any
      mission from the grid. The round says **EXHIBITION**; crashes are absorbed; at the end a card shows your
      score **NOT BANKED**. Your points, credits and XP don't move.
    - **Cancelling:** press BUY → CONTINUE, then on Stripe's page press the back arrow (←). The game says
      **"Checkout cancelled. Nothing was charged."**
    - **Your phone:** open `https://pointinvaders.com/?shop=beta` on it and buy something cheap. If the game is
      on your home screen, try it from there too: that is the "installed app" way back from Stripe, which only a
      real phone can test.

**Send me:**
1. Did Stripe's page open at step 3, and did you need the `MANAGED_PAYMENTS:false` line?
2. Did "unlocked" appear at step 5, and did the refund take the colour away at step 7?
3. If you tried your phone: which phone, from the browser or the home screen, and did "unlocked" appear?
4. Anything that looked wrong. A screenshot is fine, as long as it shows no key.

---

## Troubleshooting

| What you see | Why | Fix |
|---|---|---|
| `/health` → `"missing":[…]` | a secret isn't set | run `npx wrangler secret put <that name>` again (step 5 or 6) |
| `/health` → `"db":"key"` | Google refused the service account key | redo step 2.3 to make a new key, then the `FIREBASE_SERVICE_ACCOUNT` line in step 5 |
| `/health` → `"db":"denied"` | Google accepted the key, but the database refused it: usually the service account lacks its role, or the role hasn't taken effect yet | Google Cloud → IAM & Admin → **IAM** (not Service Accounts): check that `point-invaders-shop@…` has **Firebase Realtime Database Admin**, or add it with **Grant access**. Wait 5 minutes, then reload. Still denied? Use Firebase's own key instead: Firebase console → ⚙️ Project settings → **Service accounts** → **Generate new private key**, then redo the `FIREBASE_SERVICE_ACCOUNT` line of step 5 with that file. It can reach more of Firebase, so keep Cloudflare two-step sign-in on. |
| step 2: "Service account key creation is disabled" | an organisation policy | tell me |
| `npx wrangler deploy` → "You need to register a workers.dev subdomain" | a new Cloudflare account | Cloudflare dashboard → **Workers & Pages**, which sets one up, then run the deploy again |
| `'npx' is not recognized` | Node.js isn't installed, or the window was opened before it was | install Node.js, then open a new Command Prompt |
| webhook deliveries → **400** | the signing secret doesn't match the endpoint | step 6 again (or roll the secret in Stripe and `secret put` it) |
| webhook → `{"ignored":"mode"}` | a live key with a test endpoint, or the reverse | use the same mode for both |
| a checkout later says `unpriced` | products not seeded in this mode | step 4 |
| step 9: no 🔐 Restricted tab | the shop isn't switched on in this browser, or the page is the old version | open `https://pointinvaders.com/?shop=beta` again, and reload once |
| step 9: the aisle says *"Your purchases can't be read from here right now"* | the database rules from step 1 aren't published | step 1, then reload |
| step 9: "Still processing…" after paying, for more than a minute | Stripe's notification isn't reaching the Worker | Stripe → **Workbench → Webhooks** → your endpoint: the latest delivery should say 200. Then ⚙️ Settings → **🔄 RESTORE PURCHASES**. |

## Undo

- **Close the shop now:** Firebase → Realtime Database → **Data** → add `shop` → `cfg` → `open` = `false`. New
  checkouts are refused; owned items keep working.
- **Remove the Worker:** `npx wrangler delete` in the `worker` folder.
- **Withdraw the database key:** Google Cloud → IAM & Admin → Service Accounts → `point-invaders-shop` → **Keys** →
  delete the key. Do this if the key file was ever seen by anyone.
- **Stripe:** delete the webhook endpoint under Developers → Webhooks.
- **Rules:** paste your previous copy back, but only after removing the Worker.

## What it costs

Nothing a month. Cloudflare's free plan allows 100,000 requests a day, far more than the shop needs. Firebase stays on
the free Spark plan. Stripe charges per sale, nothing else. If the daily limit were ever reached, the shop would
stop answering until the next day and the game would carry on without it; Stripe retries its webhooks for three
days.

## The beta on the real site

The branch was merged into `main` on **2026-10-13**, so pointinvaders.com runs v84: the service-worker fix, and
the 🔐 Restricted aisle, **switched off**. Players see what they saw before. The aisle appears only in a
browser that opened the site with `?shop=beta`, and only Stripe's test cards work until Phase 3 switches to live
keys (and sets `SHOP_LIVE` in `app.js`).

- The three **draft** legal pages are public now, each with its DRAFT banner, at `pointinvaders.com/legal/…`.
- `shop/` (the server's code, the scripts, these documents and the rules file) is readable at
  `pointinvaders.com/shop/…`, as agreed at Gate 0. None of it contains a secret.
- **To close the shop at any time:** the kill switch in **Undo** above. Owned items keep working.
