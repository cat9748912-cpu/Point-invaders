'use strict';
// Writes worker/.dev.vars, where `wrangler dev` reads a Worker's secrets for a
// local run: the two the Worker needs against the emulators, with throwaway
// values. The file is git-ignored (`.dev.vars*`), the key is a test-mode
// placeholder that no provider would accept, and the webhook secret is only ever
// used to sign this suite's own requests.
const fs = require('node:fs');
const path = require('node:path');

const E2E = { STRIPE_SECRET_KEY: 'sk_test_e2e', STRIPE_WEBHOOK_SECRET: 'test-signing-secret-e2e' };

if(require.main === module){
  const file = path.join(__dirname, '..', '..', '.dev.vars');
  fs.writeFileSync(file, Object.entries(E2E).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  console.log('wrote', path.relative(process.cwd(), file));
}

module.exports = { E2E };
