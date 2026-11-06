// Renders public/icon.svg into the PNG sizes home screens need.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<!doctype html><style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `public/${file}` });
  await page.close();
}
await browser.close();
