/**
 * THE BOSSES: a boss fight at the end of every tenth level (10, 20, ... 110) and a final one at
 * the end of level 111 (leading to VICTORY). Every boss is an original, maximally silly cartoon
 * character (see bossMime.ts and bossToons.ts; no scoreboards anywhere) with its own entrance,
 * attacks, weak spot, slapstick hit reactions and defeat gag, and is strictly harder than the
 * one before it: more HP,
 * faster volleys, more projectiles, faster shots, shorter stun, on the same diminishing-step
 * curve style as the gold zone. Every fight varies run to run (attack order, timings within
 * the boss's budget, weak-spot rows, stun-ring spots, taunts) from a seeded RNG, so a given
 * run seed replays identically.
 *
 * How you fight it: hold BOOST and your dogs bark (WOOF) straight ahead. Barks that hit the
 * glowing weak spot (each boss has its own: a golden horseshoe, a loose bolt, a fuse spark...)
 * do full damage; elsewhere on the body they only chip. Touch a ring to STUN the boss: while
 * stunned it stops firing and every bark is a critical hit. Beating a boss is a flat +1,000,000 points (see BOSS_BONUS). If a fight drags
 * past the boss's patience it gets BORED and leaves (no bonus, the run carries on).
 */
import { MODES, type ModeDef, type ModeStyle } from '../utils/modes';
import { mulberry32, shuffle, subSeed, type Rng } from '../utils/rng';
import { MAX_LEVEL } from '../utils/difficulty';
import { groceryTaunt } from './silly';
import { hasCjk, t as tr, tp } from '../i18n';
import { TOON_POPS, TOON_SKINS, drawMindShot, drawToon, drawToonShot, hasToon } from './bossToons';
import { drawMime, drawMimeShot } from './bossMime';

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
  | 'mind';

type Pattern = 'aimed' | 'spray' | 'wall' | 'mirror' | 'slam' | 'rain' | 'kick' | 'blink' | 'split' | 'homing' | 'behind' | 'dots' | 'buckles' | 'glitch' | 'static' | 'countdown' | 'lasso' | 'tumble' | 'chicken' | 'wave' | 'beam';

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
  // Level 10: MONSIEUR MIRROR, an original mime on a tiny tricycle (see bossMime.ts).
  mime: {
    signature: 'mirror',
    blurb: 'MONSIEUR MIRROR: a mime on a tiny tricycle who copies your moves upside down; cream pies, flying gloves, balloon animals; hand-mirror weak spot',
    patterns: ['mirror', 'aimed', 'spray'],
    taunts: ["I'M NOT COPYING YOU. YOU'RE COPYING ME.", 'ADJACENT TO GREATNESS.', 'MIRROR, MIRROR, ON THE BOARD.', 'NEXT DOOR AND NEXT LEVEL.'],
  },
  calvin: {
    signature: 'twins',
    blurb: 'THE NEIGHSAYERS: two stretchy-necked pantomime horses on parachutes; horseshoes, hay bales, carrots; golden-horseshoe weak spots, one shared health bar',
    patterns: ['aimed', 'wall', 'spray'],
    taunts: ['NEIGH. AND ALSO NAY.', "WE FINISH EACH OTHER'S HAY.", 'DOUBLE TROUBLE, QUADRUPLE HOOVES.', 'STABLE GENIUSES.'],
  },
  decoy: {
    signature: 'decoy',
    blurb: 'THE GREAT SHUFFLINI: a shell-game magician and his cardboard double who swap with a POOF; playing cards, doves, knotted hankies; rabbit-in-the-hat weak spot',
    patterns: ['aimed', 'spray', 'wall'],
    taunts: ['PICK A MAGICIAN. ANY MAGICIAN.', 'IS THIS YOUR CARD? NO? GOOD.', 'NOTHING UP MY SLEEVE. EXCEPT DOVES.', 'TA-DAA!'],
  },
  // Level 40: an ORIGINAL character boss (replaces the TOO FAT board; the TOO FAT mode stays).
  buckle: {
    signature: 'strut',
    blurb: 'BUCKLE BUSTER: bursts out of a cake; popping buckles, disco-ball struts, flying socks; the loose gold buckle is his weak spot',
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
    blurb: 'DEPUTY DO-OVER: an auditioning cowboy who swings in on a lasso; lasso loops, tumbleweeds, rubber-chicken quick-draw, bean cans; sheriff-badge-on-a-spring weak spot',
    patterns: ['lasso', 'tumble', 'chicken', 'aimed'],
    taunts: ['THANK YOU FOR AUDITIONING.', 'NEXT CHARACTER!', "WE'LL CALL YOU.", 'FROM THE TOP!'],
  },
  toosuccessful: {
    signature: 'coins',
    blurb: 'GOLDBOT 3000: a gold trophy robot on rocket boots; slanted coin rain, gold bars, money bags; loose-gold-bolt weak spot',
    patterns: ['rain', 'aimed', 'wall'],
    taunts: ['MONEY RAIN, BABY.', 'BEEP BOOP, I AM RICH.', 'MAKE IT RAIN.', 'GOLD LOOKS GOOD ON ME.'],
  },
  alw: {
    signature: 'chorus',
    blurb: 'MADAME CHANDELIERA: an opera-diva chandelier lowered on a chain with a chorus of masks; mask kick lines, rose walls, high notes; golden-mask weak spot',
    patterns: ['kick', 'wall', 'aimed'],
    taunts: ['FROM THE TOP, WITH FEELING.', 'CUE THE CHORUS.', 'LA LA LAAAAA!', 'THE CHANDELIER STAYS UP. FOR NOW.'],
  },
  slackerman: {
    signature: 'blink',
    blurb: 'THE LATE LATE GHOST: a bedsheet ghost in a recliner at the midnight movie; blinking popcorn (only the solid ones hurt), soda cups, film reels; golden-popcorn-tub weak spot',
    patterns: ['blink', 'spray', 'wall'],
    taunts: ["I'LL GET TO IT. MAYBE.", 'NOW YOU SEE ME.', 'SHHH, IT IS THE GOOD PART.', 'TOO COMFY TO TRY.'],
  },
  cbb: {
    signature: 'bang',
    blurb: 'CAPTAIN KABOOM: a clown on a cannon atop a drum tower, arrives in a tiny car; confetti bombs that burst into rubber ducks, whoopee cushions, inflatable flamingos; fuse-spark weak spot',
    patterns: ['split', 'aimed', 'wall'],
    taunts: ['KA-BOOM! KA-BOOM!', 'HONK IF YOU LOVE CANNONS.', 'YES AND... BOOM.', 'BIG BOOM ENERGY.'],
  },
  curry: {
    signature: 'vj',
    blurb: 'DJ CHANNEL ZAPP: an 80s VJ with a TV for a head; glitch bursts, channel-change static walls, cassette-tape drops, paper airplanes; golden-tuning-dial weak spot',
    patterns: ['glitch', 'static', 'countdown', 'homing'],
    taunts: ['IN THE MORNING!', 'STAY TUNED.', 'VALUE FOR VALUE.', 'BOOSTAGRAM INCOMING.'],
  },
  dvorak: {
    signature: 'behind',
    blurb: 'ANGEL CONTRARIEL: a grumpy contrarian cherub on a cloud; feathers from behind you, tiny harps, clouds; halo-gem weak spot',
    patterns: ['behind', 'aimed', 'wall'],
    taunts: ['WRONG. ALL OF IT.', 'I DISAGREE WITH YOUR DODGING.', 'LOOK BEHIND YOU.', 'HEAVENS, NO.'],
  },
  // Level 111: ULTRA CONSCIOUSNESS, the final boss (replaces THE GRAND CORKBOARD; see bossToons.ts).
  itm: {
    signature: 'mind',
    blurb: 'ULTRA CONSCIOUSNESS: a giant googly-eyed synthwave brain in a propeller thinking cap, floating on a neon sunset orb; thought-wave rings with a telegraphed safe gap, telegraphed psychic beams, lightbulb ideas, question-mark thought bubbles; golden "big idea" lightbulb weak spot',
    patterns: ['wave', 'beam', 'aimed', 'spray'],
    taunts: ['I KNOW WHAT YOU ARE THINKING.', 'BIG BRAIN TIME.', 'THINK FAST.', 'LEVEL 111 IS ALL IN YOUR HEAD.'],
  },
};

/** The fixed boss order: modes sorted by starting dog count (2-dog modes, then TOO FAT...ITM). */
const ORDER = ['mime', 'calvin', 'decoy', 'buckle', 'daly', 'toosuccessful', 'alw', 'slackerman', 'cbb', 'curry', 'dvorak', 'itm'];
export const BOSS_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, MAX_LEVEL];

/** Every boss is an original character (banner name, tint, style); the modes stay as modes. */
const CHARACTERS: Record<string, { name: string; tint: string; style: ModeStyle }> = {
  mime: { name: 'MONSIEUR MIRROR', tint: '#00f0ff', style: 'solid' },
  calvin: { name: 'THE NEIGHSAYERS', tint: '#ff7ac8', style: 'solid' },
  decoy: { name: 'THE GREAT SHUFFLINI', tint: '#b48cff', style: 'solid' },
  buckle: { name: 'BUCKLE BUSTER', tint: '#ff3b8d', style: 'solid' },
  daly: { name: 'DEPUTY DO-OVER', tint: '#ffb347', style: 'solid' },
  toosuccessful: { name: 'GOLDBOT 3000', tint: '#ffd23f', style: 'solid' },
  alw: { name: 'MADAME CHANDELIERA', tint: '#ff9ecf', style: 'solid' },
  slackerman: { name: 'THE LATE LATE GHOST', tint: '#b4c8ff', style: 'solid' },
  cbb: { name: 'CAPTAIN KABOOM', tint: '#ff5a5a', style: 'solid' },
  curry: { name: 'DJ CHANNEL ZAPP', tint: '#20e0d0', style: 'solid' },
  dvorak: { name: 'ANGEL CONTRARIEL', tint: '#fff2b0', style: 'solid' },
  itm: { name: 'ULTRA CONSCIOUSNESS', tint: '#ff5cf0', style: 'solid' },
};

export const BOSSES: readonly BossDef[] = ORDER.map((id, i) => {
  const m = MODES.find((x) => x.id === id) as ModeDef | undefined;
  const c = CHARACTERS[id];
  const s = SIG[id];
  return { level: BOSS_LEVELS[i], rank: i + 1, modeId: id, name: c?.name ?? m?.name ?? id, dogs: m?.ships ?? 0, tint: c?.tint ?? m?.tint ?? '#fff', style: c?.style ?? m?.style ?? 'solid', ...s };
});

/** Every boss is a character now: no scoreboard anywhere, banners use just the name. */
export function isCharacterBoss(def: BossDef): boolean {
  return def.signature === 'mirror' || hasToon(def.modeId);
}

/** Banner / HP-bar title (just the character's name). */
export function bossTitle(def: BossDef): string {
  return def.name;
}

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

/** Per-boss easing knobs (multipliers on the rank curve unless noted). */
export interface BossEase {
  hp?: number;
  fire?: number;
  volley?: number;
  /** Coin rain: sideways speed as a fraction of the fall speed, and extra coins per shower. */
  slant?: number;
  extra?: number;
  /** Fewer split shells per volley. */
  big?: number;
  /** Split shells burst part-way to the pack (at `burst` of the distance, default 0.4). */
  bang?: boolean;
  burst?: number;
  /** Weak-spot dwell multiplier (longer = more weak-spot uptime). */
  spot?: number;
  /** The weak spot hops at most this many slots at a time (shorter re-line). */
  near?: number;
  /** Stun-length multiplier. */
  stun?: number;
  /** Seconds the next weak-spot slot glows before the hop (telegraph). */
  tele?: number;
  /** Weak-spot hops are capped at about this many px (tall lanes only). */
  hopPx?: number;
  /** Cap on the lane-height shot-speed scale (tall portrait lanes scale shots up to 1.3x). */
  spdCap?: number;
  /** Wall/tack-storm gap at least this fraction of the lane. */
  gap?: number;
  /** Homing shots stop steering within this many px of the pack (dodge with a sidestep). */
  lock?: number;
  /** Stun rings turn up within this many px of the pack's height. */
  ringNear?: number;
  /** Stun-length multiplier on tall (portrait) lanes only. */
  tallStun?: number;
  /**
   * Real-time floors at high GAME SPEED, in wall-clock seconds: attack telegraphs, the weak-spot
   * hop telegraph and the weak-spot dwell never get shorter than this on screen (at 1.0 the
   * game-time values are longer, so nothing changes there).
   */
  realTele?: number;
  realSpot?: number;
  realDwell?: number;
  /** Real-time floor between volleys (wall-clock s) and cap on on-screen shot speed (px per wall-clock s). */
  realFire?: number;
  realShot?: number;
}

/**
 * Per-boss easing on top of the rank curve (Dan-approved, L60, L90 and L111 only; every other boss
 * uses the plain curve). TOO SUCCESSFUL: coin rain falls slanted (slant = sideways speed as a
 * fraction of the fall speed) with one more coin per shower to keep the pressure. COMEDY BANG
 * BANG: one BANG shell per volley instead of two or three, bursting about 40% of the way to the
 * pack into slightly slower pieces, plus less HP, a slower trigger and smaller aimed fans.
 *
 * L90 CAPTAIN KABOOM and L111 ULTRA CONSCIOUSNESS also get tall-lane (portrait) fixes, which
 * leave the short landscape lane as it was: the slot the weak spot is about to hop to twinkles
 * first (tele), hops stay short in pixels (hopPx), stun rings turn up within reach of the pack
 * (ringNear). The brain's shots also don't speed up for the tall lane (spdCap) and it stays
 * dizzy 5% longer there (tallStun), as the corkboard it replaces did. Its signature attacks are
 * telegraphed by design (thought waves show their safe gap, psychic beams show their lane, and
 * neither overlaps another volley), and at high GAME SPEED every telegraph and the weak-spot
 * dwell keep a wall-clock floor (realTele / realSpot / realDwell) so they stay readable at 11.1.
 * HP, fire rate and volleys are the plain rank-12 curve, so it stays the hardest fight.
 */
export const EASE: Record<string, BossEase> = {
  toosuccessful: { slant: 0.4, extra: 1 },
  cbb: { hp: 0.8, fire: 1.3, volley: 0.75, big: 1, bang: true, tele: 0.5, hopPx: 230, ringNear: 380 },
  itm: { tele: 0.6, hopPx: 120, ringNear: 130, spdCap: 0.8, tallStun: 1.05, realTele: 0.5, realSpot: 0.35, realDwell: 0.9, realFire: 0.4, realShot: 1200 },
};
const easeOf = (id: string): BossEase => EASE[id] ?? {};

/** The rank curve plus this boss's easing (used by the fight). */
export function easedTuning(def: BossDef): BossTuning {
  const t = bossTuning(def.rank);
  const e = easeOf(def.modeId);
  return {
    ...t,
    hp: Math.round(t.hp * (e.hp ?? 1)),
    fireEvery: +(t.fireEvery * (e.fire ?? 1)).toFixed(3),
    volley: +(t.volley * (e.volley ?? 1)).toFixed(2),
    spotEvery: +(t.spotEvery * (e.spot ?? 1)).toFixed(2),
    stun: +(t.stun * (e.stun ?? 1)).toFixed(2),
  };
}

export interface BossShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  kind: 'orb' | 'dot' | 'coin' | 'pie' | 'glove' | 'balloon' | 'blink' | 'split' | 'homing' | 'warn' | 'buckle' | 'num' | 'static' | 'glitch' | 'tumble' | 'chicken' | 'lasso' | 'wave' | 'beam';
  /** Visual-only costume (horseshoe, rubber duck, cassette...): physics and hit radius unchanged. */
  skin?: string;
  /** Homing shot that has lost its lock (flies straight on). */
  lost?: boolean;
  /** BANG BANG: shot age (s) at which a big shot bursts into three. */
  burst?: number;
  /**
   * ULTRA CONSCIOUSNESS thought wave: a ring expanding from (x, y) at `vr` px/s (radius `rad`,
   * half thickness `r`) over the left half-plane, broken by a safe corridor: the band of heights
   * gy +- gh/2 (px), at any distance, so a pack anywhere in that band is never hit however wide
   * the swarm is. It is harmless while t < 0 (the telegraph), and `tele` is that telegraph's
   * length. gx: the pack's column as aimed (where the telegraph brackets the corridor).
   * Psychic beam: a band from x = 0 to x at height y (half height r), harmless while t < 0.
   */
  rad?: number;
  vr?: number;
  gx?: number;
  gy?: number;
  gh?: number;
  tele?: number;
  /** A wave / beam that already hit something: still drawn (dim), no longer harmful. */
  spent?: boolean;
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
  | { type: 'gone' }
  | { type: 'pop'; text: string; x: number; y: number; sfx: PopSfx };

export type PopSfx = 'honk' | 'boing' | 'whistleUp' | 'whistleDown';

/** Comic text burst ("BONK!") drawn by the boss. */
export interface Pop {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
}

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
  /** Keep the boss left of this x (the touch controls on sideways screens); defaults to W. */
  right?: number;
  /** GAME SPEED multiplier (1 = normal; dt is already scaled by it). Used for real-time floors. */
  speed?: number;
}

const BARK_EVERY = 0.2;
const BARK_SPEED = 760;
const ENTER_S = 1.6;
const EXIT_S = 2.6;

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
  stateT = 0;
  /** Entrance / exit lengths, s (the tricycle mime makes a longer entrance and a slow deflate). */
  readonly enterS: number;
  readonly exitS: number;
  /** Comic text bursts on screen. */
  pops: Pop[] = [];
  private popCd = 0;
  private rng: Rng;
  private fxRng: Rng;
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
  /** Right edge the boss keeps clear of (touch controls), and its resting left edge. */
  private right = 0;
  restLeft = 0;
  private enterSfx = 0;
  /** Bottom of the start banner (set by the game) and the latched taunt-card top. */
  bannerBottom = 0;
  /** Bottom / centre / width of the name + HP header (set when drawn). */
  headerBottom = 0;
  headerX = 0;
  headerW = 0;
  cardTop = 0;
  cardFor = '';
  /** On-screen touch controls (logical rects, set by the game) the taunt card keeps clear of. */
  controls: { x: number; y: number; w: number; h: number }[] = [];
  /** The taunt card is waiting for the start banner to clear (short sideways screens). */
  tauntHold = false;

  /** Slapstick hit reaction timer (mustache droop, wobble), s. */
  hurtT = 0;
  /** Cowboy: hat over the eyes / tangled in his own lasso, s. */
  hatT = 0;
  tangleT = 0;
  /** Local player-history jabs folded into the grocery-list taunts. */
  jabs: string[] = [];
  /** GAME SPEED multiplier from the last update (real-time floors, see BossEase.realTele). */
  private speed = 1;

  constructor(def: BossDef, runSeed: number, jabs: string[] = []) {
    this.jabs = jabs;
    this.def = def;
    this.tune = easedTuning(def);
    this.seed = subSeed(runSeed, def.level);
    this.rng = mulberry32(this.seed);
    this.fxRng = mulberry32(this.seed ^ 0x5eed);
    this.enterS = def.signature === 'mirror' ? 3 : ENTER_S;
    this.exitS = def.signature === 'mirror' ? 2.4 : EXIT_S;
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

  /** The play lane (top / bottom, px) as of the last update, for drawing lane-wide telegraphs. */
  get lane(): { top: number; bottom: number } {
    return { top: this.top, bottom: this.bottom };
  }

  /** A telegraph length (game s) with this boss's wall-clock floor at high GAME SPEED. */
  private teleFor(base: number): number {
    return Math.max(base, (easeOf(this.def.modeId).realTele ?? 0) * this.speed);
  }

  /** Shot speed (game px/s) capped so it never looks faster than realShot px/s on screen. */
  private capSpeed(v: number): number {
    const cap = easeOf(this.def.modeId).realShot ?? 0;
    return cap > 0 ? Math.min(v, cap / this.speed) : v;
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
    // Tall (portrait) lanes: the pack travels further between rings, so the eased bosses stay
    // dizzy a little longer there.
    const tall = this.bottom - this.top > 500 ? easeOf(this.def.modeId).tallStun ?? 1 : 1;
    this.stunT = this.tune.stun * tall;
    this.stunImmune = this.stunT + 1.5;
    this.shots.length = 0;
    this.slam = 0;
    this.events.push({ type: 'stunned' });
    if (isCharacterBoss(this.def)) this.addPop(TOON_POPS[this.def.modeId]?.stun ?? 'BOING!', this.main.x, this.main.y - this.main.h * 0.3, 'boing', '#7fffff');
    return true;
  }

  /** A random slapstick burst on a weak-spot hit (throttled so the screen stays readable). */
  private comicPop(x: number, y: number): void {
    const words: [string, PopSfx][] = TOON_POPS[this.def.modeId]?.hit ?? [['BONK!', 'honk'], ['BOING!', 'boing'], ['HONK!', 'honk'], ['SPLAT!', 'boing']];
    // Cosmetic picks use their own RNG so the seeded fight (spots, volleys, timings) replays exactly
    // as before the cartoon redesign (the mime keeps the fight RNG, as shipped).
    const pick = this.def.signature === 'mirror' ? this.rng() : this.fxRng();
    const [text, sfx] = words[Math.floor(pick * words.length)];
    this.addPop(text, x, y - 18, sfx, '#ffe14d');
  }

  private addPop(text: string, x: number, y: number, sfx: PopSfx, color: string): void {
    this.popCd = 0.7;
    this.pops.push({ text: tp(text), x, y, t: 0, color });
    this.events.push({ type: 'pop', text, x, y, sfx });
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
    i.bob += dt * (sig === 'strut' ? 0.8 : this.def.modeId === 'slackerman' ? 0.8 : 1.1);
    const margin = Math.max(14, this.W * 0.035);
    // Stay clear of the touch controls on sideways screens (Game passes their left edge).
    let x = this.right - margin - w / 2;
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
    // A little personality in how each one moves (vertical ranges stay the same).
    const id = this.def.modeId;
    if (id === 'daly') y -= Math.abs(Math.sin(i.bob * 4)) * Math.min(amp * 0.1, 10);
    else if (id === 'curry') y += Math.sin(i.bob * 23) * 2;
    else if (id === 'alw') x -= (1 + Math.sin(i.bob * 0.7)) * w * 0.12;
    else if (id === 'dvorak') x -= (1 + Math.sin(i.bob * 2)) * w * 0.1;
    y = Math.min(this.bottom - h / 2, Math.max(this.top + h / 2, y));
    // Leftmost reach at rest (weak-spot props stick out past the box; the mime's mirror most).
    const sway = id === 'alw' ? w * 0.24 : id === 'dvorak' ? w * 0.2 : 0;
    this.restLeft = this.right - margin - w - sway - Math.max(24, w * (sig === 'mirror' ? 0.75 : 0.45));
    if (sig === 'strut' && this.slam > 0) x -= this.slam * (this.W * 0.42);
    i.x = x + this.slideX * (this.W - x + w);
    if (sig === 'mirror' && this.state === 'enter') {
      // MONSIEUR MIRROR pedals in from the LEFT on his tiny tricycle, right across the lane,
      // and skids to a stop at his spot (he can't hurt anyone until the fight starts).
      const e = Math.min(1, this.stateT / (this.enterS * 0.8));
      const k = 1 - (1 - e) * (1 - e);
      i.x = -w + (x + w) * k;
    }
    i.y = y;
  }

  update(inp: BossInput): void {
    const { dt } = inp;
    this.W = inp.W;
    this.right = Math.min(inp.W, inp.right ?? inp.W);
    this.top = inp.top;
    this.bottom = inp.bottom;
    this.speed = Math.max(1, inp.speed ?? 1);
    const realFloors = (easeOf(this.def.modeId).realTele ?? 0) > 0;
    this.stateT += dt;
    // (Real-time-floored bosses keep the taunt card up for its wall-clock time at any GAME SPEED.)
    const tdt = realFloors ? dt / this.speed : dt;
    if (this.tauntT > 0 && !this.tauntHold) this.tauntT = Math.max(0, this.tauntT - tdt);

    if (this.state === 'enter') {
      // Character entrances are animated in the drawing (parachutes, cakes, clown cars...).
      this.slideX = isCharacterBoss(this.def) ? 0 : Math.max(0, 1 - this.stateT / (this.enterS * 0.8));
      if (this.stateT >= this.enterS) {
        this.state = 'fight';
        this.stateT = 0;
        this.slideX = 0;
      }
    } else if (this.state === 'defeated' || this.state === 'bored') {
      // The mime deflates in place (drawn), everyone else slides off.
      this.slideX = isCharacterBoss(this.def) && this.state === 'defeated' ? 0 : Math.min(1, this.stateT / this.exitS);
      if (this.stateT >= this.exitS) {
        this.state = 'gone';
        this.events.push({ type: 'gone' });
      }
    }
    this.boards.forEach((b, i) => this.layout(b, i, this.stunT > 0 ? dt * 0.25 : dt, inp.py));
    this.popCd = Math.max(0, this.popCd - dt);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.8);
    if (this.state === 'enter' && hasToon(this.def.modeId)) {
      // One whistle as it arrives and a BOING as it lands (the drawing does the visual gag).
      if (this.enterSfx === 0 && this.stateT > 0.1) {
        this.enterSfx = 1;
        this.events.push({ type: 'pop', text: '', x: this.main.x, y: this.main.y, sfx: 'whistleDown' });
      } else if (this.enterSfx === 1 && this.stateT > this.enterS * 0.7) {
        this.enterSfx = 2;
        this.events.push({ type: 'pop', text: '', x: this.main.x, y: this.main.y, sfx: 'boing' });
      }
    } else if (this.state === 'enter' && isCharacterBoss(this.def) && this.stateT > 0.2 && this.popCd <= 0) {
      this.popCd = 0.9;
      this.pops.push({ text: 'HONK!', x: Math.max(60, Math.min(this.main.x, this.W - 60)), y: this.main.y + this.main.h * 0.25, t: 0, color: '#ffcc00' });
      this.events.push({ type: 'pop', text: 'HONK!', x: this.main.x, y: this.main.y, sfx: 'honk' });
    }
    this.updateShots(inp);
    if (this.state !== 'fight') return;

    this.t += dt;
    if (this.t >= this.tune.bored) {
      this.state = 'bored';
      this.stateT = 0;
      this.endT = this.t;
      this.shots.length = 0;
      this.sayTaunt(tr('taunt_bored'));
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
        if (isCharacterBoss(this.def) && onSpot && this.popCd <= 0) this.comicPop(k.x, k.y);
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
      this.tauntT = 0;
      this.events.push({ type: 'defeated' });
      if (isCharacterBoss(this.def)) this.events.push({ type: 'pop', text: '', x: this.main.x, y: this.main.y, sfx: 'whistleDown' });
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
    const ezs = easeOf(this.def.modeId);
    const tele = Math.max(ezs.tele ?? 0, (ezs.realSpot ?? 0) * this.speed * ((ezs.tele ?? 0) > 0 ? 1 : 0));
    if (tele > 0 && this.spotT <= tele && !this.nextSpots) this.nextSpots = this.boards.map((b) => this.pickSpot(b));
    if (this.spotT <= 0) {
      this.spotT = this.tune.spotEvery * (0.75 + this.rng() * 0.5);
      // High GAME SPEED: the weak spot stays put at least realDwell wall-clock seconds.
      if (ezs.realDwell) this.spotT = Math.max(this.spotT, ezs.realDwell * this.speed);
      this.boards.forEach((b, i) => (b.spot = this.nextSpots ? this.nextSpots[i] : this.pickSpot(b)));
      this.nextSpots = null;
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
      const rn = easeOf(this.def.modeId).ringNear ?? 0;
      let y = this.top + 60 + this.rng() * Math.max(10, this.bottom - this.top - 120);
      // Tall lanes: the ring turns up within reach of the pack (not 800 px away).
      if (rn > 0 && this.bottom - this.top > rn * 2 + 120) y = Math.min(this.bottom - 60, Math.max(this.top + 60, inp.py + ((y - this.top - 60) / Math.max(10, this.bottom - this.top - 120) - 0.5) * 2 * rn));
      this.events.push({ type: 'ring', x: this.right * (0.62 + this.rng() * 0.12), y });
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
      // High GAME SPEED: no more than one volley per realFire wall-clock seconds.
      const rf = easeOf(this.def.modeId).realFire ?? 0;
      if (rf > 0) this.fireT = Math.max(this.fireT, rf * this.speed);
      this.fire(this.nextPattern(), inp);
    }
  }

  /** Telegraphed next weak-spot slot per boss body (null when no hop is coming up). */
  nextSpots: number[] | null = null;

  /** Where the weak spot hops next: any other slot, or (eased bosses) a nearby one. */
  private pickSpot(b: Board): number {
    const ez = easeOf(this.def.modeId);
    let near = ez.near ?? 0;
    // Hop at most about hopPx (tall portrait lanes): a long hop is mostly travel, not aiming.
    if (ez.hopPx && b.h > 0) {
      const byPx = Math.max(1, Math.floor(ez.hopPx / (b.h / b.rows)));
      if (byPx < b.rows - 1) near = near > 0 ? Math.min(near, byPx) : byPx;
    }
    if (near > 0) {
      const opts: number[] = [];
      for (let r = Math.max(0, b.spot - near); r <= Math.min(b.rows - 1, b.spot + near); r++) if (r !== b.spot) opts.push(r);
      return opts[Math.floor(this.rng() * opts.length)];
    }
    const r = Math.floor(this.rng() * (b.rows - 1));
    return r >= b.spot ? r + 1 : r;
  }

  private volleyCount(): number {
    const v = this.tune.volley + (this.phase - 1);
    return Math.max(1, Math.floor(v + this.rng()));
  }

  private pattern: Pattern = 'aimed';

  private shot(x: number, y: number, vx: number, vy: number, r: number, kind: BossShot['kind'], life = 6): void {
    if (this.def.signature === 'mirror' && kind === 'orb') kind = this.pattern === 'mirror' ? 'pie' : this.pattern === 'spray' ? 'balloon' : 'glove';
    const skin = TOON_SKINS[this.def.modeId]?.[this.pattern];
    this.shots.push({ x, y, vx, vy, r, kind, t: 0, life, alive: true, skin });
  }

  private fire(p: Pattern, inp: BossInput): void {
    this.pattern = p;
    const laneH = this.bottom - this.top;
    const ez = easeOf(this.def.modeId);
    const sp = this.capSpeed(this.tune.shotSpeed * Math.max(0.75, Math.min(ez.spdCap ?? 1.3, laneH / 420)));
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
        const gap = Math.min(laneH * 0.62, Math.max(inp.packH + 56, 120, laneH * (ez.gap ?? 0)));
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
        // Coins take about the same time to fall on every screen shape, and fall slanted (wind-blown)
        // toward a spot around the pack's height, so each one crosses the pack's line in about half
        // a second. On a tall portrait lane the old slow, nearly vertical fall hung coins over the
        // pack for 4+ s: a curtain over the top of the lane that kept the dogs away from the upper
        // rank slots (the weak spot) and doubled the fight.
        const fall = Math.max(sp * 0.5, laneH / 2.3);
        const slant = easeOf(this.def.modeId).slant ?? 0.5;
        for (let i = 0; i < n + (easeOf(this.def.modeId).extra ?? 0); i++) {
          const xl = inp.px - 40 + this.rng() * (this.W * 0.55);
          const y0 = this.top - r - this.rng() * 90;
          this.shot(xl + slant * (inp.py - y0), y0, -fall * slant, fall, r, 'coin');
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
        const k = Math.max(1, Math.ceil(n / 3) - (easeOf(this.def.modeId).big ?? 0));
        // COMEDY BANG BANG: burst about 40% of the way to the pack (never later than 0.65 s), so the
        // three pieces have room to fan out; on a narrow lane a fixed 0.65 s burst went off point-blank.
        const burst = ez.bang ? Math.max(0.3, Math.min(ez.burst ? 1.4 : 0.65, ((ez.burst ?? 0.4) * Math.hypot(inp.px - ox, inp.py - oy)) / (sp * 0.7))) : 0.65;
        for (let i = 0; i < k; i++) {
          const a = Math.atan2(inp.py - oy, inp.px - ox) + (i - (k - 1) / 2) * 0.35 + jit();
          const s = this.shots.length;
          this.shot(ox, oy, Math.cos(a) * sp * 0.7, Math.sin(a) * sp * 0.7, r * 1.7, 'split');
          this.shots[s].burst = burst;
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
          this.events.push({ type: 'taunt', text: tr('taunt_lasso') });
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
        // Music-video drop: cassette tapes fall from the top in a staggered line (no digits).
        const k = Math.max(2, n);
        for (let i = 0; i < k; i++) {
          this.shot(inp.px - 30 + this.rng() * this.W * 0.5, this.top - r - i * 40, -sp * 0.1, sp * 0.48, r * 1.2, 'num');
        }
        break;
      }
      case 'wave': {
        // ULTRA CONSCIOUSNESS, signature: a THOUGHT WAVE. The brain charges (telegraph: the ring's
        // path is drawn dashed, its safe corridor shaded and bracketed), then a neon ring expands
        // over the whole lane, broken by one safe corridor (a band of heights, so it fits the
        // whole swarm at any distance; it is always the pack + 70 px tall at least). It is
        // placed within easy reach (never more than ~170 px away) and no other volley is fired
        // until the ring has passed the pack. Phase 2 sends a second ring through the same gap,
        // phase 3 shifts the second gap a little (the two gaps always overlap by the pack + 24 px).
        const tele = this.teleFor(0.9);
        const vr = sp * 0.95;
        const th = Math.max(9, r * 1.15);
        const gh = Math.min(laneH * 0.6, Math.max(inp.packH + 70, 130, laneH * 0.28));
        const reach = Math.min(laneH * 0.35, 170);
        const lo = this.top + gh / 2;
        const hi = Math.max(lo, this.bottom - gh / 2);
        const cl = (y: number) => Math.max(lo, Math.min(hi, y));
        const dir = this.rng() < 0.5 ? -1 : 1;
        const off = (0.5 + 0.5 * this.rng()) * reach;
        let gy0 = inp.py + dir * off;
        if (gy0 < lo || gy0 > hi) gy0 = inp.py - dir * off;
        gy0 = cl(gy0);
        const k = this.phase >= 2 ? 2 : 1;
        const shift = this.phase >= 3 ? (this.rng() < 0.5 ? -1 : 1) * Math.max(0, Math.min(gh * 0.45, gh - inp.packH - 24)) : 0;
        const colX = Math.min(inp.px, ox - 40);
        const far = Math.max(Math.hypot(ox, oy - this.top), Math.hypot(ox, this.bottom - oy)) + th;
        for (let i = 0; i < k; i++) {
          const gy = i === 1 ? cl(gy0 + shift) : gy0;
          const delay = i * 0.55;
          this.shots.push({ x: ox, y: oy, vx: 0, vy: 0, r: th, kind: 'wave', t: -(tele + delay), life: tele + delay + far / vr, alive: true, rad: 0, vr, gx: colX, gy, gh, tele: tele + delay });
        }
        const D = Math.hypot(ox - colX, oy - gy0);
        this.fireT = Math.max(this.fireT, tele + (k - 1) * 0.55 + (0.75 * D) / vr + 0.3);
        break;
      }
      case 'beam': {
        // PSYCHIC BEAMS: lanes across the screen, telegraphed (a flickering guide line and a
        // warning at the left edge) for 0.85 s, then a 0.45 s beam. One beam on the pack's height,
        // plus one more per phase; beams always leave a gap of the pack + 60 px between them.
        const tele = this.teleFor(0.85);
        const hr = Math.max(12, laneH * 0.04);
        const k = Math.min(3, this.phase);
        const minSep = 2 * hr + inp.packH + 60;
        const ys = [Math.max(this.top + hr, Math.min(this.bottom - hr, inp.py))];
        for (let tries = 0; ys.length < k && tries < 12; tries++) {
          const y = this.top + hr + this.rng() * Math.max(1, laneH - 2 * hr);
          if (ys.every((q) => Math.abs(q - y) >= minSep)) ys.push(y);
        }
        for (const y of ys) this.shots.push({ x: ox, y, vx: 0, vy: 0, r: hr, kind: 'beam', t: -tele, life: tele + 0.45, alive: true, tele });
        this.fireT = Math.max(this.fireT, tele + 0.7);
        break;
      }
      case 'dots': {
        const k = n * 3;
        const gap = Math.min(laneH * 0.55, Math.max(inp.packH + 56, 120, laneH * (ez.gap ?? 0)));
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
      if (!s.alive) {
        // A thought wave / beam that hit the pack (or a clone) is spent, not gone: it carries on
        // across the screen, drawn dim and harmless (one hit per wave or beam, like a shot).
        if ((s.kind === 'wave' || s.kind === 'beam') && s.life > 0 && !s.spent) {
          s.alive = true;
          s.spent = true;
        } else continue;
      }
      s.t += dt;
      s.life -= dt;
      if (s.kind === 'wave' || s.kind === 'beam') {
        if (s.kind === 'wave') s.rad = Math.max(0, s.t) * (s.vr ?? 0);
        if (s.life <= 0) s.alive = false;
        continue;
      }
      if (s.kind === 'split' && s.t >= (s.burst ?? 0.65)) {
        s.alive = false;
        const ps = easeOf(this.def.modeId).bang ? sp * 0.85 : sp;
        for (let i = -1; i <= 1; i++) {
          const a = Math.atan2(s.vy, s.vx) + i * 0.45;
          add.push({ x: s.x, y: s.y, vx: Math.cos(a) * ps, vy: Math.sin(a) * ps, r: s.r * 0.6, kind: 'orb', t: 0, life: 5, alive: true, skin: TOON_SKINS[this.def.modeId]?.['>split'] });
        }
        continue;
      }
      if (s.kind === 'warn' && s.life <= 0) {
        s.alive = false;
        add.push({ x: -s.r, y: s.y, vx: sp * 0.65, vy: 0, r: s.r, kind: 'orb', t: 0, life: 6, alive: true, skin: TOON_SKINS[this.def.modeId]?.['>warn'] });
        continue;
      }
      if (s.kind === 'homing' && !s.lost) {
        const lock = easeOf(this.def.modeId).lock ?? 0;
        if (lock > 0 && Math.hypot(inp.px - s.x, inp.py - s.y) < lock) s.lost = true;
      }
      if (s.kind === 'homing' && !s.lost) {
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
    if (!s.alive || s.kind === 'warn' || s.spent) return false;
    if ((s.kind === 'dot' || s.kind === 'glitch' || s.kind === 'wave' || s.kind === 'beam') && s.t < 0) return false;
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
    if (s.kind === 'wave') return waveHits(s, x, y, w, h);
    if (s.kind === 'beam') return x < s.x && Math.abs(y + h / 2 - s.y) < s.r * 0.85 + h / 2;
    const qx = Math.max(x, Math.min(s.x, x + w));
    const qy = Math.max(y, Math.min(s.y, y + h));
    const dx = s.x - qx;
    const dy = s.y - qy;
    return dx * dx + dy * dy <= s.r * s.r;
  }
}

/**
 * Thought wave vs a box: the box touches the ring band (radius rad +- r about the origin, left
 * half-plane only) and is not wholly inside the safe corridor (heights gy +- gh/2).
 */
export function waveHits(s: BossShot, x: number, y: number, w: number, h: number): boolean {
  const rad = s.rad ?? 0;
  if (x >= s.x) return false;
  const gy = s.gy ?? 0;
  const gh = s.gh ?? 0;
  if (y >= gy - gh / 2 && y + h <= gy + gh / 2) return false;
  const nx = Math.max(x, Math.min(s.x, x + w));
  const ny = Math.max(y, Math.min(s.y, y + h));
  const dmin = Math.hypot(s.x - nx, s.y - ny);
  const dmax = Math.hypot(Math.max(Math.abs(s.x - x), Math.abs(s.x - x - w)), Math.max(Math.abs(s.y - y), Math.abs(s.y - y - h)));
  if (dmax < rad - s.r || dmin > rad + s.r) return false;
  // The part of the box outside the corridor must touch the ring itself (not just its bounding
  // annulus through the corridor): test the box clipped to above / below the corridor.
  for (const [y0, y1] of [[y, Math.min(y + h, gy - gh / 2)], [Math.max(y, gy + gh / 2), y + h]]) {
    if (y1 <= y0) continue;
    const qx = Math.max(x, Math.min(s.x, x + w));
    const qy = Math.max(y0, Math.min(s.y, y1));
    const lo = Math.hypot(s.x - qx, s.y - qy);
    const hi = Math.hypot(Math.max(Math.abs(s.x - x), Math.abs(s.x - x - w)), Math.max(Math.abs(s.y - y0), Math.abs(s.y - y1)));
    if (hi >= rad - s.r && lo <= rad + s.r) return true;
  }
  return false;
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

/** Draw the boss (characters, weak spots, shots, barks, name + HP bar, taunt card). */
export function drawBoss(ctx: CanvasRenderingContext2D, f: BossFight, W: number, u: (n: number) => number, lite: boolean, time: number): void {
  const d = f.def;
  ctx.save();
  // Shots under the boards.
  for (const s of f.shots) {
    if (!s.alive) continue;
    if (drawMindShot(ctx, f, s, W, u, time, lite)) continue;
    if (drawMimeShot(ctx, s)) continue;
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
    if (drawToonShot(ctx, s, BossFight.harmful(s), time)) continue;
    if (s.kind === 'num' || s.kind === 'chicken' || s.kind === 'buckle' || s.kind === 'static' || s.kind === 'glitch' || s.kind === 'tumble' || s.kind === 'lasso') {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (s.kind === 'num') {
        // (a cassette tape, never a digit)
        ctx.fillStyle = '#222';
        ctx.fillRect(-s.r * 1.2, -s.r * 0.75, s.r * 2.4, s.r * 1.5);
        ctx.strokeStyle = '#7fffff';
        ctx.strokeRect(-s.r * 1.2, -s.r * 0.75, s.r * 2.4, s.r * 1.5);
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

  f.boards.forEach((b, idx) => {
    if (d.signature === 'mirror') drawMime(ctx, f, b, time);
    else drawToon(ctx, f, b, idx, time, W);
    // Telegraph: the slot the weak spot is about to hop to twinkles (eased bosses only).
    const nx = f.nextSpots?.[idx];
    if (nx !== undefined && f.state === 'fight' && !f.stunned) {
      const rowH = b.h / b.rows;
      const ny = b.y - b.h / 2 + rowH * (nx + 0.5);
      const pulse = 0.5 + 0.5 * Math.sin(time * 18);
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.18 * pulse;
      ctx.fillStyle = '#ffe14d';
      ctx.fillRect(b.x - b.w / 2, ny - rowH * 0.32, b.w, rowH * 0.64);
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      const sx = b.x - b.w / 2 - u(10);
      const sr = u(7) * (0.8 + 0.4 * pulse);
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + time * 3;
        const rr = k % 2 ? sr * 0.35 : sr;
        ctx.lineTo(sx + Math.cos(a) * rr, ny + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });
  // Comic text bursts (BONK! BOING! HONK!): pop in big, then float up and fade.
  for (const p of f.pops) {
    const k = p.t / 0.8;
    const sc = k < 0.15 ? 0.5 + (k / 0.15) * 0.8 : 1.3 - (k - 0.15) * 0.4;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    ctx.font = `900 ${u(18)}px 'Orbitron', sans-serif`;
    // keep the burst on screen (long words near the right edge)
    const half = (ctx.measureText(p.text).width * 1.3) / 2;
    ctx.translate(Math.max(half + 4, Math.min(W - half - 4, p.x)), p.y - k * 30);
    ctx.rotate(-0.12);
    ctx.scale(sc, sc);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#140022';
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
  // Name + HP bar at the top of the lane, centred on the open lane left of the boss (clear of
  // the HUD and of the touch controls); the taunt card and the start banner stack below it.
  const safeL = u(10);
  const safeR = Math.max(W * 0.45, Math.min(W - u(10), f.restLeft - u(8)));
  const cx = (safeL + safeR) / 2;
  const barW = Math.min(u(300), safeR - safeL - u(20));
  const bx = cx - barW / 2;
  const by = f.laneTop + u(26);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = d.tint;
  const title = bossTitle(d);
  let size = u(14);
  ctx.font = `900 ${size}px 'Orbitron', sans-serif`;
  while (ctx.measureText(title).width > safeR - safeL - u(8) && size > 8) {
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
  const firstFrame = f.headerBottom <= 0;
  f.headerBottom = by + u(9);
  f.headerX = cx;
  f.headerW = safeR - safeL;
  if (f.tauntT > 0 && f.taunt && !firstFrame) {
    // Movie-trailer card: letterbox band, "IN A WORLD..." kicker, the list in a condensed serif.
    // Wrapped and sized to fit inside the safe area between the left edge and the boss, below the
    // name, the HP bar and any banner, and beside (never under) the on-screen touch controls.
    ctx.globalAlpha = Math.min(1, f.tauntT / 0.4, (3.6 - f.tauntT) / 0.3 + 0.2);
    const kickerText = tr('taunt_kicker');
    const kicker = f.taunt.startsWith(kickerText) ? kickerText : '';
    const body = kicker ? f.taunt.slice(kicker.length).trim() : f.taunt;
    const pad = u(10);
    const serif = "'Trajan Pro', 'Times New Roman', Georgia, serif";
    const words = body.split(' ');
    // Chinese has no spaces: wrap between characters (closing punctuation stays on its line, an
    // opening bracket stays with the next character). `glue[i]` is the text put before token i.
    let glue: string[] | null = null;
    if (hasCjk(body)) {
      const toks: string[] = [];
      glue = [];
      for (const w of words) {
        const parts = w.match(/[（「『“(]*[\u2E80-\u9FFF\uF900-\uFAFF][。，、！？：；）」』”…)]*|[（「『“(]*[^\u2E80-\u9FFF\uF900-\uFAFF（「『“]+/g) ?? [w];
        parts.forEach((p, i) => {
          glue!.push(i === 0 ? ' ' : '');
          toks.push(p);
        });
      }
      words.splice(0, words.length, ...toks);
    }
    const fit = (L: number, R: number, minTs: number): { ts: number; ls: string[]; bandH: number } => {
      const maxW = Math.max(60, R - L - pad * 2);
      let ts = u(14);
      ctx.font = `700 ${ts}px ${serif}`;
      const lines = (): string[] => {
        const out: string[] = [];
        let cur = '';
        for (let i = 0; i < words.length; i++) {
          const w = words[i];
          const t = cur ? cur + (glue ? glue[i] : ' ') + w : w;
          if (ctx.measureText(t).width > maxW && cur) {
            out.push(cur);
            cur = w;
          } else cur = t;
        }
        if (cur) out.push(cur);
        return out;
      };
      let ls = lines();
      while ((ls.length > 3 || ls.some((l) => ctx.measureText(l).width > maxW)) && ts > minTs) {
        ts -= 1;
        ctx.font = `700 ${ts}px ${serif}`;
        ls = lines();
      }
      return { ts, ls, bandH: ts * (1.6 + ls.length * 1.25) + u(6) };
    };
    if (f.cardFor !== f.taunt) {
      f.cardFor = f.taunt;
      f.cardTop = by + u(16);
    }
    // Pushed down (never back up) when a banner appears above it.
    f.cardTop = Math.max(f.cardTop, by + u(16), f.bannerBottom + u(6));
    const bandY = f.cardTop;
    // Full width if it fits above any control it would reach (a smaller font if need be), else
    // beside the control; on a short sideways screen it waits for the banner to clear instead of
    // shrinking to an unreadable size.
    const hits = (L: number, R: number, h: number) => f.controls.filter((c) => !(c.y > bandY + h || c.y + c.h < bandY || c.x > R || c.x + c.w < L));
    let L = safeL;
    let R = safeR;
    let lay = fit(L, R, 9);
    if (hits(L, R, lay.bandH).length) {
      let best: { ts: number; ls: string[]; bandH: number } | null = null;
      for (let m = u(14); m >= u(10) && !best; m -= 1) {
        const t = fit(L, R, m);
        if (t.ts >= m && !hits(L, R, t.bandH).length) best = t;
      }
      if (best) lay = best;
      else {
        for (const c of hits(L, R, lay.bandH)) {
          if (c.x + c.w / 2 < (L + R) / 2) L = Math.max(L, c.x + c.w + u(6));
          else R = Math.min(R, c.x - u(6));
        }
        lay = fit(L, R, 9);
      }
    }
    f.tauntHold = lay.ts < u(11) && f.bannerBottom > 0;
    if (f.tauntHold) {
      f.cardTop = by + u(16);
      ctx.restore();
      return;
    }
    const { ts, ls, bandH } = lay;
    const ccx = (L + R) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(L, bandY, R - L, bandH);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(L, bandY, R - L, 3);
    ctx.fillRect(L, bandY + bandH - 3, R - L, 3);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8c25a';
    ctx.font = `700 ${Math.max(8, ts * 0.72)}px ${serif}`;
    ctx.fillText(kicker || tr('taunt_soon'), ccx, bandY + ts * 1.15);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${ts}px ${serif}`;
    ls.forEach((l, i) => ctx.fillText(l, ccx, bandY + ts * (2.35 + i * 1.25)));
  }
  ctx.restore();
}
