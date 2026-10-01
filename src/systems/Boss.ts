/**
 * THE BOARD: a boss fight at the end of every tenth level (10, 20, ... 110) and a final one at
 * the end of level 111 (leading to VICTORY). Each boss is themed after one of the 12 modes
 * (ordered by starting dog count) and is strictly harder than the one before it: more HP,
 * faster volleys, more projectiles, faster shots, shorter stun, on the same diminishing-step
 * curve style as the gold zone. Every fight varies run to run (attack order, timings within
 * the boss's budget, weak-spot rows, stun-ring spots, taunts) from a seeded RNG, so a given
 * run seed replays identically.
 *
 * How you fight it: hold BOOST and your dogs bark (WOOF) straight ahead. Barks that hit the
 * glowing #1 rank slot (the weak spot) do full damage; elsewhere on the board they only chip.
 * Touch a rank-slot ring to STUN THE BOARD: while stunned it stops firing and every bark is a
 * critical hit. Beating a boss is a flat +1,000,000 points (see BOSS_BONUS). If a fight drags
 * past the boss's patience it gets BORED and leaves (no bonus, the run carries on).
 */
import { MODES, type ModeDef, type ModeStyle } from '../utils/modes';
import { mulberry32, shuffle, subSeed, type Rng } from '../utils/rng';
import { MAX_LEVEL } from '../utils/difficulty';
import { groceryTaunt } from './silly';
import { drawBuckleBuster, drawCowboy, drawVJ } from './bossArt';

/** Flat points for beating any boss (not multiplied; the score is still clamped to SCORE_CAP). */
export const BOSS_BONUS = 1_000_000;
/** Grace after a hit during a boss fight, s (shots within BOSS_MERCY_R px of the pack fizzle). */
export const BOSS_HIT_GRACE = 1.6;
export const BOSS_MERCY_R = 170;

export type Signature =
  | 'mirror'
  | 'twins'
  | 'decoy'
  | 'strut'
  | 'cowboy'
  | 'vj'
  | 'roulette'
  | 'coins'
  | 'chorus'
  | 'blink'
  | 'bang'
  | 'homing'
  | 'behind'
  | 'storm';

type Pattern = 'aimed' | 'spray' | 'wall' | 'mirror' | 'slam' | 'rain' | 'kick' | 'blink' | 'split' | 'homing' | 'behind' | 'dots' | 'buckles' | 'glitch' | 'static' | 'countdown' | 'lasso' | 'tumble' | 'chicken';

export interface BossDef {
  level: number;
  /** 1..12, strictly harder with rank. */
  rank: number;
  modeId: string;
  name: string;
  dogs: number;
  tint: string;
  style: ModeStyle;
  signature: Signature;
  /** One-line description of the signature mechanic. */
  blurb: string;
  patterns: Pattern[];
  taunts: string[];
}

const SIG: Record<string, { signature: Signature; blurb: string; patterns: Pattern[]; taunts: string[] }> = {
  mantzoukas: {
    signature: 'mirror',
    blurb: 'Mirror board: copies your moves upside down',
    patterns: ['aimed', 'mirror', 'spray'],
    taunts: ["I'M NOT COPYING YOU. YOU'RE COPYING ME.", 'ADJACENT TO GREATNESS.', 'MIRROR, MIRROR, ON THE BOARD.', 'NEXT DOOR AND NEXT LEVEL.'],
  },
  calvin: {
    signature: 'twins',
    blurb: 'Twin boards: two weak spots, one shared health bar',
    patterns: ['aimed', 'wall', 'spray'],
    taunts: ['TWO BOARDS. ONE GRUDGE.', "WE FINISH EACH OTHER'S SCORES.", 'DOUBLE TROUBLE.', 'TWINS NEVER LOSE. TWICE.'],
  },
  decoy: {
    signature: 'decoy',
    blurb: 'Decoy board: only the solid one is real, and they shuffle',
    patterns: ['aimed', 'spray', 'wall'],
    taunts: ['WHICH ONE IS REAL? GUESS.', 'DECOY? NEVER HEARD OF HER.', 'OPERATION: YOU LOSE.', 'NOTHING TO SEE HERE.'],
  },
  // Level 40: an ORIGINAL character boss (replaces the TOO FAT board; the TOO FAT mode stays).
  buckle: {
    signature: 'strut',
    blurb: 'BUCKLE BUSTER: belly scoreboard, popping buckles, moonwalk struts',
    patterns: ['buckles', 'slam', 'aimed'],
    taunts: [],
  },
  toofat: {
    signature: 'strut',
    blurb: 'Huge slow board that body-slams across the screen',
    patterns: ['wall', 'slam', 'aimed'],
    taunts: ['MORE BOARD TO LOVE.', 'MAKE ROOM.', "I'M BIG-BONED. AND BIG-SCORED.", 'INCOMING!'],
  },
  daly: {
    signature: 'cowboy',
    blurb: 'Comical cowboy tryout: lasso sweeps, tumbleweeds, rubber-chicken quick-draw; WANTED poster weak spot',
    patterns: ['lasso', 'tumble', 'chicken', 'aimed'],
    taunts: ['THANK YOU FOR AUDITIONING.', 'NEXT CHARACTER!', "WE'LL CALL YOU.", 'FROM THE TOP!'],
  },
  toosuccessful: {
    signature: 'coins',
    blurb: 'Gold coin rain from above',
    patterns: ['rain', 'aimed', 'wall'],
    taunts: ['MONEY RAIN, BABY.', 'TOO SUCCESSFUL TO LOSE.', 'MAKE IT RAIN.', 'SUCCESS LOOKS GOOD ON ME.'],
  },
  alw: {
    signature: 'chorus',
    blurb: 'Chorus line: kick lines sweep in step',
    patterns: ['kick', 'wall', 'aimed'],
    taunts: ['THE PHANTOM OF THE LEADERBOARD.', 'FROM THE TOP, WITH FEELING.', 'CUE THE CHORUS.', 'ALL ALONE ON THE BOARD.'],
  },
  slackerman: {
    signature: 'blink',
    blurb: 'Blink shots: only the solid ones hurt',
    patterns: ['blink', 'spray', 'wall'],
    taunts: ["I'LL GET TO IT. MAYBE.", 'NOW YOU SEE ME.', 'SLACKING, BUT WINNING.', 'TOO COOL TO TRY.'],
  },
  cbb: {
    signature: 'bang',
    blurb: 'BANG BANG: big shots that burst into three',
    patterns: ['split', 'aimed', 'wall'],
    taunts: ['BANG! BANG!', "WHAT'S UP, CHUM?", 'YES AND... NO.', 'BIG BANG ENERGY.'],
  },
  curry: {
    signature: 'vj',
    blurb: '80s VJ head on a CRT: glitch bursts, channel-change static walls, countdown number drops',
    patterns: ['glitch', 'static', 'countdown', 'homing'],
    taunts: ['IN THE MORNING!', 'NUMBER GO UP.', 'VALUE FOR VALUE.', 'BOOSTAGRAM INCOMING.'],
  },
  dvorak: {
    signature: 'behind',
    blurb: 'Contrarian: shots come from behind you',
    patterns: ['behind', 'aimed', 'wall'],
    taunts: ['WRONG. ALL OF IT.', 'I DISAGREE WITH YOUR DODGING.', 'LOOK BEHIND YOU.', 'CONTRARIAN BY DESIGN.'],
  },
  itm: {
    signature: 'storm',
    blurb: 'Final board: dot storm plus every trick before it',
    patterns: ['dots', 'homing', 'behind', 'split', 'wall', 'aimed'],
    taunts: ['IN THE MORNING. ALL OF US.', '3,333 DOTS SAY HI.', 'THE FINAL BOARD.', 'LEVEL 111 IS MINE.'],
  },
};

/** The fixed boss order: modes sorted by starting dog count (2-dog modes, then TOO FAT...ITM). */
const ORDER = ['mantzoukas', 'calvin', 'decoy', 'buckle', 'daly', 'toosuccessful', 'alw', 'slackerman', 'cbb', 'curry', 'dvorak', 'itm'];
export const BOSS_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, MAX_LEVEL];

/** Character bosses that are not a player mode (banner name, tint, style). */
const CHARACTERS: Record<string, { name: string; tint: string; style: ModeStyle }> = {
  buckle: { name: 'BUCKLE BUSTER', tint: '#ff3b8d', style: 'solid' },
};

export const BOSSES: readonly BossDef[] = ORDER.map((id, i) => {
  const m = (MODES.find((x) => x.id === id) as ModeDef | undefined) ?? { ...CHARACTERS[id], ships: 0 };
  const s = SIG[id];
  return { level: BOSS_LEVELS[i], rank: i + 1, modeId: id, name: m.name, dogs: m.ships, tint: m.tint, style: m.style, ...s };
});

/** The boss at the end of this level, or null. */
export function bossForLevel(level: number): BossDef | null {
  return BOSSES.find((b) => b.level === level) ?? null;
}

/** How many bosses a run can have beaten by the time it ends on this level (server mirrors this). */
export function bossesReachable(level: number): number {
  return BOSSES.filter((b) => b.level <= level).length;
}

export interface BossTuning {
  hp: number;
  /** Seconds between volleys (phase 1; phases 2-3 tighten it). */
  fireEvery: number;
  /** Average projectiles per volley (phase 1; +1 per later phase). */
  volley: number;
  /** Projectile speed, px/s at the reference height (scaled to the lane). */
  shotSpeed: number;
  /** Stun length after a ring touch, s. */
  stun: number;
  /** Weak-spot hop interval, s. */
  spotEvery: number;
  /** Rank-slot ring interval, s. */
  ringEvery: number;
  /** Patience before it gets bored and leaves, s. */
  bored: number;
}

/** Diminishing-step curve: 0 at rank 1, 1 at rank 12, each step smaller than the last. */
export function bossProgress(rank: number): number {
  const t = Math.min(1, Math.max(0, (rank - 1) / 11));
  return 1 - (1 - t) * (1 - t);
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function bossTuning(rank: number): BossTuning {
  const x = bossProgress(rank);
  return {
    hp: Math.round(lerp(55, 120, x)),
    fireEvery: +lerp(1.7, 0.95, x).toFixed(3),
    volley: +lerp(2, 5, x).toFixed(2),
    shotSpeed: Math.round(lerp(230, 360, x)),
    stun: +lerp(4.5, 1.6, x).toFixed(2),
    spotEvery: +lerp(3.4, 1.6, x).toFixed(2),
    ringEvery: +lerp(6, 7.5, x).toFixed(2),
    bored: Math.round(lerp(75, 200, x)),
  };
}

export interface BossShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  kind: 'orb' | 'dot' | 'coin' | 'blink' | 'split' | 'homing' | 'warn' | 'buckle' | 'num' | 'static' | 'glitch' | 'tumble' | 'chicken' | 'lasso';
  /** Label for countdown numbers. */
  n?: number;
  t: number;
  life: number;
  alive: boolean;
}

export interface Bark {
  x: number;
  y: number;
  alive: boolean;
}

export interface Board {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Real (damageable) board; the decoy board is false. */
  real: boolean;
  rows: number;
  spot: number;
  bob: number;
}

export type BossEvent =
  | { type: 'taunt'; text: string }
  | { type: 'hit'; x: number; y: number; crit: boolean; decoy: boolean }
  | { type: 'ring'; x: number; y: number }
  | { type: 'stunned' }
  | { type: 'phase'; phase: number }
  | { type: 'defeated' }
  | { type: 'bored' }
  | { type: 'gone' };

export interface BossInput {
  dt: number;
  W: number;
  top: number;
  bottom: number;
  px: number;
  py: number;
  /** The pack's vertical size (lead + formation), so wall gaps always fit it. */
  packH: number;
  boosting: boolean;
}

const BARK_EVERY = 0.2;
const BARK_SPEED = 760;
const ENTER_S = 1.6;
const EXIT_S = 1.4;

export class BossFight {
  readonly def: BossDef;
  readonly tune: BossTuning;
  readonly seed: number;
  /** Short version: the hp scale (the final boss is the full version, 1). */
  hp: number;
  readonly maxHp: number;
  boards: Board[] = [];
  shots: BossShot[] = [];
  barks: Bark[] = [];
  events: BossEvent[] = [];
  /** Fight clock (from the end of the entry slide), s. */
  t = 0;
  state: 'enter' | 'fight' | 'defeated' | 'bored' | 'gone' = 'enter';
  stunT = 0;
  phase = 1;
  /** Fight time when it was beaten (or left), s. */
  endT = 0;
  slam = 0;
  slamT = 0;
  taunt = '';
  tauntT = 0;
  private stateT = 0;
  private rng: Rng;
  private bag: Pattern[] = [];
  private fireT: number;
  private spotT: number;
  private ringT: number;
  private barkT = 0;
  private swapT = 6;
  private stunImmune = 0;
  private slideX = 1;
  private top = 0;
  private bottom = 0;
  private W = 0;

  /** Slapstick hit reaction timer (mustache droop, wobble), s. */
  hurtT = 0;
  /** Cowboy: hat over the eyes / tangled in his own lasso, s. */
  hatT = 0;
  tangleT = 0;
  /** Local player-history jabs folded into the grocery-list taunts. */
  jabs: string[] = [];
  /** The final (corkboard) board pins this high score under its cat magnet. */
  pinnedScore = 0;

  constructor(def: BossDef, runSeed: number, jabs: string[] = [], pinnedScore = 0) {
    this.jabs = jabs;
    this.pinnedScore = pinnedScore;
    this.def = def;
    this.tune = bossTuning(def.rank);
    this.seed = subSeed(runSeed, def.level);
    this.rng = mulberry32(this.seed);
    this.maxHp = this.tune.hp;
    this.hp = this.maxHp;
    this.fireT = 0.6 + this.rng() * 0.6;
    this.spotT = this.tune.spotEvery;
    this.ringT = this.tune.ringEvery * (0.35 + this.rng() * 0.3);
    const n = def.signature === 'twins' || def.signature === 'decoy' ? 2 : 1;
    for (let i = 0; i < n; i++) {
      this.boards.push({ x: 0, y: 0, w: 0, h: 0, real: def.signature !== 'decoy' || i === 0, rows: n === 2 ? 3 : 5, spot: 0, bob: this.rng() * 6.28 });
    }
    for (const b of this.boards) b.spot = Math.floor(this.rng() * b.rows);
    this.sayTaunt();
  }

  /** Top of the play lane (below the HUD), for the name / HP bar. */
  /** Bottom of the HUD text block (set by the game each frame) so the title never overlaps it. */
  hudBottom = 0;

  get laneTop(): number {
    return Math.max(this.top, this.hudBottom);
  }

  get stunned(): boolean {
    return this.stunT > 0;
  }

  get active(): boolean {
    return this.state === 'enter' || this.state === 'fight';
  }

  private sayTaunt(text?: string): void {
    // Every taunt is a grocery list read like a movie trailer (silly.ts), with the player's own
    // local history folded in as list items.
    let line = text ?? groceryTaunt(this.def.modeId, this.rng, this.jabs);
    if (this.def.signature === 'vj') line = stutter(line, this.rng);
    this.taunt = line;
    this.tauntT = 3.6;
    this.events.push({ type: 'taunt', text: line });
  }

  private nextPattern(): Pattern {
    if (!this.bag.length) {
      // Shuffle bag: every attack in the boss's pool once per cycle, in a random order; the
      // signature attack appears twice per cycle.
      const pool = [...this.def.patterns, this.def.patterns[0]];
      shuffle(this.rng, pool);
      this.bag = pool;
    }
    return this.bag.pop() as Pattern;
  }

  /** Ring touched by the pack: stun (with a short immunity so rings can't chain-lock it). */
  stunHit(): boolean {
    if (this.state !== 'fight' || this.stunImmune > 0 || this.stunT > 0) return false;
    this.stunT = this.tune.stun;
    this.stunImmune = this.tune.stun + 1.5;
    this.shots.length = 0;
    this.slam = 0;
    this.events.push({ type: 'stunned' });
    return true;
  }

  /** The lead board (for banners / bars). */
  get main(): Board {
    return this.boards.find((b) => b.real) ?? this.boards[0];
  }

  private layout(i: Board, idx: number, dt: number, py: number): void {
    const laneH = this.bottom - this.top;
    const sig = this.def.signature;
    const two = this.boards.length === 2;
    let h = laneH * (two ? 0.4 : sig === 'strut' ? 0.5 : sig === 'cowboy' ? 0.42 : sig === 'vj' ? 0.62 : 0.6);
    let w = Math.min(Math.max(this.W * 0.15, 64), 150, h * 0.62);
    if (sig === 'strut') w = Math.min(this.W * 0.3, w * 1.6);
    if (sig === 'vj') w = Math.min(this.W * 0.26, w * 1.35);
    h = Math.min(h, laneH * 0.82);
    i.w = w;
    i.h = h;
    i.bob += dt * (sig === 'strut' ? 0.8 : 1.1);
    const margin = Math.max(14, this.W * 0.035);
    let x = this.W - margin - w / 2;
    let y: number;
    const amp = (laneH - h) / 2;
    if (sig === 'mirror') {
      // Copies your vertical moves, upside down (smoothed).
      const want = Math.min(this.bottom - h / 2, Math.max(this.top + h / 2, this.top + this.bottom - py));
      const k = 1 - Math.exp(-3.2 * dt);
      y = i.y ? i.y + (want - i.y) * k : want;
    } else if (two) {
      const half = laneH / 2;
      const base = this.top + half * (idx === 0 ? 0.5 : 1.5);
      y = base + Math.sin(i.bob + idx * Math.PI) * Math.max(0, (half - h) / 2);
    } else {
      y = (this.top + this.bottom) / 2 + Math.sin(i.bob) * amp * 0.9;
    }
    if (sig === 'strut' && this.slam > 0) x -= this.slam * (this.W * 0.42);
    i.x = x + this.slideX * (w + margin * 2);
    i.y = y;
  }

  update(inp: BossInput): void {
    const { dt } = inp;
    this.W = inp.W;
    this.top = inp.top;
    this.bottom = inp.bottom;
    this.stateT += dt;
    if (this.tauntT > 0) this.tauntT = Math.max(0, this.tauntT - dt);
    if (this.state === 'enter') {
      this.slideX = Math.max(0, 1 - this.stateT / ENTER_S);
      if (this.stateT >= ENTER_S) {
        this.state = 'fight';
        this.stateT = 0;
        this.slideX = 0;
      }
    } else if (this.state === 'defeated' || this.state === 'bored') {
      this.slideX = Math.min(1, this.stateT / EXIT_S);
      if (this.stateT >= EXIT_S) {
        this.state = 'gone';
        this.events.push({ type: 'gone' });
      }
    }
    this.boards.forEach((b, i) => this.layout(b, i, this.stunT > 0 ? dt * 0.25 : dt, inp.py));
    this.updateShots(inp);
    if (this.state !== 'fight') return;

    this.t += dt;
    if (this.t >= this.tune.bored) {
      this.state = 'bored';
      this.stateT = 0;
      this.endT = this.t;
      this.shots.length = 0;
      this.sayTaunt('BORED NOW. BYE.');
      this.events.push({ type: 'bored' });
      return;
    }
    this.stunImmune = Math.max(0, this.stunImmune - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.hatT = Math.max(0, this.hatT - dt);
    if (this.tangleT > 0) {
      // Tangled in his own lasso: no shooting until he wriggles free.
      this.tangleT = Math.max(0, this.tangleT - dt);
      if (this.tangleT > 0) this.fireT = Math.max(this.fireT, 0.2);
    }
    if (this.stunT > 0) this.stunT = Math.max(0, this.stunT - dt);

    // Barks: boosting dogs bark straight ahead.
    this.barkT -= dt;
    if (inp.boosting && this.barkT <= 0) {
      this.barkT = BARK_EVERY;
      this.barks.push({ x: inp.px + 30, y: inp.py, alive: true });
    }
    for (const k of this.barks) {
      if (!k.alive) continue;
      k.x += BARK_SPEED * dt;
      if (k.x > this.W + 40) k.alive = false;
      for (const b of this.boards) {
        if (k.x < b.x - b.w / 2 || k.x > b.x + b.w / 2 || k.y < b.y - b.h / 2 || k.y > b.y + b.h / 2) continue;
        k.alive = false;
        if (!b.real) {
          this.events.push({ type: 'hit', x: k.x, y: k.y, crit: false, decoy: true });
          break;
        }
        const rowH = b.h / b.rows;
        const sy = b.y - b.h / 2 + rowH * (b.spot + 0.5);
        const onSpot = Math.abs(k.y - sy) <= rowH * 0.6;
        const dmg = this.stunT > 0 ? (onSpot ? 3 : 1) : onSpot ? 1 : 0.2;
        this.hp = Math.max(0, this.hp - dmg);
        this.hurtT = 0.35;
        if (this.def.signature === 'cowboy' && this.hatT <= 0 && this.rng() < 0.06) this.hatT = 1.2;
        this.events.push({ type: 'hit', x: k.x, y: k.y, crit: onSpot || this.stunT > 0, decoy: false });
        break;
      }
    }
    this.barks = this.barks.filter((k) => k.alive);
    if (this.hp <= 0) {
      this.state = 'defeated';
      this.stateT = 0;
      this.endT = this.t;
      this.shots.length = 0;
      this.barks.length = 0;
      this.slam = 0;
      this.events.push({ type: 'defeated' });
      return;
    }
    const ph = this.hp <= this.maxHp / 3 ? 3 : this.hp <= (this.maxHp * 2) / 3 ? 2 : 1;
    if (ph !== this.phase) {
      this.phase = ph;
      this.events.push({ type: 'phase', phase: ph });
      this.sayTaunt();
    }

    // Weak spot hops to a different rank slot.
    this.spotT -= dt;
    if (this.spotT <= 0) {
      this.spotT = this.tune.spotEvery * (0.75 + this.rng() * 0.5);
      for (const b of this.boards) {
        const r = Math.floor(this.rng() * (b.rows - 1));
        b.spot = r >= b.spot ? r + 1 : r;
      }
    }
    // Decoy shuffle.
    if (this.def.signature === 'decoy') {
      this.swapT -= dt;
      if (this.swapT <= 0) {
        this.swapT = 4 + this.rng() * 4;
        if (this.rng() < 0.6) for (const b of this.boards) b.real = !b.real;
      }
    }
    // Rank-slot rings at random heights in front of the board.
    this.ringT -= dt;
    if (this.ringT <= 0) {
      this.ringT = this.tune.ringEvery * (0.8 + this.rng() * 0.4);
      const y = this.top + 60 + this.rng() * Math.max(10, this.bottom - this.top - 120);
      this.events.push({ type: 'ring', x: this.W * (0.62 + this.rng() * 0.12), y });
    }
    // Slam (TOO FAT): telegraph 0.7 s, lunge 0.45 s, hold 0.3 s, back 0.8 s.
    if (this.slamT > 0) {
      this.slamT += dt;
      const s = this.slamT;
      this.slam = s < 0.7 ? 0 : s < 1.15 ? (s - 0.7) / 0.45 : s < 1.45 ? 1 : s < 2.25 ? 1 - (s - 1.45) / 0.8 : 0;
      if (s >= 2.25) this.slamT = 0;
    }
    if (this.stunT > 0) return;
    this.fireT -= dt;
    if (this.fireT <= 0) {
      const tighten = [1, 0.85, 0.72][this.phase - 1];
      this.fireT = this.tune.fireEvery * tighten * (0.8 + this.rng() * 0.4);
      this.fire(this.nextPattern(), inp);
    }
  }

  private volleyCount(): number {
    const v = this.tune.volley + (this.phase - 1);
    return Math.max(1, Math.floor(v + this.rng()));
  }

  private shot(x: number, y: number, vx: number, vy: number, r: number, kind: BossShot['kind'], life = 6): void {
    this.shots.push({ x, y, vx, vy, r, kind, t: 0, life, alive: true });
  }

  private fire(p: Pattern, inp: BossInput): void {
    const laneH = this.bottom - this.top;
    const sp = this.tune.shotSpeed * Math.max(0.75, Math.min(1.3, laneH / 420));
    const r = Math.max(7, laneH * 0.022);
    const n = this.volleyCount();
    const shooters = this.boards.filter((b) => this.def.signature === 'twins' || this.boards.length === 1 || this.rng() < 0.7 || b.real);
    const src = this.def.signature === 'twins' ? [shooters[Math.floor(this.rng() * shooters.length)]] : shooters.slice(0, 1);
    const b = src[0] ?? this.boards[0];
    const ox = b.x - b.w / 2;
    const oy = b.y;
    const jit = () => (this.rng() - 0.5) * 0.1;
    switch (p) {
      case 'aimed': {
        const base = Math.atan2(inp.py - oy, inp.px - ox);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.14 + jit();
          this.shot(ox, oy, Math.cos(a) * sp, Math.sin(a) * sp, r, 'orb');
        }
        break;
      }
      case 'spray': {
        for (let i = 0; i < n; i++) {
          const a = Math.PI + (this.rng() - 0.5) * 1.0;
          this.shot(ox, b.y + (this.rng() - 0.5) * b.h * 0.8, Math.cos(a) * sp * 0.9, Math.sin(a) * sp * 0.9, r, 'orb');
        }
        break;
      }
      case 'mirror': {
        // Straight shots from the mirrored heights of your pack.
        const my = this.top + this.bottom - inp.py;
        for (let i = 0; i < n; i++) {
          const y = Math.min(this.bottom - r, Math.max(this.top + r, my + (i - (n - 1) / 2) * r * 4));
          this.shot(ox, y, -sp, 0, r, 'orb');
        }
        break;
      }
      case 'wall':
      case 'kick': {
        // A column of shots across the lane with a gap that always fits the pack.
        const gap = Math.min(laneH * 0.62, Math.max(inp.packH + 56, 120));
        const gy = this.top + gap / 2 + this.rng() * Math.max(1, laneH - gap);
        const step = r * 3.2;
        const kick = p === 'kick';
        for (let y = this.top + r; y < this.bottom; y += step) {
          if (Math.abs(y - gy) < gap / 2) continue;
          this.shot(this.W + r, y, -sp * 0.62, 0, r, kick ? 'dot' : 'orb', 9);
          if (kick) this.shots[this.shots.length - 1].t = -((y - this.top) / laneH) * 0.6;
        }
        break;
      }
      case 'slam': {
        if (this.slamT === 0) this.slamT = 0.0001;
        for (let i = 0; i < n; i++) {
          const y = this.top + (laneH * (i + 0.5)) / n;
          this.shot(ox, y, -sp * 0.7, 0, r * 1.3, 'orb');
        }
        break;
      }
      case 'rain': {
        for (let i = 0; i < n; i++) {
          const x = inp.px - 40 + this.rng() * (this.W * 0.55);
          this.shot(x, this.top - r - this.rng() * 90, -sp * 0.15, sp * 0.5, r, 'coin');
        }
        break;
      }
      case 'blink': {
        for (let i = 0; i < n + 1; i++) {
          const a = Math.PI + (this.rng() - 0.5) * 0.8;
          const s = this.shots.length;
          this.shot(ox, b.y + (this.rng() - 0.5) * b.h, Math.cos(a) * sp * 0.85, Math.sin(a) * sp * 0.85, r * 1.1, 'blink');
          this.shots[s].t = this.rng();
        }
        break;
      }
      case 'split': {
        const k = Math.max(1, Math.ceil(n / 3));
        for (let i = 0; i < k; i++) {
          const a = Math.atan2(inp.py - oy, inp.px - ox) + (i - (k - 1) / 2) * 0.35 + jit();
          this.shot(ox, oy, Math.cos(a) * sp * 0.7, Math.sin(a) * sp * 0.7, r * 1.7, 'split');
        }
        break;
      }
      case 'homing': {
        const k = Math.max(1, Math.ceil(n / 3));
        for (let i = 0; i < k; i++) {
          const a = Math.PI + (i - (k - 1) / 2) * 0.5;
          this.shot(ox, oy, Math.cos(a) * sp * 0.55, Math.sin(a) * sp * 0.55, r, 'homing', 3.2);
        }
        break;
      }
      case 'behind': {
        // Warnings at the left edge, then shots from behind 1.1 s later.
        for (let i = 0; i < Math.max(1, Math.ceil(n / 2)); i++) {
          const y = Math.min(this.bottom - r, Math.max(this.top + r, inp.py + (this.rng() - 0.5) * laneH * 0.7));
          this.shot(r + 4, y, 0, 0, r, 'warn', 1.1);
        }
        break;
      }
      case 'lasso': {
        // Lasso sweep: a loop of shots that spins out from his hand. Sometimes it tangles him.
        const k = 6 + n * 2;
        const cx0 = ox - 10;
        for (let i = 0; i < k; i++) {
          const a = (i / k) * Math.PI * 2;
          const v = sp * 0.55;
          this.shot(cx0 + Math.cos(a) * 20, oy + Math.sin(a) * 20, Math.cos(a) * v * 0.35 - v, Math.sin(a) * v * 0.6, r * 0.7, 'lasso', 6);
        }
        if (this.rng() < 0.25) {
          this.tangleT = 1.1;
          this.events.push({ type: 'taunt', text: 'IN A WORLD... ROPE. MORE ROPE. ONE (1) KNOT.' });
        }
        break;
      }
      case 'tumble': {
        // Tumbleweeds bounce along the lane.
        for (let i = 0; i < Math.max(1, Math.ceil(n / 2)); i++) {
          const y = this.top + 20 + this.rng() * (laneH - 40);
          this.shot(this.W + r * 2 + i * 60, y, -sp * (0.5 + this.rng() * 0.2), (this.rng() < 0.5 ? -1 : 1) * sp * 0.45, r * 1.4, 'tumble', 9);
        }
        break;
      }
      case 'chicken': {
        // Quick-draw: rubber chickens (and finger-gun PEWs) aimed at you.
        const base = Math.atan2(inp.py - oy, inp.px - ox);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.16;
          this.shot(ox, oy, Math.cos(a) * sp, Math.sin(a) * sp, r, 'chicken');
        }
        break;
      }
      case 'buckles': {
        // Buckles pop off his jacket and arc across the lane (gravity applies).
        for (let i = 0; i < n; i++) {
          const a = Math.PI + (this.rng() - 0.65) * 0.9;
          this.shot(ox, b.y + (this.rng() - 0.5) * b.h * 0.6, Math.cos(a) * sp * 0.8, Math.sin(a) * sp * 0.8, r * 1.1, 'buckle');
        }
        break;
      }
      case 'glitch': {
        // Glitch burst: a lane band flickers (0.45 s warning), then scrambles with fast shards.
        const bandH = Math.min(laneH * 0.3, Math.max(60, laneH * 0.22));
        const gy = this.top + this.rng() * Math.max(1, laneH - bandH);
        const k = 4 + n;
        for (let i = 0; i < k; i++) {
          const s = this.shots.length;
          this.shot(this.W * (0.15 + this.rng() * 0.75), gy + this.rng() * bandH, -sp * (0.9 + this.rng() * 0.6), 0, r * 0.8, 'glitch', 2.5);
          this.shots[s].t = -0.45;
        }
        break;
      }
      case 'static': {
        // Channel change: a static wall with one safe gap that always fits the pack.
        const gap = Math.min(laneH * 0.6, Math.max(inp.packH + 56, 120));
        const gy = this.top + gap / 2 + this.rng() * Math.max(1, laneH - gap);
        for (let y = this.top + r; y < this.bottom; y += r * 2.4) {
          if (Math.abs(y - gy) < gap / 2) continue;
          this.shot(this.W + r, y, -sp * 0.6, 0, r * 1.1, 'static', 9);
        }
        break;
      }
      case 'countdown': {
        // Music-video countdown: numbers drop from the top, counting down.
        const k = Math.max(2, n);
        for (let i = 0; i < k; i++) {
          const s = this.shots.length;
          this.shot(inp.px - 30 + this.rng() * this.W * 0.5, this.top - r - i * 40, -sp * 0.1, sp * 0.48, r * 1.2, 'num');
          this.shots[s].n = k - i;
        }
        break;
      }
      case 'dots': {
        const k = n * 3;
        const gap = Math.min(laneH * 0.55, Math.max(inp.packH + 56, 120));
        const gy = this.top + gap / 2 + this.rng() * Math.max(1, laneH - gap);
        for (let i = 0; i < k; i++) {
          const y = this.top + this.rng() * laneH;
          if (Math.abs(y - gy) < gap / 2) continue;
          this.shot(this.W + this.rng() * 120, y, -sp * (0.55 + this.rng() * 0.3), (this.rng() - 0.5) * 60, r * 0.6, 'dot', 9);
        }
        break;
      }
    }
  }

  private updateShots(inp: BossInput): void {
    const { dt } = inp;
    const sp = this.tune.shotSpeed;
    const add: BossShot[] = [];
    for (const s of this.shots) {
      if (!s.alive) continue;
      s.t += dt;
      s.life -= dt;
      if (s.kind === 'split' && s.t >= 0.65) {
        s.alive = false;
        for (let i = -1; i <= 1; i++) {
          const a = Math.atan2(s.vy, s.vx) + i * 0.45;
          add.push({ x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: s.r * 0.6, kind: 'orb', t: 0, life: 5, alive: true });
        }
        continue;
      }
      if (s.kind === 'warn' && s.life <= 0) {
        s.alive = false;
        add.push({ x: -s.r, y: s.y, vx: sp * 0.65, vy: 0, r: s.r, kind: 'orb', t: 0, life: 6, alive: true });
        continue;
      }
      if (s.kind === 'homing') {
        const want = Math.atan2(inp.py - s.y, inp.px - s.x);
        const cur = Math.atan2(s.vy, s.vx);
        let d = want - cur;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        const turn = Math.max(-1.1 * dt, Math.min(1.1 * dt, d));
        const v = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(cur + turn) * v;
        s.vy = Math.sin(cur + turn) * v;
      }
      if ((s.kind === 'dot' || s.kind === 'glitch') && s.t < 0) continue;
      if (s.kind === 'buckle') s.vy += 420 * dt;
      if (s.kind === 'tumble' && ((s.y < this.top + s.r && s.vy < 0) || (s.y > this.bottom - s.r && s.vy > 0))) s.vy = -s.vy;
      if (s.kind === 'dot' && s.vy === 0 && s.life > 0) s.y += Math.sin(s.t * 5) * 30 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life <= 0 || s.x < -60 || s.x > this.W + 200 || s.y < this.top - 120 || s.y > this.bottom + 60) s.alive = false;
    }
    this.shots = this.shots.filter((s) => s.alive).concat(add);
  }

  /** Is this shot dangerous right now (blink shots only when solid; warnings never)? */
  static harmful(s: BossShot): boolean {
    if (!s.alive || s.kind === 'warn') return false;
    if ((s.kind === 'dot' || s.kind === 'glitch') && s.t < 0) return false;
    if (s.kind === 'blink') return Math.floor(s.t / 0.45) % 2 === 0;
    return true;
  }

  /** Mercy on a hit: shots near the pack fizzle, so one mistake doesn't cascade. */
  clearNear(x: number, y: number, r: number): void {
    for (const s of this.shots) if ((s.x - x) ** 2 + (s.y - y) ** 2 <= r * r) s.alive = false;
  }

  /** Does a box touch the boss body (TOO FAT's slam, or flying into a board)? */
  bodyHits(x: number, y: number, w: number, h: number): boolean {
    if (this.state !== 'fight') return false;
    for (const b of this.boards) {
      if (x < b.x + b.w / 2 && x + w > b.x - b.w / 2 && y < b.y + b.h / 2 && y + h > b.y - b.h / 2) return true;
    }
    return false;
  }

  /** A shot near a box (cheap circle/box test). */
  static shotHits(s: BossShot, x: number, y: number, w: number, h: number): boolean {
    const qx = Math.max(x, Math.min(s.x, x + w));
    const qy = Math.max(y, Math.min(s.y, y + h));
    const dx = s.x - qx;
    const dy = s.y - qy;
    return dx * dx + dy * dy <= s.r * s.r;
  }
}

/** "G-G-G-GROCERY LIST": stutter a few words (the VJ boss). */
export function stutter(text: string, rng: () => number): string {
  return text
    .split(' ')
    .map((w, i) => {
      if (!/^[A-Z]/.test(w) || (i > 0 && rng() > 0.35)) return w;
      const k = 1 + Math.floor(rng() * 3);
      return `${(w[0] + '-').repeat(k)}${w}`;
    })
    .join(' ');
}

/** Draw THE BOARD (boards, weak spots, shots, barks, name + HP bar, taunt). */
export function drawBoss(ctx: CanvasRenderingContext2D, f: BossFight, W: number, u: (n: number) => number, lite: boolean, time: number): void {
  const d = f.def;
  ctx.save();
  // Shots under the boards.
  for (const s of f.shots) {
    if (!s.alive) continue;
    if (s.kind === 'warn') {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 30);
      ctx.fillStyle = '#ff3355';
      ctx.font = `900 ${u(18)}px 'Orbitron', sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', s.x - 2, s.y);
      ctx.globalAlpha = 1;
      continue;
    }
    if ((s.kind === 'dot' || s.kind === 'glitch') && s.t < 0) {
      if (s.kind === 'glitch' && Math.floor(time * 20) % 2) {
        ctx.fillStyle = 'rgba(127,255,255,0.35)';
        ctx.fillRect(0, s.y - s.r, W, s.r * 2);
      }
      continue;
    }
    if (s.kind === 'num' || s.kind === 'chicken' || s.kind === 'buckle' || s.kind === 'static' || s.kind === 'glitch' || s.kind === 'tumble' || s.kind === 'lasso') {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (s.kind === 'num') {
        ctx.fillStyle = '#7fffff';
        ctx.font = `900 ${s.r * 2.2}px 'Orbitron', sans-serif`;
        ctx.fillText(String(s.n ?? 1), 0, 0);
      } else if (s.kind === 'chicken') {
        ctx.rotate(s.t * 8);
        ctx.fillStyle = '#ffe14d';
        ctx.beginPath();
        ctx.ellipse(0, 0, s.r * 1.3, s.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff3b3b';
        ctx.fillRect(s.r * 1.1, -s.r * 0.5, s.r * 0.4, s.r * 0.4);
        ctx.rotate(-s.t * 8);
        ctx.fillStyle = '#fff';
        ctx.font = `900 ${Math.max(9, s.r)}px 'Orbitron', sans-serif`;
        if (s.t < 0.3) ctx.fillText('PEW', 0, -s.r * 1.6);
      } else if (s.kind === 'buckle') {
        ctx.rotate(s.t * 10);
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 3;
        ctx.strokeRect(-s.r, -s.r * 0.7, s.r * 2, s.r * 1.4);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(-1.5, -s.r * 0.7, 3, s.r * 1.4);
      } else if (s.kind === 'static') {
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = `rgba(${200 + ((i * 37 + Math.floor(time * 30)) % 55)},${200 + ((i * 53) % 55)},${200 + ((i * 17) % 55)},0.9)`;
          ctx.fillRect(-s.r + ((i * 7) % (s.r * 2)), -s.r + ((i * 11 + Math.floor(time * 60)) % (s.r * 2)), s.r * 0.6, s.r * 0.6);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.strokeRect(-s.r, -s.r, s.r * 2, s.r * 2);
      } else if (s.kind === 'glitch') {
        ctx.fillStyle = 'rgba(255,0,80,0.85)';
        ctx.fillRect(-s.r * 2 - 2, -s.r * 0.5, s.r * 4, s.r);
        ctx.fillStyle = 'rgba(0,220,255,0.85)';
        ctx.fillRect(-s.r * 2 + 2, -s.r * 0.5, s.r * 4, s.r);
      } else if (s.kind === 'tumble') {
        ctx.rotate(-s.t * 6);
        ctx.strokeStyle = '#a0723c';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(0, 0, s.r, s.r * 0.6, (i * Math.PI) / 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#e8c27a';
        ctx.beginPath();
        ctx.arc(0, 0, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      continue;
    }
    const solid = BossFight.harmful(s);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    if (s.kind === 'coin') {
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      ctx.strokeStyle = '#a86b00';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (s.kind === 'blink' && !solid) {
      ctx.strokeStyle = d.tint;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = s.kind === 'split' ? '#ffaa44' : s.kind === 'homing' ? '#7fffff' : d.tint;
      if (!lite) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.fillStyle as string;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Barks.
  ctx.fillStyle = '#ffe66d';
  ctx.font = `900 ${u(13)}px 'Orbitron', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const k of f.barks) ctx.fillText('WOOF', k.x, k.y);

  for (const b of f.boards) {
    const x0 = b.x - b.w / 2;
    const y0 = b.y - b.h / 2;
    const stun = f.stunned;
    if (d.signature === 'strut' || d.signature === 'cowboy' || d.signature === 'vj') {
      ctx.save();
      if (stun) ctx.filter = 'grayscale(0.8)';
      if (d.signature === 'strut') drawBuckleBuster(ctx, f, b, time);
      else if (d.signature === 'cowboy') drawCowboy(ctx, f, b, time);
      else drawVJ(ctx, f, b, time, lite);
      ctx.restore();
      if (stun) {
        ctx.fillStyle = '#ffe66d';
        ctx.textAlign = 'center';
        ctx.font = `900 ${u(12)}px 'Orbitron', sans-serif`;
        ctx.fillText('STUNNED', b.x, y0 - u(30));
      }
      continue;
    }
    const tell = false as boolean;
    ctx.globalAlpha = b.real ? 1 : 0.85;
    const cork = d.level === MAX_LEVEL;
    ctx.fillStyle = stun ? 'rgba(60,60,80,0.92)' : tell ? 'rgba(90,0,30,0.92)' : cork ? '#b5835a' : 'rgba(10,0,28,0.9)';
    ctx.fillRect(x0, y0, b.w, b.h);
    if (cork && !stun) {
      // CORKBOARD: speckles (fixed pattern) and a wooden frame.
      ctx.fillStyle = 'rgba(90, 50, 20, 0.45)';
      for (let i = 0; i < 70; i++) {
        const fx = ((i * 73) % 97) / 97;
        const fy = ((i * 41) % 89) / 89;
        ctx.fillRect(x0 + fx * b.w, y0 + fy * b.h, 2, 2);
      }
      ctx.strokeStyle = '#6b4423';
      ctx.lineWidth = 6;
      ctx.strokeRect(x0 - 3, y0 - 3, b.w + 6, b.h + 6);
    }
    ctx.lineWidth = d.style === 'outline' || !b.real ? 2 : 4;
    if (!b.real || d.style === 'dot') ctx.setLineDash([4, 5]);
    ctx.strokeStyle = stun ? '#9aa' : d.tint;
    if (!lite && !stun) {
      ctx.shadowBlur = 16;
      ctx.shadowColor = d.tint;
    }
    ctx.strokeRect(x0, y0, b.w, b.h);
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    const rowH = b.h / b.rows;
    for (let r = 0; r < b.rows; r++) {
      const ry = y0 + rowH * r;
      const spot = r === b.spot && f.active;
      if (cork && !spot) {
        // pinned paper notes
        ctx.save();
        ctx.translate(x0 + b.w / 2, ry + rowH / 2);
        ctx.rotate(((r * 37) % 7 - 3) * 0.012);
        ctx.fillStyle = '#f4ecd8';
        ctx.fillRect(-b.w / 2 + 6, -rowH / 2 + 4, b.w - 12, rowH - 8);
        ctx.restore();
        ctx.fillStyle = '#d62828';
        ctx.beginPath();
        ctx.arc(x0 + b.w / 2, ry + 6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (spot) {
        const pulse = 0.6 + 0.4 * Math.sin(time * 10);
        ctx.fillStyle = b.real ? `rgba(255,214,63,${0.55 + 0.35 * pulse})` : `rgba(255,255,255,${0.25 + 0.2 * pulse})`;
        ctx.fillRect(x0 + 3, ry + 3, b.w - 6, rowH - 6);
      }
      ctx.fillStyle = spot || cork ? '#1a0030' : 'rgba(255,255,255,0.55)';
      ctx.font = `800 ${Math.max(9, Math.min(u(13), rowH * 0.42))}px 'Orbitron', sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(spot ? '#1' : `#${r + 2}`, x0 + 6, ry + rowH / 2);
      ctx.fillRect(x0 + b.w * 0.45, ry + rowH / 2 - 1.5, b.w * 0.45, 3);
    }
    if (cork) {
      // The high score, pinned under a cat-shaped magnet at the top of the corkboard.
      const nw = Math.max(b.w * 1.1, u(96));
      const nh = u(26);
      const nx = b.x - nw / 2;
      const ny = y0 - nh - u(6);
      ctx.save();
      ctx.translate(b.x, ny + nh / 2);
      ctx.rotate(-0.04);
      ctx.fillStyle = '#fffbe6';
      ctx.fillRect(-nw / 2, -nh / 2, nw, nh);
      ctx.fillStyle = '#1a0030';
      ctx.textAlign = 'center';
      ctx.font = `800 ${u(10)}px 'Orbitron', sans-serif`;
      ctx.fillText(`HIGH SCORE ${Math.floor(f.pinnedScore).toLocaleString('en-US')}`, 0, u(4));
      // cat magnet: head, ears, eyes, whiskers
      const cy = -nh / 2;
      const cr = u(9);
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(0, cy, cr, 0, Math.PI * 2);
      ctx.moveTo(-cr * 0.95, cy - cr * 0.2);
      ctx.lineTo(-cr * 0.55, cy - cr * 1.5);
      ctx.lineTo(-cr * 0.1, cy - cr * 0.8);
      ctx.moveTo(cr * 0.95, cy - cr * 0.2);
      ctx.lineTo(cr * 0.55, cy - cr * 1.5);
      ctx.lineTo(cr * 0.1, cy - cr * 0.8);
      ctx.fill();
      ctx.fillStyle = '#ffe66d';
      ctx.fillRect(-cr * 0.5, cy - cr * 0.2, cr * 0.25, cr * 0.3);
      ctx.fillRect(cr * 0.25, cy - cr * 0.2, cr * 0.25, cr * 0.3);
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-cr * 0.3, cy + cr * 0.35);
      ctx.lineTo(-cr * 1.3, cy + cr * 0.2);
      ctx.moveTo(cr * 0.3, cy + cr * 0.35);
      ctx.lineTo(cr * 1.3, cy + cr * 0.2);
      ctx.stroke();
      ctx.restore();
      void nx;
    }
    if (stun) {
      ctx.fillStyle = '#ffe66d';
      ctx.textAlign = 'center';
      ctx.font = `900 ${u(12)}px 'Orbitron', sans-serif`;
      ctx.fillText('STUNNED', b.x, y0 - u(10));
      for (let i = 0; i < 3; i++) {
        const a = time * 4 + (i * Math.PI * 2) / 3;
        ctx.fillText('*', b.x + Math.cos(a) * b.w * 0.35, y0 + Math.sin(a) * 6 - u(24));
      }
    }
    ctx.globalAlpha = 1;
  }
  // Name + HP bar at the top-center of the lane.
  // Just inside the top of the play lane, clear of the HUD; centred on the open lane (left of the board).
  const m = f.main;
  const cx = Math.max(W * 0.3, (m.x - m.w / 2) / 2);
  const barW = Math.min(W * 0.56, u(300), (m.x - m.w / 2) * 0.9);
  const bx = cx - barW / 2;
  const by = f.laneTop + u(26);
  ctx.textAlign = 'center';
  ctx.fillStyle = d.tint;
  const title = `THE BOARD: ${d.name}`;
  let size = u(14);
  ctx.font = `900 ${size}px 'Orbitron', sans-serif`;
  while (ctx.measureText(title).width > Math.max(barW, W * 0.6) && size > 8) {
    size -= 1;
    ctx.font = `900 ${size}px 'Orbitron', sans-serif`;
  }
  ctx.fillText(title, cx, by - u(11));
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(bx, by, barW, u(9));
  ctx.fillStyle = f.stunned ? '#ffe66d' : d.tint;
  ctx.fillRect(bx, by, (barW * f.hp) / f.maxHp, u(9));
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, barW, u(9));
  if (f.tauntT > 0 && f.taunt) {
    // Movie-trailer card: letterbox band, "IN A WORLD..." kicker, the list in a condensed serif.
    ctx.globalAlpha = Math.min(1, f.tauntT / 0.4, (3.6 - f.tauntT) / 0.3 + 0.2);
    const kicker = f.taunt.startsWith('IN A WORLD...') ? 'IN A WORLD...' : '';
    const body = kicker ? f.taunt.slice(kicker.length).trim() : f.taunt;
    const maxW = Math.max(barW, W * 0.62);
    let ts = u(14);
    const serif = "'Trajan Pro', 'Times New Roman', Georgia, serif";
    ctx.font = `700 ${ts}px ${serif}`;
    // wrap to at most 2 lines
    const words = body.split(' ');
    const lines = (): string[] => {
      const out: string[] = [];
      let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && cur) {
          out.push(cur);
          cur = w;
        } else cur = t;
      }
      if (cur) out.push(cur);
      return out;
    };
    let ls = lines();
    while ((ls.length > 2 || ls.some((l) => ctx.measureText(l).width > maxW)) && ts > 8) {
      ts -= 1;
      ctx.font = `700 ${ts}px ${serif}`;
      ls = lines();
    }
    const bandH = ts * (1.6 + ls.length * 1.25) + u(6);
    const bandY = by + u(16);
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(cx - maxW / 2 - u(10), bandY, maxW + u(20), bandH);
    ctx.fillStyle = '#000';
    ctx.fillRect(cx - maxW / 2 - u(10), bandY, maxW + u(20), 3);
    ctx.fillRect(cx - maxW / 2 - u(10), bandY + bandH - 3, maxW + u(20), 3);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8c25a';
    ctx.font = `700 ${Math.max(8, ts * 0.72)}px ${serif}`;
    ctx.fillText(kicker || 'COMING SOON', cx, bandY + ts * 1.15);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${ts}px ${serif}`;
    ls.forEach((l, i) => ctx.fillText(l, cx, bandY + ts * (2.35 + i * 1.25)));
  }
  ctx.restore();
}
