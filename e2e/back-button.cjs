// E2E check (Playwright). See e2e/README.md for how to run it.
// Phone back (history back) closes an open form instead of leaving the trip.
const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  const errs = [];
  const p = await (await br.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('dialog', (d) => d.accept()); p.on('pageerror', (e) => errs.push(e.message));
  const fail = (m) => { throw new Error(m); };
  await p.goto(process.env.E2E_BASE || 'http://127.0.0.1:5173');
  await p.fill('input[placeholder="Goa 2026"]', 'Back button test');
  await p.fill('input[aria-label="Your name"]', 'Aarav');
  await p.fill('input[aria-label="Person 2"]', 'Meera');
  await p.click('text=Create trip');
  await p.waitForSelector('text=Who are you?');
  await p.click('.pick:has-text("Aarav")');
  await p.waitForSelector('.modal', { state: 'detached' });
  const tripUrl = p.url();
  const onTrip = async (step) => {
    await p.waitForTimeout(300);
    if (p.url() !== tripUrl) fail(`${step}: left the trip (${p.url()})`);
    if (await p.$('.modal')) fail(`${step}: modal still open`);
  };

  // 1. Back closes Add expense
  await p.click('text=Add the first expense');
  await p.waitForSelector('.modal');
  await p.goBack(); await onTrip('back on Add expense');

  // 2. Cancel, then back still has the trip page underneath (no stray entry)
  await p.click('text=Add the first expense');
  await p.click('.modal-foot >> text=Cancel'); await onTrip('cancel');

  // 3. Save closes without leaving; then open Edit and go back
  await p.click('text=Add the first expense');
  await p.fill('input[placeholder="Dinner, taxi, hotel…"]', 'Dinner');
  await p.fill('.money-input >> nth=0 >> input', '500');
  await p.click('.modal-foot >> text=Add');
  await p.waitForSelector('.list-item:has-text("Dinner")'); await onTrip('save');
  await p.click('.list-item:has-text("Dinner")');
  await p.waitForSelector('.modal:has-text("Edit expense")');
  await p.goBack(); await onTrip('back on Edit expense');

  // 4. Close immediately after opening (StrictMode remount in flight), then open again at once
  for (let i = 0; i < 5; i++) {
    await p.click('.fab'); await p.keyboard.press('Escape');
    await p.click('.fab'); await p.waitForSelector('.modal');
    await p.waitForTimeout(200);
    if (!(await p.$('.modal'))) fail('reopened modal got closed by a stale back');
    await p.goBack(); await onTrip(`quick close/reopen ${i}`);
  }

  // 5. Escape, then a real back leaves the trip (closing didn't leave junk history behind)
  await p.click('.fab'); await p.waitForSelector('.modal');
  await p.keyboard.press('Escape'); await onTrip('escape');
  await p.goBack(); await p.waitForTimeout(300);
  if (p.url() === tripUrl) fail('back after closing should leave the trip, but stayed');
  console.log('back button closes forms OK');
  console.log('ERRORS', errs);
  await br.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
