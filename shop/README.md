# 🔐 The Restricted shop

Everything the shop needs that **isn't the game itself** is in this folder.

The game stays at the top of the repository: `index.html`, `app.js`, `style.css`, `sw.js`, `assets/` and the
policy pages in `legal/`. GitHub Pages serves the site from there, so those files can't move. The shop's part of
the game is `app.js § 46` (search for `§ 46 · v84`).

| In this folder | What it is |
|---|---|
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | **Start here.** Step-by-step instructions for putting the server online, testing a purchase and going live. |
| [`docs/DESIGN.md`](docs/DESIGN.md) | How the shop works, and why it works that way. |
| [`docs/TESTING.md`](docs/TESTING.md) | What has been tested and how, and what still needs checking. |
| `worker/` | The purchase server, a Cloudflare Worker, and its tests. You deploy it from here with `npx wrangler deploy`. |
| `scripts/` | Tools you run by hand: create the products in Stripe, create the webhook, and check that the game's price list matches the server's. |
| `database.rules.json` | Your Realtime Database rules: the whole game's, plus the `shop` block. Paste them into the Firebase Console. |
| `firebase.json`, `.firebaserc` | Settings for the local Firebase emulators the tests use. Nothing is deployed from them. |

No file in this folder holds a password or key. Those live only in Cloudflare and Stripe.
