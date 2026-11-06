// Run after e2e/run.mjs and seed-history.sql to capture the data-heavy screens.
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 14'], baseURL: process.env.BASE_URL ?? 'http://localhost:8787' });
const page = await context.newPage();
await page.goto('/');
await page.getByLabel('House code').fill('haven-204');
await page.getByRole('button', { name: 'Open the board' }).click();
await page.getByRole('button', { name: 'Wali' }).click();
await page.getByRole('heading', { name: 'Left over from last week' }).waitFor();
await page.waitForTimeout(1300);
await page.screenshot({ path: 'e2e/output/11-loose-ends.png' });
await page.getByRole('button', { name: "Mark last week's Milk done" }).click();
await page.getByRole('button', { name: "Mark last week's Milk done" }).waitFor({ state: 'detached' });
await page.getByRole('button', { name: 'Scores', exact: true }).click();
await page.getByRole('heading', { name: 'The receipts' }).waitFor();
assert.ok(await page.getByText('Missed').count() > 0);
await page.screenshot({ path: 'e2e/output/12-scores-history.png', fullPage: true });
await browser.close();
console.log('history shots done');
