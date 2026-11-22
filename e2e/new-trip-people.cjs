// E2E check (Playwright). See e2e/README.md for how to run it.
const path = require('path');
const SHOTS = path.join(__dirname, 'screenshots') + '/';
require('fs').mkdirSync(SHOTS, { recursive: true });
const { chromium } = require('playwright');
const S = SHOTS;
(async () => {
  const br = await chromium.launch(); const errs = [];
  const p = await (await br.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
  await p.goto((process.env.E2E_BASE || 'http://127.0.0.1:5173'));
  await p.fill('input[placeholder="Goa 2026"]', 'Manali');
  await p.fill('input[aria-label="Your name"]', 'Asha');
  await p.press('input[aria-label="Your name"]', 'Enter');      // jumps to next row
  await p.keyboard.type('Ravi'); await p.keyboard.press('Enter'); // adds new row
  await p.keyboard.type('Meera');
  await p.click('text=+ Add person'); await p.keyboard.type('Temp');
  await p.click('button[aria-label="Remove person 4"]');
  console.log('rows:', await p.$$eval('.people-rows input', els => els.map(e => e.value)));
  await p.screenshot({ path: S + 'h1-home.png', fullPage: true });
  await p.click('text=Create trip');
  await p.waitForSelector('text=Who are you?');
  await p.click('.pick:has-text("Asha")');
  await p.click('.strip-add');
  await p.fill('input[aria-label="New person\'s name"]', 'Kabir'); await p.press('input[aria-label="New person\'s name"]', 'Enter');
  await p.waitForSelector('.strip-person:has-text("Kabir")');
  await p.fill('input[aria-label="New person\'s name"]', 'ravi'); await p.press('input[aria-label="New person\'s name"]', 'Enter');
  await p.waitForSelector('.people-strip .error'); console.log('dup:', await p.textContent('.people-strip .error'));
  await p.screenshot({ path: S + 'h2-strip.png' });
  console.log('strip:', await p.$$eval('.strip-name', els => els.map(e => e.textContent)));
  // zero-people trip
  await p.goto((process.env.E2E_BASE || 'http://127.0.0.1:5173'));
  await p.fill('input[placeholder="Goa 2026"]', 'Empty');
  await p.click('text=Create trip');
  await p.waitForSelector('.people-strip input');
  console.log('empty trip shows add form');
  console.log('ERRORS', errs); await br.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
