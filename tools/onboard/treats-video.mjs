// HOME TO EARTH preview: local FSB_TEST=1 build on 127.0.0.1:5561, every *.supabase.co request aborted,
// fake local board only. Records the fly-down (mid-run zip + run-ending float onto the blue planet,
// the "gotta get more treats on Earth!" line, the placeholder missed-board taunt) and the one board.
import { chromium } from '/usr/local/lib/pnpm/5/.pnpm/playwright@1.63.0-alpha-2026-08-31/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const OUT = '/workspace/cat-mode-shots';
const VID = '/tmp/fsb-vid';
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(VID, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FAKE_BOARD = [
  { score: 9100000, initials: 'ZAP', difficulty: 37, start: 1 },
  { score: 8800000, initials: 'MEW', difficulty: 31, start: 1, mode: 'part2' },
  { score: 8450000, initials: 'BIL', difficulty: 29, start: 1, mode: 'platypus' },
  { score: 8100000, initials: 'SEA', difficulty: 27, start: 1, mode: 'manatee' },
  { score: 7700000, initials: 'ROO', difficulty: 22, start: 1 },
  { score: 7300000, initials: 'KIT', difficulty: 18, start: 1, mode: 'part2' },
  { score: 6900000, initials: 'DUK', difficulty: 14, start: 1, mode: 'platypus' },
  { score: 6500000, initials: 'COW', difficulty: 12, start: 1, mode: 'manatee' },
  { score: 6100000, initials: 'PUP', difficulty: 9, start: 1 },
  { score: 5800000, initials: 'ABC', difficulty: 8, start: 1, mode: 'part2' },
  { score: 5500000, initials: 'FUN', difficulty: 7, start: 1, mode: 'manatee' },
];
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'en-US',
  recordVideo: { dir: VID, size: { width: 390, height: 844 } },
});
const blocked = [];
await ctx.route(/supabase\.co/, (r) => { blocked.push(r.request().url()); return r.abort(); });
await ctx.route(/goatcounter|hits\.sh|plausible|google/, (r) => r.abort());
await ctx.addInitScript((board) => {
  try {
    if (sessionStorage.getItem('init')) return;
    sessionStorage.setItem('init', '1');
    localStorage.clear();
    localStorage.setItem('fsb-tutorial-done-v1', '1');
    localStorage.setItem('fsb-story-boards-merged-v1', '1');
    localStorage.setItem('fsb-leaderboard-v1', JSON.stringify(board));
    localStorage.setItem('fsb_cat_suit_v1', '1');
    localStorage.setItem('fsb_animals_unlocked_v1', '1');
  } catch {}
}, FAKE_BOARD);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://127.0.0.1:5561/?notrack=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__fsbTest);
await page.evaluate(() => document.fonts.ready);
await sleep(600);
// A PLATYPUS MODE run (pack of 4).
await page.evaluate(() => { const T = window.__fsbTest; T.startStory('platypus'); });
await sleep(400);
await page.evaluate(() => window.__fsbTest.skipPromo());
await sleep(1300);
// Treat charge hits zero with pack pets left: one floats home to Earth (no pause).
await page.evaluate(() => { const g = window.__fsbTest.game; g.score = 1234567; g.charge = 0.0001; });
await sleep(550);
await page.screenshot({ path: `${OUT}/14-zip-home-on-hit.png` });
await sleep(1400);
// The run's last pet: treat charge hits zero -> floats down past the playfield onto Earth.
await page.evaluate(() => {
  const g = window.__fsbTest.game;
  while (g.formation.occupiedCount > 0) g.formation.dropOutermost();
  g.ships = 1;
  g.player.invuln = 0;
  g.charge = 0.0001;
});
await sleep(1250);
await page.screenshot({ path: `${OUT}/15-treats-on-earth.png` });
await sleep(900);
await page.screenshot({ path: `${OUT}/15b-treats-on-earth-taunt.png` });
await sleep(2200);
const st = await page.evaluate(() => window.__fsbTest.state().state);
await page.screenshot({ path: `${OUT}/13-one-board-all-modes.png` });
await sleep(800);
const video = page.video();
await ctx.close();
const vpath = await video.path();
fs.copyFileSync(vpath, `${OUT}/15-treats-on-earth.webm`);
await browser.close();
console.log('state at board:', st);
console.log('blocked supabase requests:', blocked.length);
console.log('page errors:', errs);
