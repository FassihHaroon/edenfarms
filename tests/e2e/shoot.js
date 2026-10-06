// Full-page screenshots for visual comparison: node tests/e2e/shoot.js <url> <outPrefix>
import puppeteer from 'puppeteer-core';
import { chromePath } from './chrome.js';

const [url, out] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true });
const errors = [];
for (const [name, vp] of [
  ['phone', { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }],
  ['desktop', { width: 1440, height: 900, deviceScaleFactor: 1 }],
]) {
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${name}] ${e.message}`));
  await page.setViewport(vp);
  await page.goto(url, { waitUntil: 'networkidle0' });
  // Trigger lazy images, then return to top.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); }
    scrollTo(0, 0);
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: `${out}-${name}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(name, 'horizontal overflow px:', overflow);
  await page.close();
}
await browser.close();
console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors');
