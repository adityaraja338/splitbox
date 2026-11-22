const path = require('path');
// Composes the screenshots into one LinkedIn image (1200x1500, 4:5).
const { chromium } = require('playwright');
const fs = require('fs');
const SHOTS = path.resolve(__dirname, '../docs/screenshots') + '/';
const DIR = path.resolve(__dirname, '../linkedin') + '/'; // private, git-ignored
const img = (f) => 'data:image/png;base64,' + fs.readFileSync(SHOTS + f).toString('base64');

const html = `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 1500px; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    background: radial-gradient(120% 80% at 50% 0%, #134e4a 0%, #0b1f1d 55%, #071412 100%); color: #e8eeec;
    display: flex; flex-direction: column; align-items: center; overflow: hidden; }
  header { text-align: center; padding-top: 86px; }
  .brand { display: inline-flex; align-items: center; gap: 16px; font-size: 30px; font-weight: 700; letter-spacing: -0.01em; color: #99f6e4; }
  .brand img { width: 52px; height: 52px; border-radius: 13px; }
  h1 { font-size: 64px; line-height: 1.08; font-weight: 800; letter-spacing: -0.03em; margin-top: 26px; }
  h1 span { color: #5eead4; }
  p.sub { font-size: 28px; color: #9fb3ae; margin-top: 18px; }
  .phones { position: relative; width: 1200px; flex: 1; margin-top: 70px; }
  .phone { position: absolute; width: 380px; border-radius: 46px; padding: 12px; background: #1c2523;
    box-shadow: 0 40px 80px rgba(0,0,0,.55), inset 0 0 0 2px #2c3836; }
  .phone img { display: block; width: 100%; border-radius: 36px; }
  .left  { left: 60px;  top: 90px; transform: rotate(-6deg); }
  .mid   { left: 410px; top: 0;    z-index: 2; }
  .right { left: 760px; top: 90px; transform: rotate(6deg); }
</style></head><body>
  <header>
    <div class="brand"><img src="${img('../public/icons/icon-192.png')}" alt="">Splitbox</div>
    <h1>Needed a tool.<br><span>Built it from my phone.</span></h1>
    <p class="sub">Trip expenses, splits & who pays whom: made with AI on a hill-station network</p>
  </header>
  <div class="phones">
    <div class="phone left"><img src="${img('1-expenses.png')}"></div>
    <div class="phone mid"><img src="${img('3-balances.png')}"></div>
    <div class="phone right"><img src="${img('2-add-expense.png')}"></div>
  </div>
</body></html>`;

(async () => {
  const br = await chromium.launch();
  const p = await br.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 2 });
  await p.setContent(html);
  await p.waitForTimeout(300);
  fs.mkdirSync(DIR, { recursive: true });
  await p.screenshot({ path: DIR + 'cover.png' });
  await br.close();
  console.log('cover written');
})();
