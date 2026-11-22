// E2E check (Playwright). See e2e/README.md for how to run it.
// Deleting is a soft delete: the entry moves to "Recently deleted" (for everyone) and can be restored.
// Also checks the "Added by / last edited by" line, that a removed person blocks restoring until
// they're brought back (People → Removed → Restore), and that re-adding a removed name restores them.
const path = require('path');
const S = path.join(__dirname, 'screenshots') + '/';
require('fs').mkdirSync(S, { recursive: true });
const { chromium } = require('playwright');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:5173';

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    p.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text()));
    p.on('dialog', (d) => d.accept());
    return p;
  };
  const fail = (msg) => { console.log('FAIL', msg); process.exitCode = 1; };
  const total = async (p) => (await p.textContent('.summary .big')).trim();

  const a = await mk();
  await a.goto(BASE);
  await a.fill('input[placeholder="Goa 2026"]', 'Trash test');
  await a.fill('input[placeholder="Your name"]', 'Alice');
  await a.fill('input[placeholder="Friend 1"]', 'Bob');
  await a.click('text=+ Add person');
  await a.fill('input[placeholder="Friend 2"]', 'Carol');
  await a.click('text=Create trip');
  await a.waitForURL(/\/t\/[A-Z0-9]+$/);
  const url = a.url();
  await a.click('.pick:has-text("Alice")');

  await a.click('text=Add the first expense');
  await a.fill('input[placeholder="Dinner, taxi, hotel…"]', 'Dinner');
  await a.fill('.modal input[placeholder="0.00"]', '300');
  await a.click('.modal-foot >> text=Add');
  await a.waitForSelector('.list-item:has-text("Dinner")');
  // Only Alice and Carol, so Bob can be removed later
  await a.click('.fab');
  await a.fill('input[placeholder="Dinner, taxi, hotel…"]', 'Taxi');
  await a.fill('.modal input[placeholder="0.00"]', '100');
  await a.uncheck('.split-list li:has-text("Bob") input[type=checkbox]');
  await a.click('.modal-foot >> text=Add');
  await a.waitForSelector('.list-item:has-text("Taxi")');

  const b = await mk();
  await b.goto(url);
  await b.click('.pick:has-text("Bob")');
  await b.waitForSelector('.list-item:has-text("Dinner")');

  // Bob edits Dinner: audit line shows both names
  await b.click('.list-item:has-text("Dinner")');
  await b.fill('input[placeholder="Dinner, taxi, hotel…"]', 'Dinner out');
  await b.click('.modal-foot >> text=Save');
  await b.click('.list-item:has-text("Dinner out")');
  const audit = (await b.textContent('.modal .audit')) || '';
  console.log('audit:', audit);
  if (!/Added by Alice/.test(audit) || !/last edited by Bob/.test(audit)) fail('audit line');
  await b.click('.modal-foot >> text=Cancel');

  // Bob deletes Dinner out: gone from the list and the total, for Alice too
  await b.click('.list-item:has-text("Dinner out")');
  await b.click('.modal-foot >> text=Delete');
  await a.waitForSelector('.list-item:has-text("Dinner out")', { state: 'detached', timeout: 10000 });
  console.log('total after delete:', await total(a));
  if (!/100\.00/.test(await total(a))) fail('total should drop to 100');
  await a.click('text=Recently deleted (1)');
  await a.waitForSelector('.deleted-list .list-item:has-text("Dinner out")');
  const meta = await a.textContent('.deleted-list .list-item');
  console.log('deleted row:', meta.replace(/\s+/g, ' '));
  if (!/by Bob/.test(meta)) fail('deleted row should say by Bob');
  await a.screenshot({ path: S + 'deleted-1-list.png' });

  // Restore: comes back for both, dialog closes (it was the only one)
  await a.click('.deleted-list >> text=Restore');
  await a.waitForSelector('.modal', { state: 'detached' });
  await b.waitForSelector('.list-item:has-text("Dinner out")', { timeout: 10000 });
  if (!/400\.00/.test(await total(a))) fail('total should be back to 400');
  if (await a.$('text=/Recently deleted/')) fail('link should hide when nothing is deleted');

  // Delete Dinner again, then remove Bob (now only in the deleted entry): restore is blocked
  await a.click('.list-item:has-text("Dinner out")');
  await a.click('.modal-foot >> text=Delete');
  await a.waitForSelector('text=Recently deleted (1)');
  await a.click('[role=tab]:has-text("People")');
  await a.click('.summary-head >> text=Edit');
  await a.click('button[aria-label="Remove Bob"]');
  await a.waitForSelector('.cost-row:has-text("Bob")', { state: 'detached' });
  await a.click('[role=tab]:has-text("Expenses")');
  await a.click('text=Recently deleted (1)');
  await a.waitForSelector('.deleted-list >> text=Bob was removed from the trip');
  if (!(await a.isDisabled('.deleted-list button:has-text("Restore")'))) fail('restore should be disabled');
  await a.screenshot({ path: S + 'deleted-2-blocked.png' });
  await a.click('.modal .icon-btn[aria-label="Close"]');

  // Bring Bob back from People → Removed: same person (id), so the expense can be restored
  await a.click('[role=tab]:has-text("People")');
  await a.waitForSelector('.removed-people >> text=Bob');
  await a.screenshot({ path: S + 'deleted-3-removed-people.png' });
  await a.click('.removed-people button:has-text("Restore")');
  await a.waitForSelector('.cost-row:has-text("Bob")');
  if (await a.$('.removed-people')) fail('Removed section should be gone');
  await a.click('[role=tab]:has-text("Expenses")');
  await a.click('text=Recently deleted (1)');
  await a.click('.deleted-list button:has-text("Restore")');
  await b.waitForSelector('.list-item:has-text("Dinner out")', { timeout: 10000 });
  console.log('Bob restored, then the expense');

  // Remove Bob again: he's in a live expense now, so it's blocked
  await a.click('[role=tab]:has-text("People")');
  await a.click('.summary-head >> text=Edit');
  await a.click('button[aria-label="Remove Bob"]');
  await a.waitForSelector('.toast:has-text("part of some expenses")');
  await a.click('.summary-head >> text=Done');

  // Add Dave, remove him, then add "dave": the same Dave comes back (no duplicate)
  const addPerson = async (n) => {
    await a.fill('input[placeholder="Add a person"]', n);
    await a.click('form:has(input[placeholder="Add a person"]) >> button:has-text("Add")');
  };
  await addPerson('Dave');
  await a.waitForSelector('.cost-row:has-text("Dave")');
  await a.click('.summary-head >> text=Edit');
  await a.click('button[aria-label="Remove Dave"]');
  await a.waitForSelector('.removed-people >> text=Dave');
  // Bob's device asked "Who are you?" while he was removed; he's back, so he can pick himself again
  if (await b.$('.modal:has-text("Who are you")')) await b.click('.pick:has-text("Bob")');
  await b.click('[role=tab]:has-text("People")');
  await b.waitForSelector('.removed-people >> text=Dave'); // synced
  await a.click('.summary-head >> text=Done');
  await addPerson('dave');
  await a.waitForSelector('.removed-people', { state: 'detached' });
  const daves = await a.$$eval('.cost-row', (els) => els.filter((e) => /dave/i.test(e.textContent)).length);
  if (daves !== 1) fail(`re-adding Dave should bring him back, not duplicate (found ${daves})`);
  console.log('re-adding a removed name restored the same person');

  // 320px: no sideways overflow in the dialog
  await a.setViewportSize({ width: 320, height: 700 });
  const over = await a.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (over) console.log('OVERFLOW deleted dialog at 320px');

  console.log('ERRORS', JSON.stringify(errs));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
