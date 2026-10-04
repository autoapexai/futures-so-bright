/**
 * COMBING THE DESERT: the missed-board taunt on the game-over screen.
 *
 * When a finished run on the public board does not make the GLOBAL TOP 11, the game-over screen
 * gets a big card: "COMBING THE DESERT FOR YOUR HIGH SCORE" with a short comb-through-the-sand
 * search beat (SEARCH_MS, half a second), then a NOT FOUND stamp and one random taunt from
 * src/data/leaderboard-taunts.json (never the same one twice in a row on this device).
 * The card never blocks: ENTER / SPACE / RIDE still start the next run, and a tap on the card
 * just tucks it away so the board shows.
 *
 * The 100 taunts are original, G-rated slapstick sight gags (deadpan search-party mishaps), written in
 * all four languages with the same order in each: index i is the same gag everywhere, so the anonymous
 * ticker (which only shares an index) shows each player the gag in their own language.
 *
 * DESERT SEARCH PARTY REPORT (utils/tauntFeed.ts) is the anonymous cross-player ticker
 * (TAUNT_BROADCAST, backed by supabase/fsb_taunt_feed.sql).
 */
import TAUNTS_JSON from '../data/leaderboard-taunts.json';
import { lang, onLang, t as tr, type Lang } from '../i18n';
import { speakTrailer } from './silly';
import { FEED_POLL_MS, broadcastOn, fetchRecentTaunts, reportTaunt } from '../utils/tauntFeed';

const clean = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.length > 0) : []);
const RAW = TAUNTS_JSON as unknown as Record<Lang, unknown>;
/** English taunts (the reference list: the feed's index range is its length). */
export const TAUNTS: readonly string[] = clean(RAW.en);
const BY_LANG: Record<Lang, readonly string[]> = {
  en: TAUNTS,
  es: clean(RAW.es),
  vi: clean(RAW.vi),
  zh: clean(RAW.zh),
};
/** Taunt i in the current game language (English if a list is ever short). */
export function tauntText(i: number, l: Lang = lang()): string {
  const list = BY_LANG[l];
  return list && list.length === TAUNTS.length ? list[i] : TAUNTS[i];
}
/** The search beat before NOT FOUND + the taunt. */
export const SEARCH_MS = 500;
/** ON A MISSION runs use the separate DEV BOARD; no desert search for them (flip to opt in). */
export const DESERT_SEARCH_ON_MISSION = false;
/** How long one DESERT SEARCH PARTY REPORT ticker stays up. */
const TICKER_MS = 7000;
const LAST_KEY = 'fsb_last_taunt';

function loadLast(): number {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    const v = raw === null || raw === '' ? NaN : Number(raw);
    return Number.isInteger(v) && v >= 0 ? v : -1;
  } catch {
    return -1;
  }
}

function saveLast(i: number): void {
  try {
    localStorage.setItem(LAST_KEY, String(i));
  } catch {
    /* storage blocked: repeats are merely possible */
  }
}

/** A random taunt index in [0, count), never `last` (when there is any other choice). */
export function pickTauntIndex(count: number, last: number, rand: () => number = Math.random): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  const skip = last >= 0 && last < count;
  let i = Math.floor(rand() * (skip ? count - 1 : count));
  if (i < 0 || i >= count) i = 0;
  if (skip && i >= last) i++;
  return i;
}

type Phase = 'hidden' | 'searching' | 'found' | 'tucked';

export class DesertSearch {
  private phase: Phase = 'hidden';
  private index = -1;
  private timer = 0;
  private shownAt = 0;
  private tickerTimer = 0;
  private pollTimer = 0;
  private seen = new Set<number>();
  private mine = new Set<number>();
  private tickerIndex = -1;
  private readonly el: HTMLElement | null;
  private readonly ticker: HTMLElement | null;

  constructor(
    private readonly isMuted: () => boolean,
    /** Is a screen up where the ticker may appear (title / game over, no menus)? */
    private readonly tickerAllowed: () => boolean,
  ) {
    this.el = document.getElementById('desert-search');
    this.ticker = document.getElementById('ds-ticker');
    this.syncLabels();
    onLang(() => this.syncLabels());
    if (this.el) {
      // A tap on the card only tucks it away (never starts a run, never reaches the canvas).
      this.el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        if (this.phase === 'found' && performance.now() - this.shownAt > SEARCH_MS + 350) this.tuck();
      });
    }
    if (broadcastOn()) this.startFeed();
  }

  get state(): { phase: Phase; index: number; text: string | null; tickerIndex: number } {
    return { phase: this.phase, index: this.index, text: this.index >= 0 ? tauntText(this.index) : null, tickerIndex: this.tickerIndex };
  }

  /** Start the search beat, then reveal one random taunt (the run missed the public TOP 11). */
  show(): void {
    if (!this.el || TAUNTS.length === 0) return;
    this.clearTimer();
    this.index = pickTauntIndex(TAUNTS.length, loadLast());
    saveLast(this.index);
    const text = tauntText(this.index);
    const msg = this.el.querySelector<HTMLElement>('.ds-taunt');
    if (msg) msg.textContent = text;
    this.phase = 'searching';
    this.shownAt = performance.now();
    this.render();
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      if (this.phase !== 'searching') return;
      this.phase = 'found';
      this.render();
      const live = document.getElementById('score-a11y');
      if (live) live.textContent = `${tr('ds_notfound')}. ${text}`;
      // The trailer voice reads it (sound on; English only, the trailer voice is an English voice).
      if (!this.isMuted() && lang() === 'en') speakTrailer(text);
    }, SEARCH_MS);
    const idx = this.index;
    if (broadcastOn()) {
      void reportTaunt(idx, TAUNTS.length).then((id) => {
        if (id !== null) {
          this.mine.add(id);
          this.seen.add(id);
        }
      });
    }
  }

  /** Remove the card (next run, menus, initials...). */
  hide(): void {
    this.clearTimer();
    if (this.phase === 'hidden') return;
    this.phase = 'hidden';
    this.index = -1;
    this.render();
  }

  private tuck(): void {
    this.phase = 'tucked';
    this.render();
  }

  private clearTimer(): void {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = 0;
  }

  private render(): void {
    const el = this.el;
    if (!el) return;
    el.classList.toggle('open', this.phase === 'searching' || this.phase === 'found');
    el.classList.toggle('searching', this.phase === 'searching');
    el.classList.toggle('found', this.phase === 'found');
    el.setAttribute('aria-hidden', this.phase === 'searching' || this.phase === 'found' ? 'false' : 'true');
    document.body.classList.toggle('desert-open', this.phase === 'searching' || this.phase === 'found');
  }

  private syncLabels(): void {
    const set = (sel: string, key: Parameters<typeof tr>[0]) => {
      const n = document.querySelector<HTMLElement>(sel);
      if (n && n.textContent !== tr(key)) n.textContent = tr(key);
    };
    set('#desert-search .ds-head', 'ds_head');
    set('#desert-search .ds-notfound', 'ds_notfound');
    set('#desert-search .ds-hint-touch', 'ds_hint_touch');
    set('#desert-search .ds-hint-keys', 'ds_hint_keys');
    set('#ds-ticker .ds-tk-title', 'ds_feed_title');
    set('#ds-ticker .ds-tk-lead', 'ds_feed_lead');
    // A language switch while the card / ticker is up re-shows the same gag in the new language.
    const msg = this.el?.querySelector<HTMLElement>('.ds-taunt');
    if (msg && this.index >= 0) msg.textContent = tauntText(this.index);
    const tk = this.ticker?.querySelector<HTMLElement>('.ds-tk-msg');
    if (tk && this.tickerIndex >= 0) tk.textContent = tauntText(this.tickerIndex);
  }

  // —— DESERT SEARCH PARTY REPORT (off unless TAUNT_BROADCAST) ——

  private startFeed(): void {
    const poll = (): void => {
      this.pollTimer = window.setTimeout(poll, FEED_POLL_MS);
      if (document.visibilityState === 'hidden' || !this.tickerAllowed()) return;
      void this.pollOnce();
    };
    this.pollTimer = window.setTimeout(poll, 1200);
  }

  /** One feed read: show the newest report this device hasn't seen (and didn't send). */
  async pollOnce(): Promise<number | null> {
    const items = await fetchRecentTaunts(TAUNTS.length);
    if (!items) return null;
    const fresh = items.find((it) => !this.seen.has(it.id) && !this.mine.has(it.id));
    for (const it of items) this.seen.add(it.id);
    if (!fresh || !this.tickerAllowed()) return null;
    this.showTicker(fresh.taunt);
    return fresh.taunt;
  }

  private showTicker(index: number): void {
    const tk = this.ticker;
    if (!tk) return;
    const msg = tk.querySelector<HTMLElement>('.ds-tk-msg');
    if (msg) msg.textContent = tauntText(index);
    this.tickerIndex = index;
    tk.classList.add('open');
    tk.setAttribute('aria-hidden', 'false');
    if (this.tickerTimer) window.clearTimeout(this.tickerTimer);
    this.tickerTimer = window.setTimeout(() => this.hideTicker(), TICKER_MS);
  }

  hideTicker(): void {
    if (this.tickerTimer) window.clearTimeout(this.tickerTimer);
    this.tickerTimer = 0;
    this.tickerIndex = -1;
    this.ticker?.classList.remove('open');
    this.ticker?.setAttribute('aria-hidden', 'true');
  }

  /** Test builds: start the feed loop after the broadcast was switched on for a mocked test. */
  startFeedForTest(): void {
    if (__FSB_TEST__ && !this.pollTimer) this.startFeed();
  }
}
