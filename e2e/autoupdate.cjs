// E2E check (Playwright). See e2e/README.md for how to run it.
const path = require('path');
const SHOTS = path.join(__dirname, 'screenshots') + '/';
require('fs').mkdirSync(SHOTS, { recursive: true });
// Tests the no-button update flow against the Firebase hosting emulator (real cache headers).
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const BASE = process.env.E2E_HOSTING || 'http://127.0.0.1:5000';
const rebuild = () => execSync('cd ' + JSON.stringify(path.resolve(__dirname, '..')) + ' && npx vite build', { stdio: 'ignore' });
const served = async (p) => (await (await p.request.get(BASE + '/version.json')).json()).build;
const running = (p) => p.evaluate(() => window.__SPLITBOX_BUILD__);
const setVisibility = (p, state) => p.evaluate((st) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => st });
  document.dispatchEvent(new Event('visibilitychange'));
}, state);

(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());

  // v1: install
  rebuild();
  await p.goto(BASE);
  await p.waitForSelector('h1');
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await p.waitForSelector('h1');
  console.log('SW controls page:', await p.evaluate(() => !!navigator.serviceWorker.controller));
  console.log('fresh install shows Update button:', !!(await p.$('.update-banner')));

  // 1) New deploy → a plain refresh shows it immediately
  rebuild();
  const v2 = await served(p);
  await p.reload(); await p.waitForSelector('h1');
  await p.waitForTimeout(1500);
  console.log('1) after deploy, refresh runs latest with NO button:', (await running(p)) === v2 && !(await p.$('.update-banner')));

  // Make a trip so later steps have something to open
  await p.fill('input[placeholder="Goa 2026"]', 'Update test');
  await p.fill('input[aria-label="Your name"]', 'Asha');
  await p.fill('input[aria-label="Person 2"]', 'Ravi');
  await p.click('text=Create trip');
  await p.waitForSelector('text=Who are you?');
  await p.click('.pick:has-text("Asha")');
  const tripUrl = p.url();

  // 2) App left open during a deploy -> Update button appears; nothing reloads by itself
  await p.click('text=Add the first expense');
  await p.fill('input[placeholder="Dinner, taxi, hotel…"]', 'Half-typed expense');
  const before = await running(p);
  rebuild();
  const v3 = await served(p);
  await setVisibility(p, 'hidden'); await setVisibility(p, 'visible');
  await p.waitForSelector('.update-banner', { timeout: 15000 });
  await p.waitForTimeout(2000);
  const kept = await p.inputValue('input[placeholder="Dinner, taxi, hotel…"]').catch(() => null);
  console.log('2) open app: Update button shown, no auto-reload, typed text kept:', (await running(p)) === before && kept === 'Half-typed expense');
  await p.screenshot({ path: SHOTS + 'update-banner.png' });
  await p.click('.modal-foot >> text=Cancel');
  await p.click('.update-banner >> text=Update');
  await p.waitForFunction((v) => window.__SPLITBOX_BUILD__ === v, v3, { timeout: 15000 });
  await p.waitForSelector('.tabs');
  console.log('3) tapping Update loads the new version, stays on trip, banner gone:', p.url() === tripUrl && !(await p.$('.update-banner')));
  const v4 = v3;

  // 4) Offline launch still works, including a trip link never opened before
  await p.waitForSelector('.tabs');
  await p.waitForTimeout(1500);
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('.tabs', { timeout: 15000 });
  console.log('4) offline reload of trip works:', (await running(p)) === v4);
  await p.goto(BASE + '/t/NEVERSEEN');
  await p.waitForSelector("text=Can't reach the server", { timeout: 20000 });
  console.log('   offline, unseen trip link still opens the app shell');
  await ctx.setOffline(false);

  
  console.log('ERRORS', errs);
  await br.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
