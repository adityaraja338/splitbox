// E2E check (Playwright). See e2e/README.md for how to run it.
const path = require('path');
const SHOTS = path.join(__dirname, 'screenshots') + '/';
require('fs').mkdirSync(SHOTS, { recursive: true });
const { chromium } = require('playwright');
const S = SHOTS;
const txt = (p, sel) => p.$$eval(sel, els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
(async () => {
  const br = await chromium.launch(); const errs = [];
  const mk = async () => { const p = await (await br.newContext({ viewport: { width: 400, height: 900 } })).newPage();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text())); p.on('dialog', d => d.accept()); return p; };
  const a = await mk();
  await a.goto((process.env.E2E_BASE || 'http://127.0.0.1:5173'));
  await a.fill('input[placeholder="Goa 2026"]', 'Test');
  await a.fill('input[aria-label="Your name"]', 'Alice');
  await a.fill('input[aria-label="Person 2"]', 'Bob');
  await a.click('text=+ Add person'); await a.keyboard.type('Carol');
  await a.click('text=Create trip');
  await a.waitForSelector('text=Who are you?'); await a.click('.pick:has-text("Alice")');
  const add = async (p, title, amt, payer, parts) => {
    await p.click(await p.$('.fab') ? '.fab' : 'text=Add the first expense');
    await p.fill('input[placeholder="Dinner, taxi, hotel…"]', title);
    await p.fill('.money-input >> nth=0 >> input', amt);
    await p.selectOption('.modal select', { label: payer });
    for (const n of ['Alice','Bob','Carol']) if (!parts.includes(n)) await p.uncheck(`.split-list li:has-text("${n}") input[type=checkbox]`);
    await p.click('.modal-foot >> text=Add');
    await p.waitForSelector(`.list-item:has-text("${title}")`);
  };
  await add(a, 'Dinner', '3000', 'Alice (you)', ['Alice','Bob','Carol']);
  await add(a, 'Taxi', '400', 'Carol', ['Alice','Bob']);
  await add(a, 'Snacks', '600', 'Bob', ['Bob','Carol']);
  await a.waitForTimeout(500);
  console.log('EXPENSES TAB has my-summary?', !!(await a.$('.my-summary')), 'items:', (await a.$$('.expense-list .list-item')).length);
  await a.screenshot({ path: S + 'm0-expenses.png' });
  await a.click('.tabs >> text=Balances');
  console.log('ALICE direct:', await txt(a, '.my-summary .group-label, .my-summary .list-item'));
  await a.screenshot({ path: S + 'm1-alice.png' });

  const b = await mk();
  await b.goto(a.url()); await b.waitForSelector('text=Who are you?'); await b.click('.pick:has-text("Bob")');
  await b.click('.tabs >> text=Balances');
  await b.waitForSelector('.my-summary .list-item');
  console.log('BOB direct:', await txt(b, '.my-summary .group-label, .my-summary .list-item'));

  // switch to direct debts
  console.log('PER PERSON:', await txt(a, '.balance-detail'));
  await a.screenshot({ path: S + 'm2-balances-full.png', fullPage: true });
  await a.click('.switch input');
  await a.waitForTimeout(800);
  console.log('ALL simplified:', await txt(a, '.settle'));
  
  console.log('BOB simplified (synced):', await txt(b, '.my-summary .list-item'));
  await b.screenshot({ path: S + 'm3-bob.png' });

  // Bob pays Alice from his card
  await b.click('.my-summary .list-item:has-text("Alice") >> text=I paid');
  await b.waitForTimeout(1000);
  console.log('BOB after paying:', await txt(b, '.my-summary .group-label, .my-summary .list-item, .my-summary p'));
  console.log('ALICE after:', await txt(a, '.my-summary .group-label, .my-summary .list-item, .my-summary p'));
  console.log('ERRORS', errs); await br.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
