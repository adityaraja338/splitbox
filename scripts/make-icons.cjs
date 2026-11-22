// Renders the Splitbox icon to PNGs for the PWA manifest and iOS.
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.resolve(process.argv[2]);

// Box glyph drawn in a 64x64 coordinate space
const glyph = `
  <path d="M14 24 32 15l18 9v18l-18 9-18-9z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
  <path d="M14 24l18 9 18-9" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
  <path d="M32 33v18" stroke="#5eead4" stroke-width="4" stroke-linecap="round"/>`;

// "any": rounded tile. "full": full-bleed square (iOS / maskable add their own rounding).
// Maskable keeps the glyph inside the central 80% safe zone.
const svg = (kind) => {
  if (kind === 'any') return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0f766e"/>${glyph}</svg>`;
  const scale = kind === 'maskable' ? 0.72 : 0.9;
  const off = (64 - 64 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0f766e"/><g transform="translate(${off} ${off}) scale(${scale})">${glyph}</g></svg>`;
};

const jobs = [
  ['icon-192.png', 192, 'any'],
  ['icon-512.png', 512, 'any'],
  ['maskable-512.png', 512, 'maskable'],
  ['apple-touch-icon.png', 180, 'full'],
];

(async () => {
  const br = await chromium.launch();
  for (const [name, size, kind] of jobs) {
    const p = await br.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg(kind).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: path.join(OUT, name), omitBackground: true });
    await p.close();
    console.log('wrote', name);
  }
  await br.close();
})();
