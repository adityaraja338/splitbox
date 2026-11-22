const path = require('path');
// Seeds a demo "Zero Point, Sikkim" trip on the local emulator and captures phone screenshots for the post.
const { chromium } = require('playwright');
const OUT = path.resolve(__dirname, '../docs/screenshots') + '/';
const BASE = process.env.E2E_BASE || (process.env.E2E_BASE || 'http://127.0.0.1:5173');

// Mask the trip code everywhere it's shown, and keep transient toasts out of the shots
const MASK_CSS = `
  .code-chip { font-size: 0 !important; }
  .code-chip::after { content: '•••••••• · Share'; font-size: 0.8rem; letter-spacing: 0.08em; }
  .toast { display: none !important; }
`;

(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  const mask = () => p.addStyleTag({ content: MASK_CSS });

  await p.goto(BASE);
  await p.fill('input[placeholder="Goa 2026"]', 'Zero Point, Sikkim 🏔️');
  const people = ['Aarav', 'Meera', 'Kabir', 'Isha', 'Rohan', 'Tanya'];
  await p.fill('input[aria-label="Your name"]', people[0]);
  await p.fill('input[aria-label="Person 2"]', people[1]);
  for (const n of people.slice(2)) { await p.click('text=+ Add person'); await p.keyboard.type(n); }
  await p.click('text=Create trip');
  await p.waitForSelector('text=Who are you?');
  await p.click('.pick:has-text("Aarav")');

  const day = (off) => { const d = new Date(); d.setDate(d.getDate() - off); return d.toLocaleDateString('en-CA'); };
  const add = async ({ title, amount, payer, date, mode, parts, exclude = [] }) => {
    await p.click((await p.$('.fab')) ? '.fab' : 'text=Add the first expense');
    await p.fill('input[placeholder="Dinner, taxi, hotel…"]', title);
    await p.fill('.money-input >> nth=0 >> input', amount);
    await p.selectOption('.modal select', { label: payer });
    await p.fill('input[type=date]', date);
    for (const n of exclude) await p.uncheck(`.split-list li:has-text("${n}") input[type=checkbox]`);
    if (mode === 'shares') {
      await p.click('.segmented >> text=Shares');
      for (const [n, v] of Object.entries(parts)) await p.fill(`input[aria-label="${n}'s shares"]`, v);
    }
    if (mode === 'exact') {
      await p.click('.segmented >> text=Exact');
      for (const [n, v] of Object.entries(parts)) await p.fill(`input[aria-label="${n}'s amount"]`, v);
    }
    await p.click('.modal-foot >> text=Add');
    await p.waitForSelector(`.list-item:has-text("${title}")`);
  };

  await add({ title: 'Homestay in Lachung', amount: '9600', payer: 'Meera', date: day(2) });
  await add({ title: 'Cab to Zero Point', amount: '7200', payer: 'Aarav (you)', date: day(1) });
  await add({ title: 'Maggi & chai at Zero Point', amount: '540', payer: 'Kabir', date: day(1) });
  await add({ title: 'Momos in Gangtok', amount: '1260', payer: 'Isha', date: day(0), exclude: ['Rohan'] });
  await add({ title: 'Snow boots & jackets', amount: '2400', payer: 'Rohan', date: day(1), mode: 'shares',
    parts: { Aarav: '1', Meera: '2', Kabir: '1', Isha: '2', Rohan: '1', Tanya: '1' } });

  // 1. Expenses tab
  await p.evaluate(() => window.scrollTo(0, 0));
  await mask();
  await p.mouse.move(0, 0);
  await p.addStyleTag({ content: '.fab { display: none !important; }' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: OUT + '1-expenses.png' });
  await p.addStyleTag({ content: '.fab { display: block !important; }' });

  // 2. Add-expense form with a custom split
  await p.click('.fab');
  await p.fill('input[placeholder="Dinner, taxi, hotel…"]', 'Dinner at MG Marg');
  await p.fill('.money-input >> nth=0 >> input', '3150');
  await p.click('.segmented >> text=Exact');
  const exact = { Aarav: '600', Meera: '450', Kabir: '700', Isha: '400', Rohan: '500', Tanya: '500' };
  for (const [n, v] of Object.entries(exact)) await p.fill(`input[aria-label="${n}'s amount"]`, v);
  await p.click('input[placeholder="Dinner, taxi, hotel…"]');
  await p.screenshot({ path: OUT + '2-add-expense.png' });
  await p.click('.modal-foot >> text=Cancel');

  // 3. Balances: who pays whom
  await p.click('.tabs >> text=Balances');
  await p.waitForSelector('.my-summary');
  await p.evaluate(() => {
    const el = document.querySelector('.my-summary');
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12);
  });
  await p.screenshot({ path: OUT + '3-balances.png' });

  // 4. Per person, one expanded
  await p.click('.person-head:has-text("Meera")');
  await p.mouse.move(0, 0);
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    const el = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Per person');
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 28);
  });
  await p.screenshot({ path: OUT + '4-per-person.png' });

  await br.close();
  console.log('done');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
