// Full flow against `wrangler dev` with an empty local database:
//   rm -rf .wrangler/state && npm run start   (in another terminal)
//   node e2e/run.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const OUT = 'e2e/output';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const phone = { ...devices['iPhone 14'], baseURL: BASE };
const problems = [];

async function newUser() {
  const context = await browser.newContext(phone);
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/401/.test(message.text())) problems.push(`console: ${message.text()}`);
  });
  return { context, page };
}
const settle = (page) => page.waitForTimeout(1300);
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

const wali = await newUser();
await wali.page.goto('/');
await wali.page.getByLabel('Roommate 1').waitFor();
await settle(wali.page);
await shot(wali.page, '01-setup');

for (const [index, name] of ['Wali', 'Hamza', 'Yusuf', 'Daniyal'].entries()) {
  await wali.page.getByLabel(`Roommate ${index + 1}`).fill(name);
}
await wali.page.getByPlaceholder('At least 6 characters').fill('haven-204');
await wali.page.getByRole('button', { name: 'Start the board' }).click();
await wali.page.getByRole('heading', { name: 'Bring the others in' }).waitFor();
await settle(wali.page);
await shot(wali.page, '02-pick');

await wali.page.getByRole('button', { name: 'Wali' }).click();
await wali.page.getByRole('button', { name: 'Got the milk' }).waitFor();
await settle(wali.page);
await shot(wali.page, '03-board-my-chore');

// Invite link: the code arrives in the fragment and is removed from the address bar.
const hamza = await newUser();
await hamza.page.goto('/#join=haven-204');
await hamza.page.getByRole('button', { name: 'Open the board' }).waitFor();
assert.equal(new URL(hamza.page.url()).hash, '', 'invite code should leave the address bar');
await hamza.page.getByRole('button', { name: 'Open the board' }).click();
await hamza.page.getByRole('button', { name: 'Hamza' }).click();
await hamza.page.getByRole('button', { name: 'Took out the trash' }).waitFor();

// Daniyal is the one off this week.
const daniyal = await newUser();
await daniyal.page.goto('/');
await daniyal.page.getByLabel('House code').fill('wrong-code');
await daniyal.page.getByRole('button', { name: 'Open the board' }).click();
await daniyal.page.getByRole('alert').getByText('not the house code').waitFor();
await daniyal.page.getByLabel('House code').fill('haven-204');
await daniyal.page.getByRole('button', { name: 'Open the board' }).click();
await daniyal.page.getByRole('button', { name: 'Daniyal' }).click();
await daniyal.page.getByLabel('Not it', { exact: true }).first().waitFor();
await settle(daniyal.page);
await shot(daniyal.page, '04-board-not-it');

// Check off on one phone, then see it on another after it refocuses.
await wali.page.getByRole('button', { name: 'Got the milk' }).click();
await wali.page.getByLabel('Done', { exact: true }).first().waitFor();
await settle(wali.page);
await shot(wali.page, '05-board-done');

await hamza.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await hamza.page.getByText(/Done/).first().waitFor();
assert.equal(await hamza.page.getByRole('button', { name: 'Undo Milk' }).count(), 1, 'Hamza should see the milk tick');

// Cover: Daniyal takes Yusuf's broom, and stops being not it.
await daniyal.page.getByRole('button', { name: 'Cover Broom' }).click();
await daniyal.page.getByText('Covering for Yusuf').waitFor();
await settle(daniyal.page);
await shot(daniyal.page, '06-board-cover');
await daniyal.page.getByRole('button', { name: 'Swept the floors' }).click();
await daniyal.page.getByRole('button', { name: 'Undo Broom' }).waitFor();

// Undo.
await wali.page.getByRole('button', { name: 'Undo Milk' }).click();
await wali.page.getByRole('button', { name: 'Got the milk' }).waitFor();
await wali.page.getByRole('button', { name: 'Got the milk' }).click();
await wali.page.getByRole('button', { name: 'Undo Milk' }).waitFor();

// Nudge falls back to the clipboard where there is no share sheet.
await wali.context.grantPermissions(['clipboard-read', 'clipboard-write']);
await wali.page.evaluate(() => { delete Navigator.prototype.share; });
await wali.page.getByRole('button', { name: 'Nudge about Trash' }).click();
await wali.page.getByText('Copied. Paste it in the chat.').waitFor();
const nudge = await wali.page.evaluate(() => navigator.clipboard.readText());
assert.match(nudge, /^Hamza, the trash is calling/);

// Reload keeps you signed in.
await wali.page.reload();
await wali.page.getByRole('button', { name: 'Undo Milk' }).waitFor();

// Other tabs.
await wali.page.getByRole('button', { name: 'Ahead', exact: true }).click();
await wali.page.getByRole('heading', { name: 'The road ahead' }).waitFor();
await shot(wali.page, '07-ahead');
await wali.page.getByRole('button', { name: 'Scores', exact: true }).click();
await wali.page.getByRole('heading', { name: 'The receipts' }).waitFor();
await shot(wali.page, '08-scores');
await wali.page.getByRole('button', { name: 'House', exact: true }).click();
await wali.page.getByLabel('Name for Hamza').fill('Hamz');
await wali.page.getByRole('button', { name: 'Save' }).click();
await wali.page.getByLabel('Name for Hamz', { exact: true }).waitFor();
await shot(wali.page, '09-house');

// Switch person goes back through the code.
await wali.page.getByRole('button', { name: 'Not you? Switch person' }).click();
await wali.page.getByLabel('House code').waitFor();

// Page width must never overflow on a small phone.
const small = await browser.newContext({ ...devices['iPhone SE'], baseURL: BASE });
const smallPage = await small.newPage();
await smallPage.goto('/');
await smallPage.getByLabel('House code').fill('haven-204');
await smallPage.getByRole('button', { name: 'Open the board' }).click();
await smallPage.getByRole('button', { name: 'Yusuf' }).click();
await smallPage.getByText('You\'re').waitFor();
await settle(smallPage);
for (const tab of ['Board', 'Ahead', 'Scores', 'House']) {
  await smallPage.getByRole('button', { name: tab, exact: true }).click();
  const overflow = await smallPage.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 0, `${tab} overflows by ${overflow}px on iPhone SE`);
}
await smallPage.getByRole('button', { name: 'Board', exact: true }).click();
await settle(smallPage);
await shot(smallPage, '10-small-phone');

await browser.close();
assert.deepEqual(problems, [], 'no page or console errors');
console.log('E2E passed');
