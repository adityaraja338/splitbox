// E2E check (Playwright). See e2e/README.md for how to run it.
const path = require('path');
const SHOTS = path.join(__dirname, 'screenshots') + '/';
require('fs').mkdirSync(SHOTS, { recursive: true });
const { chromium } = require('playwright');
const S = SHOTS;
const BASE = process.env.E2E_BASE || (process.env.E2E_BASE || 'http://127.0.0.1:5173');
const WIDTHS = [320, 390, 768, 1280];
const only = process.argv[2]; // optional: screenshot only this width

(async () => {
  const br = await chromium.launch();
  const errs = [];
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());

  // Seed a stress trip
  await p.goto(BASE);
  await p.fill('input[placeholder="Goa 2026"]', 'Himachal Backpacking Adventure with the College Gang 2026');
  const names = ['Aditya Rajagopalan', 'Bob', 'Christopher Montgomery', 'Dee', 'Eshwar', 'Farhan Akhtar Khan', 'Gita', 'Hrithik'];
  await p.fill('input[aria-label="Your name"]', names[0]);
  for (let i = 1; i < names.length; i++) {
    if (i >= 2) await p.click('text=+ Add person');
    await p.fill(`.people-rows li:nth-child(${i + 1}) input`, names[i]);
  }
  await p.click('text=Create trip');
  await p.waitForSelector('text=Who are you?');
  await p.click(`.pick:has-text("${names[0]}")`);
  const add = async (title, amt, payer) => {
    await p.click((await p.$('.fab')) ? '.fab' : 'text=Add the first expense');
    await p.fill('input[placeholder="Dinner, taxi, hotel…"]', title);
    await p.fill('.money-input >> nth=0 >> input', amt);
    await p.selectOption('.modal select', { label: payer });
    await p.click('.modal-foot >> text=Add');
    await p.waitForSelector(`.list-item:has-text("${title.slice(0, 20)}")`);
  };
  await add('Hotel booking at the riverside cottage in Kasol for three nights', '125000.50', 'Christopher Montgomery');
  await add('Taxi', '3200', 'Bob');
  await add('Dinner', '8999.99', 'Aditya Rajagopalan (you)');
  const url = p.url();

  const report = [];
  for (const w of WIDTHS) {
    if (only && String(w) !== only) continue;
    await p.setViewportSize({ width: w, height: w < 700 ? 844 : 900 });
    const shot = async (name, full = true) => {
      const overflow = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const bad = [];
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width && (r.right > vw + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed') {
            // ignore children of horizontally scrollable containers
            let q = el.parentElement, scroller = false;
            while (q) { const o = getComputedStyle(q).overflowX; if (o === 'auto' || o === 'scroll') { scroller = true; break; } q = q.parentElement; }
            if (!scroller) bad.push(`${el.tagName.toLowerCase()}.${el.className} r=${Math.round(r.right)}`);
          }
        }
        return { scrollW: document.documentElement.scrollWidth, vw, bad: bad.slice(0, 5) };
      });
      report.push(`${w} ${name}: scrollW=${overflow.scrollW} vw=${overflow.vw} ${overflow.bad.length ? 'OVERFLOW ' + overflow.bad.join(', ') : 'ok'}`);
      await p.screenshot({ path: `${S}${w}-${name}.png`, fullPage: full });
    };
    await p.goto(BASE);
    await p.waitForSelector('text=Start a new trip');
    await shot('home');
    await p.goto(url);
    await p.waitForSelector('.expense-list');
    await shot('expenses');
    await p.click('.fab');
    await p.click('.segmented >> text=Exact');
    await shot('modal-exact', false);
    await p.click('.segmented >> text=Shares');
    await shot('modal-shares', false);
    await p.click('.modal-foot >> text=Cancel');
    await p.click('.tabs >> text=Balances');
    await shot('balances');
    await p.click('.my-summary >> text=Not you?');
    await shot('who', false);
    await p.click(`.pick:has-text("${names[0]}")`);
    await p.click('.my-summary .icon-btn >> nth=0');
    await shot('modal-payment', false);
    await p.click('.modal-foot >> text=Cancel');
    await p.click('.tabs >> text=People');
    await shot('people');
  }
  console.log(report.join('\n'));
  console.log('ERRORS', errs);
  await br.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
