/**
 * Wave 1 language screenshots. FSB_TEST build + abort non-GET supabase.
 * ONE headless browser. Saves to /workspace/more-langs-shots/<lang>/.
 */
import { chromium } from '/workspace/fsb-pgtest/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';
import { join } from 'path';

const URL = process.env.URL || 'http://127.0.0.1:52141/?notrack=1';
const OUT = '/workspace/more-langs-shots';
const LANGS = (process.env.LANGS || 'fr,de,pt,it,nl,pl,tr,id,fil,sv').split(',');
const DETECT = process.env.DETECT_LANG || 'fr-CA';

async function abortWrites(route) {
  const req = route.request();
  const u = req.url();
  if (/supabase\.co|supabase\.in/i.test(u) && req.method() !== 'GET') return route.abort();
  return route.continue();
}

async function waitGame(page) {
  await page.waitForFunction(() => window.__fsbTest, null, { timeout: 20000 });
  await page.waitForTimeout(500);
}

async function shot(page, dir, name) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log('  ', path);
}

async function openLang(browser, lang, { locale, clearLang } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 960, height: 540 },
    locale: locale || 'en-US',
  });
  await ctx.route('**/*', abortWrites);
  await ctx.addInitScript(({ lang, clearLang }) => {
    try {
      if (clearLang) localStorage.removeItem('fsb_lang');
      else if (lang) localStorage.setItem('fsb_lang', lang);
      localStorage.setItem('fsb-tutorial-done-v1', '1');
    } catch {}
  }, { lang, clearLang: !!clearLang });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', lang, e.message.slice(0, 120)));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await waitGame(page);
  const htmlLang = await page.evaluate(() => document.documentElement.lang);
  console.log(lang || 'detect', 'html.lang', htmlLang);
  return { ctx, page };
}

async function forLang(browser, lang) {
  const dir = join(OUT, lang);
  console.log('===', lang);
  const { ctx, page } = await openLang(browser, lang);

  await page.waitForTimeout(300);
  await shot(page, dir, '01-title');

  // Modes via big title button
  await page.locator('#modes-big').click({ force: true });
  await page.waitForSelector('body.modes-open', { timeout: 5000 });
  await page.waitForTimeout(250);
  await page.locator('#lang-btn').click({ force: true });
  await page.waitForSelector('#lang-list:not([hidden])', { timeout: 4000 });
  await page.waitForTimeout(250);
  await shot(page, dir, '02-modes-flags');
  await page.evaluate(() => {
    window.__fsbTest.game.closeModes();
  });
  await page.waitForTimeout(200);

  // HUD gameplay
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__fsbTest.state().state === 'playing', null, { timeout: 10000 });
  await page.evaluate(() => {
    const t = window.__fsbTest;
    t.fullCharge();
    t.game.score = 1234567;
  });
  await page.waitForTimeout(600);
  await shot(page, dir, '03-hud');

  // Game over with big number (low enough to skip initials if board empty, but we force gameover)
  await page.evaluate(() => {
    const g = window.__fsbTest.game;
    g.score = 1048576;
    g.victory = false;
    g.missionRun = false;
    g.ghostRun = false;
    // Force end without initials: empty board still qualifies any positive score often —
    // so set leaderboard full of higher scores then endRun, OR go straight to gameover UI.
    g.pendingScore = 1048576;
    g.pendingDifficulty = 5;
    g.pendingMission = false;
    g.pendingGhost = false;
    g.newBest = true;
    g.leaderboard = Array.from({ length: 11 }, (_, i) => ({ initials: 'AAA', score: 2000000 - i, runMs: 60000 }));
    g.highlightIndex = -1;
    g.state = 'gameover';
    g.setBodyFlags();
  });
  await page.waitForFunction(() => window.__fsbTest.state().state === 'gameover', null, { timeout: 5000 });
  await page.waitForTimeout(500);
  await shot(page, dir, '04-gameover');

  // Initials
  await page.evaluate(() => {
    const g = window.__fsbTest.game;
    g.pendingScore = 999999;
    g.enterInitials();
  });
  await page.waitForFunction(() => window.__fsbTest.state().state === 'initials', null, { timeout: 5000 });
  await page.waitForTimeout(400);
  await shot(page, dir, '05-initials');
  await ctx.close();

  // Tutorial (fresh context, tutorial not done)
  const ctx2 = await browser.newContext({ viewport: { width: 960, height: 540 } });
  await ctx2.route('**/*', abortWrites);
  await ctx2.addInitScript((l) => {
    try {
      localStorage.setItem('fsb_lang', l);
      localStorage.removeItem('fsb-tutorial-done-v1');
    } catch {}
  }, lang);
  const page2 = await ctx2.newPage();
  await page2.goto(URL, { waitUntil: 'domcontentloaded' });
  await waitGame(page2);
  await page2.keyboard.press('Enter');
  await page2.waitForFunction(() => window.__fsbTest.state().state === 'playing', null, { timeout: 10000 });
  await page2.evaluate(() => {
    const g = window.__fsbTest.game;
    if (g.tutStep < 0) g.startTutorial();
  });
  await page2.waitForTimeout(700);
  await shot(page2, join(OUT, lang), '06-tutorial');
  await ctx2.close();
}

async function detectCheck(browser) {
  console.log('=== auto-detect', DETECT);
  const ctx = await browser.newContext({
    viewport: { width: 960, height: 540 },
    locale: DETECT,
  });
  await ctx.route('**/*', abortWrites);
  await ctx.addInitScript((nav) => {
    try { localStorage.removeItem('fsb_lang'); } catch {}
    Object.defineProperty(navigator, 'language', { configurable: true, get: () => nav });
    Object.defineProperty(navigator, 'languages', { configurable: true, get: () => [nav] });
  }, DETECT);
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await waitGame(page);
  const info = await page.evaluate(() => ({
    htmlLang: document.documentElement.lang,
    stored: (() => { try { return localStorage.getItem('fsb_lang'); } catch { return null; } })(),
  }));
  console.log('detect result', info);
  mkdirSync(join(OUT, '_detect'), { recursive: true });
  await page.screenshot({ path: join(OUT, '_detect', `${DETECT}.png`) });
  await page.locator('#modes-big').click({ force: true });
  await page.waitForTimeout(400);
  const btnName = await page.evaluate(() => document.querySelector('#lang-btn .lang-name')?.textContent);
  console.log('lang btn', btnName);
  await page.screenshot({ path: join(OUT, '_detect', `${DETECT}-modes.png`) });
  await ctx.close();
  if (info.htmlLang !== 'fr' && DETECT.startsWith('fr')) {
    console.error('FAIL: expected html lang fr for', DETECT, 'got', info.htmlLang);
    process.exitCode = 1;
  }
}

const browser = await chromium.launch({ headless: true });
try {
  for (const lang of LANGS) await forLang(browser, lang);
  await detectCheck(browser);
} finally {
  await browser.close();
}
console.log('DONE');
