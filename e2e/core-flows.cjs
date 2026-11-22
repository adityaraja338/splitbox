// E2E check (Playwright). See e2e/README.md for how to run it.
const path = require('path');
const SHOTS = path.join(__dirname, 'screenshots') + '/';
require('fs').mkdirSync(SHOTS, { recursive: true });
const { chromium } = require('playwright');
const S = SHOTS;
const BASE = process.env.E2E_BASE || (process.env.E2E_BASE || 'http://127.0.0.1:5173');
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
  const a = await mk();
  await a.goto(BASE);
  await a.screenshot({ path: S + '1-home.png', fullPage: true });
  await a.fill('input[placeholder="Goa 2026"]', 'Goa Trip');
  await a.fill('input[placeholder="Your name"]', 'Alice');
  await a.fill('input[placeholder="Friend 1"]', 'Bob');
  await a.click('text=+ Add person');
  await a.fill('input[placeholder="Friend 2"]', 'Carol');
  await a.click('text=Create trip');
  await a.waitForURL(/\/t\/[A-Z0-9]+$/);
  const url = a.url();
  console.log('trip url', url);
  await a.waitForSelector('text=Who are you?');
  await a.click('.pick:has-text("Alice")');

  // Expense 1: dinner 3000 equal, paid by Alice
  await a.click('text=Add the first expense');
  await a.fill('input[placeholder="Dinner, taxi, hotel…"]', 'Dinner');
  await a.fill('.modal input[placeholder="0.00"]', '3000');
  await a.screenshot({ path: S + '2-add-expense.png' });
  await a.click('.modal-foot >> text=Add');
  await a.waitForSelector('.list-item:has-text("Dinner")');

  // Expense 2: hotel 5000 exact: Alice 1000, Bob 2000, Carol 2000 — paid by Carol
  await a.click('.fab');
  await a.fill('input[placeholder="Dinner, taxi, hotel…"]', 'Hotel');
  await a.fill('.money-input >> nth=0 >> input', '5000');
  await a.selectOption('.modal select', { label: 'Carol' });
  await a.click('.segmented >> text=Exact');
  await a.fill('input[aria-label="Alice\'s amount"]', '1000');
  await a.fill('input[aria-label="Bob\'s amount"]', '2000');
  await a.click('.modal-foot >> text=Add');
  console.log('validation msg:', await a.textContent('.modal .error'));
  await a.fill('input[aria-label="Carol\'s amount"]', '2000');
  await a.screenshot({ path: S + '3-exact.png' });
  await a.click('.modal-foot >> text=Add');
  await a.waitForSelector('.list-item:has-text("Hotel")');

  // Second user joins via link
  const b = await mk();
  await b.goto(url);
  await b.waitForSelector('text=Who are you?');
  await b.screenshot({ path: S + '4-who.png' });
  await b.click('.pick:has-text("Bob")');
  await b.waitForSelector('.list-item:has-text("Hotel")');
  // Bob adds a shares-based expense, only Bob & Carol, 2:1
  await b.click('.fab');
  await b.fill('input[placeholder="Dinner, taxi, hotel…"]', 'Scooter rental');
  await b.fill('.money-input >> nth=0 >> input', '900');
  await b.click('.segmented >> text=Shares');
  await b.uncheck('.split-list li:has-text("Alice") input[type=checkbox]');
  await b.fill('input[aria-label="Bob\'s shares"]', '2');
  await b.screenshot({ path: S + '5-shares.png' });
  await b.click('.modal-foot >> text=Add');

  // Alice sees it in realtime
  await a.waitForSelector('.list-item:has-text("Scooter rental")', { timeout: 10000 });
  await a.screenshot({ path: S + '6-list.png', fullPage: true });
  await a.click('.tabs >> text=Balances');
  await a.screenshot({ path: S + '7-balances.png', fullPage: true });
  console.log('balances:', (await a.$$eval('.balance-amt', (els) => els.map((e) => e.textContent))).join(' | '));
  console.log('suggest:', (await a.$$eval('.settle', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')))).join(' | '));

  // Bob marks his debt as paid
  await b.click('.tabs >> text=Balances');
  await b.click('button:text-is("Mark paid") >> nth=0');
  await a.waitForTimeout(1500);
  console.log('after settle:', (await a.$$eval('.balance-amt', (els) => els.map((e) => e.textContent))).join(' | '));
  console.log('suggest2:', (await a.$$eval('.settle', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')))).join(' | '));

  // Edit expense: Alice edits Dinner to 3300
  await a.click('.tabs >> text=Expenses');
  await a.click('.list-item:has-text("Dinner")');
  await a.fill('.money-input >> nth=0 >> input', '3300');
  await a.click('.modal-foot >> text=Save');
  await b.click('.tabs >> text=Expenses');
  await b.waitForSelector('.list-item:has-text("3,300.00")', { timeout: 10000 });
  console.log('edit synced to Bob');

  // People: add Dave, try removing Bob (should be blocked), remove Dave
  await a.click('.tabs >> text=People');
  await a.fill('input[placeholder="Add a person"]', 'Dave');
  await a.click('text=Add >> nth=-1');
  await a.waitForSelector('.cost-row:has-text("Dave")');
  await a.click('.people-grid >> text=Edit');
  await a.click('button[aria-label="Remove Bob"]');
  console.log('toast:', await a.textContent('.toast'));
  await a.click('button[aria-label="Remove Dave"]');
  await a.waitForTimeout(800);
  console.log('Dave still there?', await a.$('.cost-row:has-text("Dave")') !== null);
  await a.screenshot({ path: S + '8-people.png', fullPage: true });

  // Join by code from home on a fresh device
  const c = await mk();
  await c.goto(BASE);
  await c.fill('input[aria-label="Trip code"]', url.split('/t/')[1].toLowerCase());
  await c.click('button:text-is("Open")');

  await c.waitForSelector('text=Who are you?');
  await c.fill('input[placeholder="Not listed? Add your name"]', 'Eve');
  await c.click('text=Add me');
  await c.waitForSelector('.me-chip:has-text("You are Eve")');
  console.log('Eve joined');
  await c.goto(BASE + '/t/ZZZZZZZZ');
  await c.waitForSelector('text=Trip not found');
  console.log('not-found ok');

  // Desktop screenshot
  await a.setViewportSize({ width: 1200, height: 900 });
  await a.click('.tabs >> text=Balances');
  await a.screenshot({ path: S + '9-desktop.png', fullPage: true });

  console.log('ERRORS:', errs);
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
