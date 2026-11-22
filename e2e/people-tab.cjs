// E2E check (Playwright). See e2e/README.md for how to run it.
const path = require('path');
const SHOTS = path.join(__dirname, 'screenshots') + '/';
require('fs').mkdirSync(SHOTS, { recursive: true });
const { chromium } = require('playwright');
const S = SHOTS;
(async () => {
  const br = await chromium.launch();
  const errs = [];
  for (const scheme of ['light', 'dark']) {
    const p = await (await br.newContext({ viewport: { width: scheme === "dark" ? 320 : 390, height: 844 }, colorScheme: scheme })).newPage();
    p.on('dialog', (d) => d.accept()); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto((process.env.E2E_BASE || 'http://127.0.0.1:5173'));
    await p.fill('input[placeholder="Goa 2026"]', 'People tab test');
    await p.fill('input[aria-label="Your name"]', 'Aarav');
    await p.fill('input[aria-label="Person 2"]', 'Meera');
    await p.click('text=+ Add person'); await p.keyboard.type('Kabir');
    await p.click('text=Create trip');
    await p.waitForSelector('text=Who are you?'); await p.click('.pick:has-text("Aarav")');
    const add = async (t, a, payer, exclude = []) => {
      await p.click((await p.$('.fab')) ? '.fab' : 'text=Add the first expense');
      await p.fill('input[placeholder="Dinner, taxi, hotel…"]', t);
      await p.fill('.money-input >> nth=0 >> input', a);
      await p.selectOption('.modal select', { label: payer });
      for (const n of exclude) await p.uncheck(`.split-list li:has-text("${n}") input[type=checkbox]`);
      await p.click('.modal-foot >> text=Add');
      await p.waitForSelector(`.list-item:has-text("${t}")`);
    };
    await add('Hotel', '3000', 'Meera');            // 1000 each
    await add('Cab', '900', 'Aarav (you)', ['Kabir']); // Aarav 450, Meera 450
    // A settle-up payment must NOT count as spending
    await p.click('.tabs >> text=Balances');
    await p.click('button:text-is("Mark paid") >> nth=0');
    await p.waitForTimeout(800);
    await p.click('.tabs >> text=People');
    await p.waitForSelector('.cost-total');
    const rows = await p.$$eval('.cost-row, .cost-total', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    if (scheme === 'light') console.log(rows.join('\n'));
    await p.screenshot({ path: S + `people-${scheme}.png` });
    if (scheme === 'light') {
      await p.click('.people-grid >> text=Edit');
      await p.click('button[aria-label="Rename Kabir"]');
      await p.fill('input[aria-label="New name"]', 'Kabir Singh Rathore');
      await p.click('.cost-row >> text=Save');
      await p.waitForSelector('.cost-row:has-text("Kabir Singh Rathore")');
      await p.screenshot({ path: S + 'people-edit.png' });
      await p.click('.people-grid >> text=Done');
      console.log('rename in edit mode OK; amounts back:', await p.$$eval('.cost-amt', (e) => e.length));
    }
  }
  console.log('ERRORS', errs);
  await br.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
