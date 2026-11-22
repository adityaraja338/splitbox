// E2E check (Playwright). See e2e/README.md for how to run it.
const path = require('path');
const SHOTS = path.join(__dirname, 'screenshots') + '/';
require('fs').mkdirSync(SHOTS, { recursive: true });
const { chromium } = require('playwright');
const S = SHOTS;
(async () => {
  const br = await chromium.launch();
  // Create a trip online
  const ctxA = await br.newContext({ viewport: { width: 412, height: 900 } });
  const a = await ctxA.newPage(); a.on('dialog', d => d.accept());
  await a.goto((process.env.E2E_BASE || 'http://127.0.0.1:5173'));
  await a.fill('input[placeholder="Goa 2026"]', 'Offline test');
  await a.fill('input[aria-label="Your name"]', 'Asha');
  await a.fill('input[aria-label="Person 2"]', 'Ravi');
  await a.click('text=Create trip');
  await a.waitForSelector('text=Who are you?'); await a.click('.pick:has-text("Asha")');
  const url = a.url();
  console.log('online load OK; banner shown online?', !!(await a.$('.offline-banner')));
  await a.waitForTimeout(3500);
  console.log('banner after 3.5s online?', !!(await a.$('.offline-banner')));

  // Case 1: brand-new device, no network to the database
  const ctxB = await br.newContext({ viewport: { width: 412, height: 900 } });
  const b = await ctxB.newPage();
  await b.route('**/google.firestore.v1.Firestore/**', r => r.abort('connectionfailed'));
  await b.goto(url);
  await b.waitForTimeout(11000);
  const bt = await b.innerText('body');
  console.log('fresh device offline -> not-found shown?', bt.includes('Trip not found'), '| cant-reach shown?', bt.includes("Can't reach the server"));
  await b.screenshot({ path: S + 'offline-fresh.png' });
  // Network comes back: the page should recover on its own
  await b.unroute('**/google.firestore.v1.Firestore/**');
  await b.waitForSelector('h1:has-text("Offline test")', { timeout: 30000 });
  console.log('recovered after network returned');

  // Case 2: device that already opened the trip goes offline and reloads
  await ctxA.setOffline(true);
  await a.reload().catch(() => {});
  await a.waitForTimeout(500);
  await a.goto(url).catch((e) => console.log('reload offline failed (expected, no service worker):', e.message.split('\n')[0]));
  await ctxA.setOffline(false);
  await a.route('**/google.firestore.v1.Firestore/**', r => r.abort('connectionfailed'));
  await a.goto(url);
  await a.waitForTimeout(5000);
  const at = await a.innerText('body');
  console.log('cached device offline -> shows trip?', at.includes('Offline test'), '| banner?', !!(await a.$('.offline-banner')));
  await a.screenshot({ path: S + 'offline-cached.png' });
  await br.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
