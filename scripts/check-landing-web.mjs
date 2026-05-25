import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:4173';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}\n${e.stack || ''}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`);
});
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(4000);
} catch (e) {
  errors.push(`GOTO: ${e.message}`);
}
const text = await page.textContent('body').catch(() => '');
console.log('URL:', url);
console.log('BODY:', (text || '').replace(/\s+/g, ' ').slice(0, 300));
console.log('ERRORS:', errors.length ? errors.join('\n---\n') : '(none)');
await browser.close();
