// E2E check (Playwright). See e2e/README.md for how to run it.
// Edits made before the server has confirmed an entry (right after adding it, or offline) must
// still sync. Regression: edits used to send back the local estimate of createdAt, which the
// rules reject as rewriting history.
const { chromium } = require('playwright');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    p.on('dialog', (d) => d.accept());
    return { ctx, p };
  };
  const fail = (msg) => { console.log('FAIL', msg); process.exitCode = 1; };

  const { ctx: ctxA, p: a } = await mk();
  await a.goto(BASE);
  await a.fill('input[placeholder="Goa 2026"]', 'Quick edit');
  await a.fill('input[placeholder="Your name"]', 'Asha');
  await a.fill('input[placeholder="Friend 1"]', 'Ravi');
  await a.click('text=Create trip');
  await a.waitForURL(/\/t\/[A-Z0-9]+$/);
  const url = a.url();
  await a.click('.pick:has-text("Asha")');

  // 1. Add, then edit immediately (no waiting for the server)
  await a.click('text=Add the first expense');
  await a.fill('input[placeholder="Dinner, taxi, hotel…"]', 'Snacks');
  await a.fill('.modal input[placeholder="0.00"]', '10');
  await a.click('.modal-foot >> text=Add');
  await a.click('.list-item:has-text("Snacks")');
  await a.fill('.money-input >> nth=0 >> input', '15');
  await a.click('.modal-foot >> text=Save');
  await a.waitForSelector('.modal', { state: 'detached' });

  // 2. Offline: add and edit, then reconnect
  await a.waitForTimeout(1500);
  await ctxA.setOffline(true);
  await a.click('.fab');
  await a.fill('input[placeholder="Dinner, taxi, hotel…"]', 'Ferry');
  await a.fill('.modal input[placeholder="0.00"]', '40');
  await a.click('.modal-foot >> text=Add');
  await a.click('.list-item:has-text("Ferry")');
  await a.fill('.money-input >> nth=0 >> input', '44');
  await a.click('.modal-foot >> text=Save');
  await a.waitForSelector('.modal', { state: 'detached', timeout: 5000 }).catch(() => fail('edit dialog stuck while offline'));
  await ctxA.setOffline(false);

  // Another device sees both edits on the server
  const { p: b } = await mk();
  await b.goto(url);
  await b.click('.pick:has-text("Ravi")');
  await b.waitForSelector('.list-item:has-text("Snacks"):has-text("15.00")', { timeout: 20000 }).catch(() => fail('quick edit did not sync'));
  await b.waitForSelector('.list-item:has-text("Ferry"):has-text("44.00")', { timeout: 30000 }).catch(() => fail('offline edit did not sync'));
  console.log('quick and offline edits synced');
  const toast = await a.$('.toast:has-text("Failed")');
  if (toast) fail('a save failed: ' + (await toast.textContent()));

  console.log('ERRORS', JSON.stringify(errs));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
