// E2E check (Playwright). See e2e/README.md for how to run it.
const path = require('path');
const SHOTS = path.join(__dirname, 'screenshots') + '/';
require('fs').mkdirSync(SHOTS, { recursive: true });
const { chromium } = require('playwright');
const S = SHOTS;
(async () => {
  const br = await chromium.launch(); const errs = [];
  const p = await (await br.newContext({ viewport: { width: 412, height: 915 }, colorScheme: 'dark' })).newPage();
  p.on('dialog', d => d.accept()); p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.E2E_BASE || 'http://127.0.0.1:5173'));
  await p.fill('input[placeholder="Goa 2026"]', 'Sikkim');
  const names = ['Adarsh','Chhoti','Shanu','Soni','Sweety','Raja','Rajan','Prabhat','Shivam','Monu','Mahima','Tushar'];
  await p.fill('input[aria-label="Your name"]', names[0]);
  await p.fill('input[aria-label="Person 2"]', names[1]);
  for (const n of names.slice(2)) { await p.click('text=+ Add person'); await p.keyboard.type(n); }
  await p.click('text=Create trip');
  await p.waitForSelector('text=Who are you?'); await p.click('.pick:has-text("Adarsh")');
  const add = async (t, a, payer) => {
    await p.click((await p.$('.fab')) ? '.fab' : 'text=Add the first expense');
    await p.fill('input[placeholder="Dinner, taxi, hotel…"]', t);
    await p.fill('.money-input >> nth=0 >> input', a);
    await p.selectOption('.modal select', { label: payer });
    await p.click('.modal-foot >> text=Add');
    await p.waitForSelector(`.list-item:has-text("${t}")`);
  };
  await add('Gangtok Hotel', '5975', 'Adarsh (you)');
  await add('Lunch', '11180', 'Chhoti');
  await add('Cabs', '9400', 'Shanu');
  await add('Snacks', '1200', 'Rajan');
  await p.click('.tabs >> text=Balances');
  // Simplify is on by default: few payments, no hint
  console.log('default (simplified):', await p.textContent('.summary-head .muted.small'), '| hint shown:', !!(await p.$('.hint')));
  // Turning it off shows every direct debt (first 5 + "Show all") and the hint to switch back
  await p.click('.switch input');
  await p.waitForSelector('.hint');
  console.log('direct debts:', await p.textContent('.summary-head .muted.small'), '| rows shown:', (await p.$$('.balances-grid .col .card:not(.my-summary) .settle')).length, '| hint:', (await p.textContent('.hint')).trim());
  await (await p.$('h2:has-text("Per person")')).scrollIntoViewIfNeeded();
  await p.evaluate(() => [...document.querySelectorAll('h2')].find(h => h.textContent === 'Per person').scrollIntoView());
  await p.screenshot({ path: S + 'pp-collapsed.png' });
  await p.click('.person-head:has-text("Adarsh")');
  await p.evaluate(() => document.querySelector('.person-row.open').scrollIntoView());
  await p.screenshot({ path: S + 'pp-open.png' });
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: S + 'pp-top.png', fullPage: true });
  await p.click('.hint');
  await p.waitForTimeout(800);
  console.log('after simplify payments:', await p.textContent('.summary-head .muted.small'));
  console.log('ERRORS', errs); await br.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
