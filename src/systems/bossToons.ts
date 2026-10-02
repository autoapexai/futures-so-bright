/**
 * THE BOSSES, as cartoons (everything except L10 MONSIEUR MIRROR, see bossMime.ts). No
 * scoreboards anywhere: every boss is an original, maximally silly character with its own body,
 * silly entrance, native weak spot, slapstick hit reactions, absurd projectiles and a ridiculous
 * defeat. The board rect (b.x, b.y, b.w, b.h, rows, spot) stays the hit area and the weak spot is
 * always drawn at the current rank-slot height, so the fight rules are unchanged.
 *
 *  L20 THE NEIGHSAYERS      two pantomime horses on parachutes; golden horseshoes; cry fountains
 *  L30 THE GREAT SHUFFLINI  shell-game magician + a cardboard double; rabbit-in-the-hat; turns into ducks
 *  L40 BUCKLE BUSTER        bursts out of a cake; the loose gold buckle; his pants fall down
 *  L50 DEPUTY DO-OVER       swings in on a lasso; sheriff badge on a spring; bucked into the sunset
 *  L60 GOLDBOT 3000         gold trophy robot on rocket boots; the loose gold bolt; falls to bits
 *  L70 MADAME CHANDELIERA   chandelier diva + chorus of masks; the golden mask; dramatic faint
 *  L80 THE LATE LATE GHOST  couch ghost at the midnight movie; the popcorn tub; dozes off, THE END
 *  L90 CAPTAIN KABOOM       clown on a cannon tower, arrives in a tiny car; the fuse spark; fires himself
 *  L100 DJ CHANNEL ZAPP     80s VJ TV head; the gold tuning dial; switches off to a dot
 *  L110 ANGEL CONTRARIEL    grumpy contrarian cherub on a cloud; the halo gem; bonked by his own halo
 *  L111 ULTRA CONSCIOUSNESS  synthwave brain in a propeller cap on a sunset orb; the BIG IDEA lightbulb; MIND BLOWN
 */
import type { Board, BossFight, BossShot } from './Boss';
import { nonEnglish, tp } from '../i18n';

export { drawMindShot };

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const backOut = (t: number): number => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
/** Deterministic pseudo-random in [0, 1) for particle layouts. */
const hash = (i: number): number => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export interface Pose {
  t: number;
  /** 0..1 during the entrance, 1 after. */
  enter: number;
  /** 0 while fighting, 0..1 during the defeat gag. */
  beaten: number;
  hurt: boolean;
  stun: boolean;
  /** Googly pupils (spring), roughly -1.4..1.4. */
  px: number;
  py: number;
  /** Hat / hair lift after a bonk (negative = up). */
  lift: number;
  /** Absolute y of the weak spot (smoothed); NaN hides it. */
  spotY: number;
  glow: boolean;
  /** Decoy: is this the real one? */
  real: boolean;
  idx: number;
  /** Strut / slam amount (BUCKLE BUSTER), 0..1. */
  slam: number;
  /** Seconds since this board last swapped real/fake (magician POOF). */
  swapAge: number;
}

interface Wob {
  t: number;
  lastY: number;
  vy: number;
  px: number;
  py: number;
  pvx: number;
  pvy: number;
  spotY: number;
  lift: number;
  liftV: number;
  hurtWas: number;
  real: boolean;
  swapAt: number;
}
const wobs = new WeakMap<Board, Wob>();

function wobble(f: BossFight, b: Board, time: number): Wob {
  const rowH = b.h / b.rows;
  const sy = b.y - b.h / 2 + rowH * (b.spot + 0.5);
  let w = wobs.get(b);
  if (!w) {
    w = { t: time, lastY: b.y, vy: 0, px: 0, py: 0, pvx: 0, pvy: 0, spotY: sy, lift: 0, liftV: 0, hurtWas: 0, real: b.real, swapAt: -9 };
    wobs.set(b, w);
  }
  const dt = Math.min(0.05, Math.max(0, time - w.t));
  w.t = time;
  if (dt > 0) {
    const vy = (b.y - w.lastY) / dt;
    const ay = (vy - w.vy) / dt;
    w.vy = vy;
    w.lastY = b.y;
    w.pvx += (-90 * w.px - 5 * w.pvx + Math.sin(time * 13 + b.bob) * 30) * dt;
    w.pvy += (-90 * w.py - 5 * w.pvy + 60 - ay * 0.08) * dt;
    w.px = Math.max(-1.4, Math.min(1.4, w.px + w.pvx * dt));
    w.py = Math.max(-1.4, Math.min(1.4, w.py + w.pvy * dt));
    if (f.hurtT > 0.3 && w.hurtWas <= 0) w.liftV = -9;
    w.hurtWas = f.hurtT;
    w.liftV += 28 * dt;
    w.lift = Math.min(0, w.lift + w.liftV * dt);
    if (w.lift >= 0 && w.liftV > 0) w.liftV = 0;
    w.spotY += (sy - w.spotY) * Math.min(1, dt * 22);
  }
  if (w.real !== b.real) {
    w.real = b.real;
    w.swapAt = time;
  }
  return w;
}

// ---------------------------------------------------------------------------------------------
// Shared cartoon parts
// ---------------------------------------------------------------------------------------------

/** Two big googly eyes (spiral when stunned, spinning when bonked, wobbling otherwise). */
function eyes(ctx: Ctx, x: number, y: number, r: number, p: Pose, gap = 1.05, ink = '#140022'): void {
  for (const s of [-1, 1]) {
    const ex = x + s * r * gap;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1.2, r * 0.12);
    ctx.stroke();
    ctx.fillStyle = '#000';
    if (p.stun || p.beaten > 0.6) {
      ctx.beginPath();
      for (let a = 0; a < 12; a += 0.4) ctx.lineTo(ex + (Math.cos(a + p.t * 8 * s) * r * a) / 13, y + (Math.sin(a + p.t * 8 * s) * r * a) / 13);
      ctx.stroke();
    } else if (p.hurt) {
      const a = p.t * 25 * s;
      ctx.beginPath();
      ctx.arc(ex + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.45, 0, TAU);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(ex + p.px * r * 0.38, y + p.py * r * 0.38, r * 0.48, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex + p.px * r * 0.38 - r * 0.15, y + p.py * r * 0.38 - r * 0.15, r * 0.13, 0, TAU);
      ctx.fill();
    }
  }
}

/** Over-acted mouth: huge grin, "O" when bonked or stunned, wobbly frown when beaten. */
function mouth(ctx: Ctx, x: number, y: number, w: number, p: Pose, color = '#e0002a'): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (p.hurt || p.stun) ctx.ellipse(x, y, w * 0.32, w * 0.42, 0, 0, TAU);
  else if (p.beaten > 0) ctx.ellipse(x, y + w * 0.15, w * 0.6, w * 0.22 + Math.sin(p.t * 30) * w * 0.04, 0, Math.PI, TAU);
  else {
    ctx.moveTo(x - w, y - w * 0.15);
    ctx.quadraticCurveTo(x, y + w * 0.95, x + w, y - w * 0.15);
    ctx.quadraticCurveTo(x, y + w * 0.3, x - w, y - w * 0.15);
  }
  ctx.fill();
  if (!p.hurt && !p.stun && p.beaten <= 0) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - w * 0.45, y - w * 0.02, w * 0.9, w * 0.16);
  }
}

/** Pulsing gold glow behind a weak spot. */
function glow(ctx: Ctx, x: number, y: number, r: number, p: Pose): void {
  if (!p.glow) return;
  const k = 0.6 + 0.4 * Math.sin(p.t * 10);
  ctx.fillStyle = `rgba(255,214,63,${0.22 + 0.25 * k})`;
  ctx.beginPath();
  ctx.arc(x, y, r * (1.45 + 0.2 * k), 0, TAU);
  ctx.fill();
}

/** Squash and stretch about the feet. */
function squash(p: Pose, speed = 8, amt = 0.05): [number, number] {
  let sy = 1 + (p.stun ? 0 : Math.sin(p.t * speed) * amt) - (p.hurt ? 0.12 : 0);
  if (p.beaten > 0) sy *= 1 - 0.1 * Math.sin(p.t * 30) * p.beaten;
  return [1 / sy, sy];
}

function star(ctx: Ctx, x: number, y: number, r: number, n = 5): void {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function rubberArm(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, t: number, w: number, color = '#fff'): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  const wig = Math.sin(t * 11) * w * 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.bezierCurveTo(x0 - w * 3, y0 + wig, x1 + w * 3, y1 - wig, x1, y1);
  ctx.stroke();
}

function confetti(ctx: Ctx, cx: number, cy: number, k: number, n: number, spread: number, seed = 1): void {
  const cols = ['#ff4ec8', '#7fffff', '#ffe14d', '#7dff6b', '#ff7a33', '#b48cff'];
  for (let i = 0; i < n; i++) {
    const a = hash(i + seed) * TAU;
    const v = 0.4 + hash(i * 3 + seed) * 0.8;
    const x = cx + Math.cos(a) * spread * v * k;
    const y = cy + Math.sin(a) * spread * v * k + k * k * spread * 0.6;
    ctx.fillStyle = cols[i % cols.length];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(k * 12 + i);
    ctx.fillRect(-3, -1.5, 6, 3);
    ctx.restore();
  }
}

function duck(ctx: Ctx, x: number, y: number, r: number, rot = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#ffd93d';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.2, r, r * 0.65, 0, 0, TAU);
  ctx.arc(r * 0.55, -r * 0.45, r * 0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ff8c1a';
  ctx.beginPath();
  ctx.ellipse(r * 1.1, -r * 0.4, r * 0.35, r * 0.15, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(r * 0.7, -r * 0.55, r * 0.09, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function speech(ctx: Ctx, text: string, x: number, y: number, size: number, color = '#ffffff'): void {
  ctx.save();
  ctx.font = `900 ${size}px 'Orbitron', sans-serif`;
  if (nonEnglish()) {
    // Translated bubbles can run longer than the English: keep them on screen.
    text = tp(text);
    const m = ctx.getTransform();
    if (m.b === 0 && m.c === 0 && m.a > 0) {
      // Clamp in device pixels (the bubble may be drawn inside a translated / scaled frame).
      const half = (ctx.measureText(text).width / 2 + size * 0.3) * m.a;
      const sx = Math.max(half + 4, Math.min(ctx.canvas.width - half - 4, m.a * x + m.e));
      x = (sx - m.e) / m.a;
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size * 0.22);
  ctx.strokeStyle = '#140022';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** A speech burst kept inside 0..W (logical px) in every language. */
function speechIn(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, W: number): void {
  ctx.save();
  ctx.font = `900 ${size}px 'Orbitron', sans-serif`;
  const half = ctx.measureText(nonEnglish() ? tp(text) : text).width / 2 + size * 0.3;
  ctx.restore();
  speech(ctx, text, Math.max(half + 4, Math.min(W - half - 4, x)), y, size, color);
}

// ---------------------------------------------------------------------------------------------
// Characters. Each draws itself filling the hit box (cx, cy, w, h); p.spotY is the weak spot.
// ---------------------------------------------------------------------------------------------

type DrawFn = (ctx: Ctx, cx: number, cy: number, w: number, h: number, p: Pose) => void;

/** Shared frame: origin at the box's bottom centre, squash/stretch applied, then shifted so (0,0) is the box centre. */
function frame(ctx: Ctx, cx: number, cy: number, h: number, p: Pose, speed = 8, amt = 0.05): void {
  ctx.translate(cx, cy + h / 2);
  const [sx, sy] = squash(p, speed, amt);
  ctx.scale(sx, sy);
  ctx.translate(0, -h / 2);
}

/** L20 THE NEIGHSAYERS: a pantomime horse (one of two), giraffe-long stretchy neck, buck teeth. */
const drawHorse: DrawFn = (ctx, cx, cy, w, h, p) => {
  const col = p.idx === 0 ? '#ff7ac8' : '#b48cff';
  const dark = p.idx === 0 ? '#b8327e' : '#6741c4';
  ctx.save();
  frame(ctx, cx, cy, h, p, 10, 0.06);
  const bodyH = Math.min(h * 0.26, w * 0.55);
  const by = h / 2 - bodyH * 1.05;
  // galloping legs + hooves
  for (let i = 0; i < 4; i++) {
    const lx = -w * 0.32 + i * w * 0.21;
    const sw = p.stun ? 0 : Math.sin(p.t * 12 + i * 1.6) * w * 0.08;
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(3, w * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lx, by);
    ctx.lineTo(lx + sw, h / 2 - w * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(lx + sw - w * 0.06, h / 2 - w * 0.07, w * 0.12, w * 0.07);
  }
  // tail swish
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = Math.max(3, w * 0.07);
  ctx.beginPath();
  ctx.moveTo(w * 0.42, by - bodyH * 0.1);
  ctx.quadraticCurveTo(w * 0.62, by + Math.sin(p.t * 9) * bodyH * 0.6, w * 0.5, by + bodyH * 0.55);
  ctx.stroke();
  // body with spots
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(0, by, w * 0.48, bodyH * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(-w * 0.2 + i * w * 0.18, by - bodyH * 0.1 + (i % 2) * bodyH * 0.2, bodyH * 0.12, 0, TAU);
    ctx.fill();
  }
  // long stretchy neck with a mane down the back
  const headR = Math.min(w * 0.36, h * 0.13);
  const hy = -h / 2 + headR * 1.25;
  const nx = -w * 0.1;
  ctx.fillStyle = col;
  ctx.fillRect(nx - w * 0.13, hy, w * 0.26, by - hy);
  ctx.fillStyle = '#ffe14d';
  const n = Math.max(3, Math.floor((by - hy) / (w * 0.16)));
  for (let i = 0; i < n; i++) {
    const yy = hy + ((by - hy) * i) / n;
    ctx.beginPath();
    ctx.moveTo(nx + w * 0.13, yy);
    ctx.lineTo(nx + w * 0.26 + Math.sin(p.t * 7 + i) * w * 0.04, yy + w * 0.08);
    ctx.lineTo(nx + w * 0.13, yy + w * 0.16);
    ctx.fill();
  }
  // head: long face leaning toward the player, darker muzzle, buck teeth, nostrils
  ctx.save();
  ctx.translate(nx - headR * 0.3, hy);
  ctx.rotate(-0.35 + (p.hurt ? Math.sin(p.t * 40) * 0.1 : 0));
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(0, 0, headR * 1.2, headR * 0.78, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(-headR * 0.85, headR * 0.12, headR * 0.5, headR * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(-headR * 1.05, headR * 0.02, headR * 0.08, 0, TAU);
  ctx.arc(-headR * 0.75, headR * 0.02, headR * 0.08, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-headR * 1.0, headR * 0.5, headR * 0.18, headR * (p.hurt ? 0.15 : 0.3));
  ctx.fillRect(-headR * 0.78, headR * 0.5, headR * 0.18, headR * (p.hurt ? 0.15 : 0.3));
  // ears
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(headR * 0.3, -headR * 0.6);
  ctx.lineTo(headR * 0.45, -headR * 1.4);
  ctx.lineTo(headR * 0.75, -headR * 0.5);
  ctx.fill();
  ctx.restore();
  // forelock (flies off on a bonk)
  ctx.fillStyle = '#ffe14d';
  ctx.beginPath();
  ctx.ellipse(nx + headR * 0.2, hy - headR * 0.75 + p.lift * headR, headR * 0.45, headR * 0.22, -0.4, 0, TAU);
  ctx.fill();
  eyes(ctx, nx - headR * 0.1, hy - headR * 0.25, headR * 0.3, p, 1.0);
  // weak spot: a golden horseshoe held out on a wobbly foreleg
  if (!Number.isNaN(p.spotY)) {
    const sy = Math.max(-h / 2, Math.min(h / 2, p.spotY - cy));
    const r = Math.max(6, Math.min(w * 0.26, h * 0.12));
    const hx = -w / 2 + r * 0.4;
    rubberArm(ctx, nx - w * 0.1, Math.max(hy + headR, Math.min(by, sy)), hx + r * 0.8, sy, p.t, Math.max(3, w * 0.07), dark);
    glow(ctx, hx, sy, r, p);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = r * 0.42;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(hx, sy, r * 0.7, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();
    ctx.fillStyle = '#a86b00';
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.85 + i * 0.32);
      ctx.beginPath();
      ctx.arc(hx + Math.cos(a) * r * 0.7, sy + Math.sin(a) * r * 0.7, r * 0.07, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
};

/** L30 THE GREAT SHUFFLINI: magician with a towering top hat, cape and curly mustache. */
const drawMagician: DrawFn = (ctx, cx, cy, w, h, p) => {
  ctx.save();
  if (!p.real) ctx.globalAlpha *= 0.5;
  frame(ctx, cx, cy, h, p, 7, 0.04);
  const headR = Math.min(w * 0.3, h * 0.13);
  const hatH = Math.min(h * 0.32, Math.max(headR * 2, h * 0.32));
  const hy = -h / 2 + hatH + headR * 0.9;
  // cape
  ctx.fillStyle = '#5b1a8f';
  ctx.beginPath();
  ctx.moveTo(-w * 0.2, hy + headR * 0.8);
  ctx.quadraticCurveTo(-w * 0.62, h * 0.1 + Math.sin(p.t * 5) * w * 0.06, -w * 0.45, h / 2);
  ctx.lineTo(w * 0.45, h / 2);
  ctx.quadraticCurveTo(w * 0.62, h * 0.1, w * 0.2, hy + headR * 0.8);
  ctx.fill();
  ctx.fillStyle = '#ffe14d';
  for (let i = 0; i < 6; i++) star(ctx, -w * 0.3 + hash(i) * w * 0.6, hy + headR + hash(i + 9) * (h / 2 - hy - headR), Math.max(3, w * 0.05));
  // suit + bow tie
  ctx.fillStyle = '#111';
  ctx.fillRect(-w * 0.18, hy + headR * 0.8, w * 0.36, h / 2 - hy - headR * 0.8);
  ctx.fillStyle = '#fff';
  ctx.fillRect(-w * 0.07, hy + headR * 0.8, w * 0.14, Math.min(h * 0.2, w * 0.5));
  ctx.fillStyle = '#e0002a';
  ctx.beginPath();
  ctx.moveTo(0, hy + headR * 1.05);
  ctx.lineTo(-w * 0.12, hy + headR * 0.85);
  ctx.lineTo(-w * 0.12, hy + headR * 1.25);
  ctx.lineTo(w * 0.12, hy + headR * 0.85);
  ctx.lineTo(w * 0.12, hy + headR * 1.25);
  ctx.fill();
  // face
  ctx.fillStyle = '#ffd9b0';
  ctx.beginPath();
  ctx.arc(0, hy, headR, 0, TAU);
  ctx.fill();
  eyes(ctx, 0, hy - headR * 0.2, headR * 0.34, p, 1.05);
  // curly mustache (pops off on a bonk)
  ctx.strokeStyle = '#2a1a10';
  ctx.lineWidth = Math.max(2, headR * 0.18);
  const my = hy + headR * 0.35 + (p.hurt ? -p.lift * headR * 0.5 : 0);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, my);
    ctx.quadraticCurveTo(s * headR * 0.6, my + headR * 0.25, s * headR * 0.85, my - headR * 0.15);
    ctx.arc(s * headR * 0.75, my - headR * 0.15, headR * 0.1, 0, Math.PI * 1.5, s < 0);
    ctx.stroke();
  }
  mouth(ctx, 0, hy + headR * 0.62, headR * 0.3, p);
  // towering top hat (it bounces up off his head when he's bonked)
  ctx.fillStyle = '#111';
  const top = -h / 2 + p.lift * headR;
  ctx.fillRect(-headR * 0.8, top, headR * 1.6, hy - headR * 0.75 - top);
  ctx.fillRect(-headR * 1.25, hy - headR * 0.9, headR * 2.5, headR * 0.22);
  ctx.fillStyle = '#e0002a';
  ctx.fillRect(-headR * 0.8, hy - headR * 1.25, headR * 1.6, headR * 0.3);
  // wand with sparkles
  ctx.strokeStyle = '#111';
  ctx.lineWidth = Math.max(2, w * 0.04);
  const wx = w * 0.42;
  const wy = hy + headR * 1.2 + Math.sin(p.t * 6) * headR * 0.4;
  ctx.beginPath();
  ctx.moveTo(w * 0.18, hy + headR * 1.6);
  ctx.lineTo(wx, wy);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  star(ctx, wx, wy, Math.max(3, w * 0.06) * (1 + 0.3 * Math.sin(p.t * 14)), 4);
  if (!p.real) {
    // the cardboard double: brace + dashed outline
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 2;
    ctx.strokeRect(-w * 0.5, -h / 2, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#c99a5b';
    ctx.fillRect(w * 0.15, h * 0.3, w * 0.08, h * 0.2);
  }
  // weak spot: a rabbit popping out of a little top hat on his outstretched hand
  if (!Number.isNaN(p.spotY) && p.real) {
    const sy = Math.max(-h / 2, Math.min(h / 2, p.spotY - cy));
    const r = Math.max(6, Math.min(w * 0.26, h * 0.12));
    const hx = -w / 2 + r * 0.5;
    rubberArm(ctx, -w * 0.18, Math.max(hy + headR, Math.min(h / 2 - r, sy)), hx + r * 0.6, sy + r * 0.3, p.t, Math.max(3, w * 0.06), '#111');
    glow(ctx, hx, sy, r, p);
    ctx.fillStyle = '#fff';
    const pop = 0.5 + 0.5 * Math.sin(p.t * 6);
    ctx.beginPath();
    ctx.ellipse(hx - r * 0.25, sy - r * (0.7 + pop * 0.4), r * 0.16, r * 0.45, -0.2, 0, TAU);
    ctx.ellipse(hx + r * 0.2, sy - r * (0.7 + pop * 0.4), r * 0.16, r * 0.45, 0.2, 0, TAU);
    ctx.arc(hx, sy - r * 0.2 - pop * r * 0.3, r * 0.42, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff7ac8';
    ctx.beginPath();
    ctx.arc(hx - r * 0.3, sy - r * 0.25 - pop * r * 0.3, r * 0.06, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(hx - r * 0.55, sy, r * 1.1, r * 0.6);
    ctx.fillRect(hx - r * 0.8, sy, r * 1.6, r * 0.15);
  }
  ctx.restore();
};

/** L40 BUCKLE BUSTER: a very large dancer in a buckle-covered jacket, huge afro, tiny moonwalking legs. */
const drawBuckle: DrawFn = (ctx, cx, cy, w, h, p) => {
  ctx.save();
  frame(ctx, cx, cy, h, p, 9, 0.06);
  if (p.slam > 0) ctx.rotate(-0.12 * p.slam);
  const legH = Math.min(h * 0.18, w * 0.5);
  const bodyTop = -h / 2 + Math.min(h * 0.22, w * 0.7);
  const bodyBot = h / 2 - legH;
  const bw = w * 0.62;
  // legs: moonwalk; pants fall down when he's beaten (polka-dot boxers!)
  const step = Math.sin(p.t * 9);
  for (const [i, k] of [[-1, step], [1, -step]] as const) {
    const lx = i * w * 0.18 + k * w * 0.08;
    ctx.fillStyle = p.beaten > 0.15 ? '#ffd9b0' : '#2a2a33';
    ctx.fillRect(lx - w * 0.07, bodyBot - 2, w * 0.14, legH - w * 0.06);
    ctx.fillStyle = '#fff';
    ctx.fillRect(lx - w * 0.12, h / 2 - w * 0.07, w * 0.24, w * 0.07);
  }
  if (p.beaten > 0.15) {
    ctx.fillStyle = '#2a2a33';
    ctx.fillRect(-w * 0.32, h / 2 - w * 0.16, w * 0.64, w * 0.1);
    ctx.fillStyle = '#ff4ec8';
    ctx.fillRect(-w * 0.3, bodyBot - legH * 0.1, w * 0.6, legH * 0.45);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(-w * 0.24 + i * w * 0.1, bodyBot + legH * 0.1 + (i % 2) * legH * 0.15, Math.max(1.5, w * 0.025), 0, TAU);
      ctx.fill();
    }
  }
  // the belly-jacket (leather, shine)
  const g = ctx.createRadialGradient(-bw * 0.3, bodyTop + (bodyBot - bodyTop) * 0.3, 2, 0, (bodyTop + bodyBot) / 2, bw);
  g.addColorStop(0, '#5a5a66');
  g.addColorStop(1, '#141418');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, (bodyTop + bodyBot) / 2, bw, (bodyBot - bodyTop) / 2, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#ff3b8d';
  ctx.lineWidth = 2;
  ctx.stroke();
  // zipper
  ctx.strokeStyle = '#ccc';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(w * 0.05, bodyTop + 4);
  ctx.lineTo(w * 0.05, bodyBot - 4);
  ctx.stroke();
  ctx.setLineDash([]);
  // the face (pokes out of the collar), sunglasses pushed up, googly eyes below
  const headR = Math.min(w * 0.3, h * 0.14);
  const hy = bodyTop + headR * 0.2;
  ctx.fillStyle = '#c98a5b';
  ctx.beginPath();
  ctx.arc(0, hy, headR, 0, TAU);
  ctx.fill();
  // afro (flies up on a bonk)
  ctx.fillStyle = '#2a1a10';
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * headR * 0.95, hy - headR * 0.35 + Math.sin(a) * headR * 0.95 + p.lift * headR, headR * 0.45, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#ff3b8d';
  ctx.fillRect(-headR * 0.85, hy - headR * 0.75, headR * 1.7, headR * 0.22);
  eyes(ctx, 0, hy - headR * 0.1, headR * 0.3, p, 1.1);
  mouth(ctx, 0, hy + headR * 0.5, headR * 0.35, p);
  if (p.beaten > 0.2) {
    ctx.fillStyle = 'rgba(255,80,120,0.6)';
    ctx.beginPath();
    ctx.arc(-headR * 0.6, hy + headR * 0.3, headR * 0.18, 0, TAU);
    ctx.arc(headR * 0.6, hy + headR * 0.3, headR * 0.18, 0, TAU);
    ctx.fill();
  }
  // silver buckles all over the jacket
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    const yy = bodyTop + ((bodyBot - bodyTop) * (r + 0.5)) / rows;
    for (const s of [-1, 1]) {
      ctx.strokeStyle = '#cfcfd8';
      ctx.lineWidth = 2;
      ctx.strokeRect(s * bw * 0.55 - w * 0.05, yy - w * 0.035, w * 0.1, w * 0.07);
    }
  }
  // weak spot: the one gold buckle straining to pop off
  if (!Number.isNaN(p.spotY)) {
    const sy = Math.max(-h / 2, Math.min(h / 2, p.spotY - cy));
    const r = Math.max(6, Math.min(w * 0.22, h * 0.1));
    const bx = -bw * 0.75 + Math.sin(p.t * 20) * 2;
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx + r, sy);
    ctx.quadraticCurveTo(-bw * 0.4, sy + r, -bw * 0.2, sy);
    ctx.stroke();
    glow(ctx, bx, sy, r, p);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = r * 0.35;
    ctx.strokeRect(bx - r * 0.8, sy - r * 0.55, r * 1.6, r * 1.1);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(bx - r * 0.1, sy - r * 0.55, r * 0.2, r * 1.1);
  }
  ctx.restore();
};

/** L50 DEPUTY DO-OVER: auditioning cowboy, giant hat, droopy mustache, stilt legs, hobby horse. */
const drawCowboy: DrawFn = (ctx, cx, cy, w, h, p) => {
  ctx.save();
  frame(ctx, cx, cy, h, p, 11, 0.07);
  const headR = Math.min(w * 0.26, h * 0.11);
  const hy = -h / 2 + headR * 2.2;
  const hipY = hy + headR * 3.2;
  // hobby horse: stick from the ground up between the legs, horse head poking out front
  ctx.strokeStyle = '#a0723c';
  ctx.lineWidth = Math.max(3, w * 0.06);
  ctx.beginPath();
  ctx.moveTo(w * 0.35, h / 2);
  ctx.lineTo(-w * 0.2, hipY - headR * 0.4);
  ctx.stroke();
  ctx.fillStyle = '#d9c3a0';
  ctx.beginPath();
  ctx.ellipse(-w * 0.3, hipY - headR * 0.8, headR * 0.8, headR * 0.45, -0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(-w * 0.28, hipY - headR * 1.0, headR * 0.1, 0, TAU);
  ctx.fill();
  // long stilt legs in fringed chaps, enormous boots with pinwheel spurs
  for (const s of [-1, 1]) {
    const lx = s * w * 0.12 + (p.stun ? 0 : Math.sin(p.t * 11 + s) * w * 0.05);
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = Math.max(4, w * 0.1);
    ctx.beginPath();
    ctx.moveTo(s * w * 0.08, hipY);
    ctx.lineTo(lx, h / 2 - w * 0.12);
    ctx.stroke();
    ctx.strokeStyle = '#d9a35b';
    ctx.lineWidth = 1;
    for (let k = 0.2; k < 0.9; k += 0.12) {
      const yy = hipY + (h / 2 - hipY) * k;
      ctx.beginPath();
      ctx.moveTo(lx + s * w * 0.05, yy);
      ctx.lineTo(lx + s * w * 0.1, yy + 3);
      ctx.stroke();
    }
    ctx.fillStyle = '#5a3418';
    ctx.beginPath();
    ctx.ellipse(lx - w * 0.06, h / 2 - w * 0.06, w * 0.16, w * 0.07, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#ffd23f';
    ctx.beginPath();
    const sa = p.t * 15;
    for (let k = 0; k < 4; k++) {
      ctx.moveTo(lx + w * 0.1, h / 2 - w * 0.06);
      ctx.lineTo(lx + w * 0.1 + Math.cos(sa + k * 1.57) * w * 0.06, h / 2 - w * 0.06 + Math.sin(sa + k * 1.57) * w * 0.06);
    }
    ctx.stroke();
  }
  // tiny body + red bandana
  ctx.fillStyle = '#3a6ea5';
  ctx.fillRect(-w * 0.14, hy + headR * 0.8, w * 0.28, hipY - hy - headR * 0.8);
  ctx.fillStyle = '#e0002a';
  ctx.beginPath();
  ctx.moveTo(-headR * 0.8, hy + headR * 0.75);
  ctx.lineTo(headR * 0.8, hy + headR * 0.75);
  ctx.lineTo(0, hy + headR * 1.5);
  ctx.fill();
  // head, droopy handlebar mustache
  ctx.fillStyle = '#ffd9b0';
  ctx.beginPath();
  ctx.arc(0, hy, headR, 0, TAU);
  ctx.fill();
  eyes(ctx, 0, hy - headR * 0.15, headR * 0.32, p, 1.05);
  ctx.strokeStyle = '#5a3418';
  ctx.lineWidth = Math.max(2, headR * 0.22);
  const droop = p.hurt ? headR * 0.5 : headR * 0.25;
  ctx.beginPath();
  ctx.moveTo(-headR * 0.9, hy + headR * 0.3 + droop);
  ctx.quadraticCurveTo(0, hy + headR * 0.15, headR * 0.9, hy + headR * 0.3 + droop);
  ctx.stroke();
  // ENORMOUS wobbling hat (pops up on a bonk, falls over his eyes when stunned)
  const hatY = hy - headR * 0.75 + p.lift * headR + (p.stun ? headR * 0.6 : 0);
  ctx.save();
  ctx.translate(0, hatY);
  ctx.rotate(Math.sin(p.t * 6) * 0.12);
  ctx.fillStyle = '#c98a3d';
  ctx.beginPath();
  ctx.ellipse(0, 0, headR * 2.1, headR * 0.4, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-headR * 0.9, 0);
  ctx.quadraticCurveTo(-headR * 1.0, -headR * 1.6, 0, -headR * 1.35);
  ctx.quadraticCurveTo(headR * 1.0, -headR * 1.6, headR * 0.9, 0);
  ctx.fill();
  ctx.fillStyle = '#5a3418';
  ctx.fillRect(-headR * 0.9, -headR * 0.35, headR * 1.8, headR * 0.22);
  ctx.restore();
  // weak spot: his sheriff badge, held out on a boing-y spring
  if (!Number.isNaN(p.spotY)) {
    const sy = Math.max(-h / 2, Math.min(h / 2, p.spotY - cy));
    const r = Math.max(6, Math.min(w * 0.24, h * 0.1));
    const bx = -w / 2 + r * 0.5;
    const ay = Math.max(hy + headR, Math.min(hipY, sy));
    ctx.strokeStyle = '#cfcfd8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      ctx.lineTo(-w * 0.14 + (bx + r - -w * 0.14) * k, ay + (sy - ay) * k + (i % 2 ? -4 : 4));
    }
    ctx.stroke();
    glow(ctx, bx, sy, r, p);
    ctx.fillStyle = '#ffd23f';
    star(ctx, bx, sy, r * 0.95);
    ctx.fillStyle = '#a86b00';
    ctx.beginPath();
    ctx.arc(bx, sy, r * 0.25, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
};

/** L60 GOLDBOT 3000: a gold-plated trophy robot (trophy-cup head), accordion neck, tank treads. */
const drawRobot: DrawFn = (ctx, cx, cy, w, h, p) => {
  ctx.save();
  frame(ctx, cx, cy, h, p, 6, 0.03);
  const gold = (y0: number, y1: number): CanvasGradient => {
    const g = ctx.createLinearGradient(-w * 0.4, y0, w * 0.4, y1);
    g.addColorStop(0, '#fff3a0');
    g.addColorStop(0.5, '#ffc400');
    g.addColorStop(1, '#a86b00');
    return g;
  };
  const headR = Math.min(w * 0.34, h * 0.14);
  const hy = -h / 2 + headR * 1.4;
  const treadH = Math.min(h * 0.12, w * 0.32);
  const chestBot = h / 2 - treadH;
  // a compact chest; on a tall screen the accordion neck telescopes to fill the rest
  const chestTop = Math.max(hy + headR * 1.6 + Math.min(h * 0.12, headR * 1.5), chestBot - Math.min(h * 0.34, w * 1.25));
  // treads
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.ellipse(0, h / 2 - treadH / 2, w * 0.46, treadH / 2, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#888';
  for (let i = 0; i < 6; i++) {
    const a = p.t * 6 + i;
    ctx.beginPath();
    ctx.arc(-w * 0.3 + i * w * 0.12, h / 2 - treadH / 2 + Math.sin(a) * 1.5, treadH * 0.18, 0, TAU);
    ctx.fill();
  }
  // chest box with a big $ and blinking lights
  ctx.fillStyle = gold(chestTop, chestBot);
  ctx.fillRect(-w * 0.38, chestTop, w * 0.76, chestBot - chestTop);
  ctx.strokeStyle = '#7a4d00';
  ctx.lineWidth = 2;
  ctx.strokeRect(-w * 0.38, chestTop, w * 0.76, chestBot - chestTop);
  ctx.fillStyle = '#7a4d00';
  ctx.font = `900 ${Math.max(10, w * 0.32)}px 'Orbitron', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', w * 0.05, (chestTop + chestBot) / 2);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = Math.floor(p.t * 4 + i) % 3 === 0 ? '#ff3355' : '#550011';
    ctx.beginPath();
    ctx.arc(-w * 0.2 + i * w * 0.2, chestTop + w * 0.08, w * 0.035, 0, TAU);
    ctx.fill();
  }
  // arms (waving the money)
  ctx.strokeStyle = '#ffc400';
  ctx.lineWidth = Math.max(3, w * 0.07);
  ctx.beginPath();
  ctx.moveTo(w * 0.38, chestTop + w * 0.1);
  ctx.lineTo(w * 0.52, chestTop - w * 0.1 + Math.sin(p.t * 8) * w * 0.1);
  ctx.stroke();
  // accordion neck
  ctx.fillStyle = '#d9a000';
  const ny0 = hy + headR * 1.2;
  const nn = Math.max(3, Math.floor((chestTop - ny0) / 6));
  for (let i = 0; i < nn; i++) ctx.fillRect(-w * (i % 2 ? 0.08 : 0.12), ny0 + ((chestTop - ny0) * i) / nn, w * (i % 2 ? 0.16 : 0.24), (chestTop - ny0) / nn + 0.5);
  // trophy-cup head: cup, handles as ears, base, googly eyes, gold-tooth grin
  ctx.strokeStyle = '#ffc400';
  ctx.lineWidth = Math.max(3, headR * 0.2);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * headR * 1.05, hy - headR * 0.1, headR * 0.4, s < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, s < 0 ? Math.PI * 1.5 : Math.PI * 0.5);
    ctx.stroke();
  }
  ctx.fillStyle = gold(hy - headR, hy + headR);
  ctx.beginPath();
  ctx.moveTo(-headR, hy - headR);
  ctx.lineTo(headR, hy - headR);
  ctx.quadraticCurveTo(headR, hy + headR * 0.9, 0, hy + headR * 0.95);
  ctx.quadraticCurveTo(-headR, hy + headR * 0.9, -headR, hy - headR);
  ctx.fill();
  ctx.fillRect(-headR * 0.5, hy + headR * 0.9, headR, headR * 0.3);
  eyes(ctx, 0, hy - headR * 0.35, headR * 0.3, p, 1.1);
  mouth(ctx, 0, hy + headR * 0.3, headR * 0.4, p, '#7a1a00');
  // antenna with a spinning dollar sign
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 2;
  const ay = hy - headR - headR * 0.6 + p.lift * headR;
  ctx.beginPath();
  ctx.moveTo(0, hy - headR);
  ctx.lineTo(0, ay);
  ctx.stroke();
  ctx.save();
  ctx.translate(0, ay - 4);
  ctx.scale(Math.cos(p.t * 5), 1);
  ctx.fillStyle = '#7dff6b';
  ctx.font = `900 ${Math.max(9, headR * 0.6)}px 'Orbitron', sans-serif`;
  ctx.fillText('$', 0, 0);
  ctx.restore();
  // weak spot: the loose gold bolt, wobbling out of his side
  if (!Number.isNaN(p.spotY)) {
    const sy = Math.max(-h / 2, Math.min(h / 2, p.spotY - cy));
    const r = Math.max(6, Math.min(w * 0.22, h * 0.09));
    const bx = -w / 2 + r * 0.6 + Math.sin(p.t * 25) * 1.5;
    ctx.strokeStyle = '#a86b00';
    ctx.lineWidth = r * 0.3;
    ctx.beginPath();
    ctx.moveTo(bx, sy);
    ctx.lineTo(-w * 0.36, sy);
    ctx.stroke();
    glow(ctx, bx, sy, r, p);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) ctx.lineTo(bx + Math.cos(i * 1.047 + p.t * 3) * r * 0.75, sy + Math.sin(i * 1.047 + p.t * 3) * r * 0.75);
    ctx.fill();
    ctx.fillStyle = '#a86b00';
    ctx.beginPath();
    ctx.arc(bx, sy, r * 0.25, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
};

/** L70 MADAME CHANDELIERA: an opera-diva chandelier on a chain, with a chorus of masks on strings. */
const drawDiva: DrawFn = (ctx, cx, cy, w, h, p) => {
  ctx.save();
  ctx.translate(cx, cy);
  const sway = p.stun ? 0 : Math.sin(p.t * 2.2) * 0.06;
  // chain up off the top of the screen
  ctx.strokeStyle = '#b8902a';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(0, -h / 2 - 600);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(sway);
  const faceR = Math.min(w * 0.3, h * 0.12);
  const fy = -h / 2 + faceR * 2.2;
  // the chandelier frame: gold arms with candles
  ctx.strokeStyle = '#ffc400';
  ctx.lineWidth = Math.max(2.5, w * 0.04);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, fy + faceR);
    ctx.quadraticCurveTo(s * w * 0.5, fy + faceR * 1.8, s * w * 0.42, fy - faceR * 0.2);
    ctx.stroke();
    ctx.fillStyle = '#fff6d0';
    ctx.fillRect(s * w * 0.42 - 3, fy - faceR * 0.7, 6, faceR * 0.5);
    ctx.fillStyle = Math.sin(p.t * 20 + s) > 0 ? '#ffb000' : '#ff6a00';
    ctx.beginPath();
    ctx.ellipse(s * w * 0.42, fy - faceR * 0.85, 3, 6, 0, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(0, fy - faceR * 1.4);
  ctx.stroke();
  // crystal drops jingling
  ctx.fillStyle = 'rgba(200,240,255,0.9)';
  for (let i = 0; i < 7; i++) {
    const xx = -w * 0.36 + i * w * 0.12;
    const yy = fy + faceR * 1.45 + Math.abs(Math.sin(i)) * faceR * 0.3 + Math.sin(p.t * 9 + i) * 2;
    ctx.beginPath();
    ctx.moveTo(xx, yy - 5);
    ctx.lineTo(xx + 3, yy);
    ctx.lineTo(xx, yy + 6);
    ctx.lineTo(xx - 3, yy);
    ctx.fill();
  }
  // the diva face: tall purple beehive with tiara, giant lashes, ruby lips, beauty mark
  ctx.fillStyle = '#7a2bd1';
  ctx.beginPath();
  ctx.ellipse(0, fy - faceR * 1.0 + p.lift * faceR, faceR * 0.85, faceR * 1.0, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  star(ctx, 0, fy - faceR * 1.65 + p.lift * faceR, faceR * 0.3, 5);
  ctx.fillStyle = '#ffe0f0';
  ctx.beginPath();
  ctx.arc(0, fy, faceR, 0, TAU);
  ctx.fill();
  eyes(ctx, 0, fy - faceR * 0.2, faceR * 0.3, p, 1.1);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  for (const s of [-1, 1])
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(s * faceR * (0.2 + k * 0.2), fy - faceR * 0.5);
      ctx.lineTo(s * faceR * (0.25 + k * 0.25), fy - faceR * 0.75);
      ctx.stroke();
    }
  // singing mouth: big "O" always (louder when bonked)
  ctx.fillStyle = '#c4004a';
  ctx.beginPath();
  ctx.ellipse(0, fy + faceR * 0.48, faceR * (p.hurt ? 0.32 : 0.22), faceR * (0.22 + 0.08 * Math.sin(p.t * 8)), 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(faceR * 0.55, fy + faceR * 0.3, faceR * 0.06, 0, TAU);
  ctx.fill();
  // the chorus: drama masks hanging on strings at every row height
  const rows = 6;
  const top = fy + faceR * 1.6;
  for (let r = 0; r < rows; r++) {
    const yy = top + ((h / 2 - top) * (r + 0.5)) / rows;
    const xx = (r % 2 ? 1 : -1) * w * 0.28;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xx, top - 4);
    ctx.lineTo(xx, yy);
    ctx.stroke();
    ctx.fillStyle = r % 2 ? '#e8e8ff' : '#ffd0e0';
    ctx.beginPath();
    ctx.ellipse(xx, yy, w * 0.09, w * 0.11, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(xx - w * 0.035, yy - w * 0.03, w * 0.018, 0, TAU);
    ctx.arc(xx + w * 0.035, yy - w * 0.03, w * 0.018, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.beginPath();
    ctx.arc(xx, yy + w * (r % 2 ? 0.07 : 0.02), w * 0.04, r % 2 ? Math.PI * 1.15 : Math.PI * 0.15, r % 2 ? Math.PI * 1.85 : Math.PI * 0.85);
    ctx.stroke();
  }
  // weak spot: the golden mask (smug face), at the spot row
  if (!Number.isNaN(p.spotY)) {
    const sy = Math.max(-h / 2, Math.min(h / 2, p.spotY - cy));
    const r = Math.max(7, Math.min(w * 0.24, h * 0.1));
    const mx = -w / 2 + r * 0.7;
    ctx.strokeStyle = '#ffc400';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx, sy - r);
    ctx.lineTo(-w * 0.1, Math.min(sy - r, top));
    ctx.stroke();
    glow(ctx, mx, sy, r, p);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.ellipse(mx, sy, r * 0.8, r * 0.95, Math.sin(p.t * 4) * 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#7a4d00';
    ctx.beginPath();
    ctx.ellipse(mx - r * 0.3, sy - r * 0.2, r * 0.18, r * 0.1, 0, 0, TAU);
    ctx.ellipse(mx + r * 0.3, sy - r * 0.2, r * 0.18, r * 0.1, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#7a4d00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, sy + r * 0.2, r * 0.3, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  ctx.restore();
};

/** L80 THE LATE LATE GHOST: a bedsheet ghost in a recliner at the midnight movie, 3D glasses on. */
const drawGhost: DrawFn = (ctx, cx, cy, w, h, p) => {
  ctx.save();
  frame(ctx, cx, cy, h, p, 3, 0.05);
  const chairH = Math.min(h * 0.28, w * 0.75);
  const seatY = h / 2 - chairH * 0.45;
  // recliner (back + arms + footrest)
  ctx.fillStyle = '#8a3b2b';
  ctx.fillRect(w * 0.1, h / 2 - chairH, w * 0.38, chairH * 0.85);
  ctx.fillRect(-w * 0.4, seatY, w * 0.88, chairH * 0.3);
  ctx.fillStyle = '#6a2618';
  ctx.fillRect(-w * 0.45, seatY - chairH * 0.12, w * 0.15, chairH * 0.45);
  ctx.fillRect(-w * 0.35, h / 2 - chairH * 0.15, w * 0.1, chairH * 0.15);
  ctx.fillRect(w * 0.35, h / 2 - chairH * 0.15, w * 0.1, chairH * 0.15);
  // the ghost: a tall droopy bedsheet with wavy hem, floating up out of the seat
  const headR = Math.min(w * 0.32, h * 0.13);
  const hy = -h / 2 + headR * 1.3 + Math.sin(p.t * 2) * 3;
  ctx.fillStyle = 'rgba(245,245,255,0.97)';
  ctx.beginPath();
  ctx.moveTo(-headR, hy);
  ctx.arc(0, hy, headR, Math.PI, 0);
  ctx.lineTo(headR * 1.3, seatY + 4);
  for (let i = 0; i <= 6; i++) ctx.lineTo(headR * 1.3 - (headR * 2.6 * i) / 6, seatY + 4 + (i % 2 ? 7 : 0) + Math.sin(p.t * 4 + i) * 2);
  ctx.closePath();
  ctx.fill();
  // little sheet arm waving
  ctx.beginPath();
  ctx.ellipse(-headR * 1.2, hy + headR * 2 + Math.sin(p.t * 5) * 3, headR * 0.5, headR * 0.25, -0.6, 0, TAU);
  ctx.fill();
  // 3D glasses over the googly eyes
  eyes(ctx, 0, hy - headR * 0.05, headR * 0.3, p, 1.15);
  ctx.globalAlpha *= 0.55;
  ctx.fillStyle = '#ff2a4a';
  ctx.fillRect(-headR * 0.75, hy - headR * 0.35, headR * 0.65, headR * 0.6);
  ctx.fillStyle = '#2ac8ff';
  ctx.fillRect(headR * 0.1, hy - headR * 0.35, headR * 0.65, headR * 0.6);
  ctx.globalAlpha /= 0.55;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(-headR * 0.75, hy - headR * 0.35, headR * 1.5, headR * 0.6);
  // mouth: a yawning "O" (wider when bonked)
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.ellipse(0, hy + headR * 0.6, headR * (p.hurt ? 0.3 : 0.18), headR * (p.hurt ? 0.35 : 0.2 + 0.1 * Math.abs(Math.sin(p.t * 1.3))), 0, 0, TAU);
  ctx.fill();
  // nightcap (flies off on a bonk)
  ctx.fillStyle = '#4a5cff';
  ctx.beginPath();
  ctx.moveTo(-headR * 0.85, hy - headR * 0.55 + p.lift * headR);
  ctx.quadraticCurveTo(0, hy - headR * 1.9 + p.lift * headR, headR * 1.3, hy - headR * 1.0 + p.lift * headR);
  ctx.lineTo(headR * 0.85, hy - headR * 0.55 + p.lift * headR);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(headR * 1.3, hy - headR * 1.0 + p.lift * headR, headR * 0.18, 0, TAU);
  ctx.fill();
  // weak spot: the golden popcorn tub, held at the spot row, kernels popping
  if (!Number.isNaN(p.spotY)) {
    const sy = Math.max(-h / 2, Math.min(h / 2, p.spotY - cy));
    const r = Math.max(7, Math.min(w * 0.24, h * 0.1));
    const tx = -w / 2 + r * 0.7;
    ctx.fillStyle = 'rgba(245,245,255,0.97)';
    ctx.beginPath();
    ctx.moveTo(-headR * 0.9, Math.max(hy + headR, Math.min(seatY, sy)) - 6);
    ctx.quadraticCurveTo(-w * 0.3, sy, tx + r * 0.6, sy - 3);
    ctx.lineTo(tx + r * 0.6, sy + 5);
    ctx.quadraticCurveTo(-w * 0.3, sy + 8, -headR * 0.9, Math.max(hy + headR, Math.min(seatY, sy)) + 6);
    ctx.fill();
    glow(ctx, tx, sy, r, p);
    ctx.fillStyle = '#fff6c0';
    for (let i = 0; i < 5; i++) {
      const pk = (p.t * 2 + i * 0.37) % 1;
      ctx.beginPath();
      ctx.arc(tx - r * 0.5 + i * r * 0.25, sy - r * 0.55 - (i % 2) * r * 0.2 - pk * r * 0.6, r * 0.2, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(tx - r * 0.7, sy - r * 0.5);
    ctx.lineTo(tx + r * 0.7, sy - r * 0.5);
    ctx.lineTo(tx + r * 0.5, sy + r * 0.7);
    ctx.lineTo(tx - r * 0.5, sy + r * 0.7);
    ctx.fill();
    ctx.fillStyle = '#e0002a';
    for (let i = 0; i < 3; i++) ctx.fillRect(tx - r * 0.5 + i * r * 0.38, sy - r * 0.5, r * 0.18, r * 1.2);
  }
  ctx.restore();
};

/** L90 CAPTAIN KABOOM: a clown on a teetering tower of circus drums with a cannon and a fizzing fuse. */
const drawClown: DrawFn = (ctx, cx, cy, w, h, p) => {
  ctx.save();
  frame(ctx, cx, cy, h, p, 7, 0.035);
  const headR = Math.min(w * 0.28, h * 0.1);
  const hy = -h / 2 + headR * 1.3;
  const towerTop = hy + headR * 2.2;
  // drum tower, wobbling
  const drums = Math.max(2, Math.round((h / 2 - towerTop) / Math.max(18, w * 0.35)));
  const dh = (h / 2 - towerTop) / drums;
  const cols = ['#ff3b5c', '#3bc8ff', '#ffe14d', '#7dff6b', '#ff7a33', '#b48cff'];
  for (let i = 0; i < drums; i++) {
    const yy = towerTop + i * dh;
    const off = p.stun ? 0 : Math.sin(p.t * 3 + i) * w * 0.03;
    const dw = w * (0.62 + 0.06 * (i / drums));
    ctx.fillStyle = cols[i % cols.length];
    ctx.fillRect(-dw / 2 + off, yy + 2, dw, dh - 2);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(off, yy + 2, dw / 2, Math.min(5, dh * 0.15), 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      ctx.moveTo(-dw / 2 + off + (dw * k) / 4, yy + 4);
      ctx.lineTo(-dw / 2 + off + (dw * (k + 0.5)) / 4, yy + dh - 2);
      ctx.lineTo(-dw / 2 + off + (dw * (k + 1)) / 4, yy + 4);
    }
    ctx.stroke();
  }
  // cannon poking out toward the player (recoils a touch when hurt)
  const cyy = towerTop + dh * 0.5;
  ctx.fillStyle = '#2a2a33';
  ctx.save();
  ctx.translate(-w * 0.2 + (p.hurt ? 4 : 0), cyy);
  ctx.rotate(-0.15);
  ctx.fillRect(-w * 0.35, -w * 0.09, w * 0.4, w * 0.18);
  ctx.fillStyle = '#555';
  ctx.fillRect(-w * 0.38, -w * 0.11, w * 0.06, w * 0.22);
  ctx.restore();
  // the clown: polka-dot suit, ruff, white face, red nose, rainbow afro
  ctx.fillStyle = '#ffe14d';
  ctx.fillRect(-w * 0.18, hy + headR * 0.8, w * 0.36, towerTop - hy - headR * 0.8);
  ctx.fillStyle = '#ff3b5c';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(-w * 0.1 + (i % 2) * w * 0.2, hy + headR * 1.1 + Math.floor(i / 2) * headR * 0.5, Math.max(2, w * 0.03), 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.arc(Math.cos((i / 8) * TAU) * headR * 0.9, hy + headR * 0.9 + Math.sin((i / 8) * TAU) * headR * 0.25, headR * 0.28, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = cols[i % cols.length];
    const a = Math.PI + (i / 6) * Math.PI;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * headR * 1.05, hy + Math.sin(a) * headR * 0.85 + p.lift * headR, headR * 0.42, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, hy, headR, 0, TAU);
  ctx.fill();
  eyes(ctx, 0, hy - headR * 0.25, headR * 0.3, p, 1.1);
  ctx.fillStyle = '#ff1a3a';
  ctx.beginPath();
  ctx.arc(0, hy + headR * 0.15, headR * (p.hurt ? 0.38 : 0.26), 0, TAU);
  ctx.fill();
  mouth(ctx, 0, hy + headR * 0.6, headR * 0.45, p);
  // weak spot: the fizzing fuse spark, running down a zig-zag fuse beside the tower
  if (!Number.isNaN(p.spotY)) {
    const sy = Math.max(-h / 2, Math.min(h / 2, p.spotY - cy));
    const r = Math.max(7, Math.min(w * 0.24, h * 0.1));
    const fx = -w / 2 + r * 0.6;
    ctx.strokeStyle = '#c99a5b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.45, cyy);
    const steps = 8;
    for (let i = 1; i <= steps; i++) ctx.lineTo(fx + (i % 2 ? -r * 0.3 : r * 0.3), cyy + ((sy - cyy) * i) / steps);
    ctx.stroke();
    glow(ctx, fx, sy, r, p);
    ctx.strokeStyle = '#ffe14d';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + p.t * 9;
      const len = r * (0.5 + 0.4 * hash(i + Math.floor(p.t * 20)));
      ctx.beginPath();
      ctx.moveTo(fx, sy);
      ctx.lineTo(fx + Math.cos(a) * len, sy + Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(fx, sy, r * 0.3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
};

/** L100 DJ CHANNEL ZAPP: an 80s VJ with a CRT television for a head, shoulder pads and a mic. */
const drawVJ: DrawFn = (ctx, cx, cy, w, h, p) => {
  ctx.save();
  frame(ctx, cx, cy, h, p, 12, 0.04);
  if (!p.stun) ctx.translate(Math.sin(p.t * 31) * 1.2, 0);
  const tvW = Math.min(w * 0.8, h * 0.3);
  const tvH = tvW * 0.78;
  const ty = -h / 2 + tvH * 0.55 + tvW * 0.3;
  // jacket with giant shoulder pads + skinny legs
  const bodyTop = ty + tvH * 0.5;
  const legY = h / 2 - Math.min(h * 0.2, w * 0.6);
  ctx.fillStyle = '#ff4ec8';
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, bodyTop + 4);
  ctx.lineTo(w * 0.5, bodyTop + 4);
  ctx.lineTo(w * 0.3, legY);
  ctx.lineTo(-w * 0.3, legY);
  ctx.fill();
  ctx.fillStyle = '#20e0d0';
  ctx.fillRect(-w * 0.07, bodyTop + 4, w * 0.14, legY - bodyTop - 4);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = Math.max(3, w * 0.07);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * w * 0.15, legY);
    ctx.lineTo(s * w * 0.2 + Math.sin(p.t * 12 + s) * w * 0.06, h / 2 - 3);
    ctx.stroke();
  }
  // mic hand
  ctx.strokeStyle = '#ff4ec8';
  ctx.beginPath();
  ctx.moveTo(w * 0.4, bodyTop + 8);
  ctx.lineTo(w * 0.15, bodyTop + tvH * 0.2);
  ctx.stroke();
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(w * 0.12, bodyTop + tvH * 0.12, Math.max(3, w * 0.07), 0, TAU);
  ctx.fill();
  // rabbit-ear antennas (bounce up on a bonk)
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 2;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, ty - tvH / 2);
    ctx.lineTo(s * tvW * 0.4 + Math.sin(p.t * 7) * 3, ty - tvH / 2 - tvW * 0.35 + p.lift * tvW * 0.3);
    ctx.stroke();
  }
  // the TV head: wood cabinet, bulging screen with a face (static flicker when hurt)
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(-tvW / 2, ty - tvH / 2, tvW, tvH);
  ctx.fillStyle = p.hurt ? '#ddd' : '#1a3a5a';
  ctx.beginPath();
  ctx.roundRect(-tvW * 0.42, ty - tvH * 0.4, tvW * 0.68, tvH * 0.8, tvW * 0.08);
  ctx.fill();
  if (p.hurt || p.stun) {
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = hash(i + Math.floor(p.t * 30)) > 0.5 ? '#000' : '#fff';
      ctx.fillRect(-tvW * 0.42 + hash(i * 3 + Math.floor(p.t * 30)) * tvW * 0.64, ty - tvH * 0.4 + hash(i * 7) * tvH * 0.76, 3, 2);
    }
  }
  ctx.fillStyle = '#ccc';
  ctx.beginPath();
  ctx.arc(tvW * 0.36, ty - tvH * 0.15, tvW * 0.05, 0, TAU);
  ctx.arc(tvW * 0.36, ty + tvH * 0.1, tvW * 0.05, 0, TAU);
  ctx.fill();
  eyes(ctx, -tvW * 0.08, ty - tvH * 0.12, tvW * 0.1, p, 1.2);
  // mullet-tache and grin
  ctx.fillStyle = '#5a3418';
  ctx.fillRect(-tvW * 0.25, ty + tvH * 0.06, tvW * 0.34, tvH * 0.06);
  mouth(ctx, -tvW * 0.08, ty + tvH * 0.2, tvW * 0.11, p);
  // weak spot: the gold tuning dial sliding along a channel strip down his side
  if (!Number.isNaN(p.spotY)) {
    const sy = Math.max(-h / 2, Math.min(h / 2, p.spotY - cy));
    const r = Math.max(7, Math.min(w * 0.24, h * 0.1));
    const dx = -w / 2 + r * 0.6;
    ctx.fillStyle = 'rgba(32,224,208,0.35)';
    ctx.fillRect(dx - 3, bodyTop, 6, h / 2 - bodyTop);
    ctx.fillRect(dx - 3, -h / 2 + tvW * 0.3, 6, bodyTop + h / 2);
    glow(ctx, dx, sy, r, p);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(dx, sy, r * 0.75, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#7a4d00';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ctx.beginPath();
      ctx.moveTo(dx + Math.cos(a) * r * 0.6, sy + Math.sin(a) * r * 0.6);
      ctx.lineTo(dx + Math.cos(a) * r * 0.75, sy + Math.sin(a) * r * 0.75);
      ctx.stroke();
    }
    const a = p.t * 2;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(dx, sy);
    ctx.lineTo(dx + Math.cos(a) * r * 0.5, sy + Math.sin(a) * r * 0.5);
    ctx.stroke();
  }
  ctx.restore();
};

/** L110 ANGEL CONTRARIEL: a grumpy cherub who disagrees with everything, arms crossed, on a cloud. */
const drawAngel: DrawFn = (ctx, cx, cy, w, h, p) => {
  ctx.save();
  frame(ctx, cx, cy, h, p, 5, 0.05);
  const headR = Math.min(w * 0.3, h * 0.12);
  const hy = -h / 2 + headR * 1.6;
  const cloudY = h / 2 - Math.min(h * 0.1, w * 0.3);
  // tiny flapping wings
  const flap = Math.sin(p.t * 18) * 0.5;
  ctx.fillStyle = '#fff';
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * w * 0.15, hy + headR * 1.6);
    ctx.rotate(s * (0.5 + flap));
    ctx.beginPath();
    ctx.ellipse(s * w * 0.15, 0, w * 0.17, w * 0.08, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // robe down to the cloud
  ctx.fillStyle = '#f4f0ff';
  ctx.beginPath();
  ctx.moveTo(-w * 0.16, hy + headR * 0.8);
  ctx.lineTo(w * 0.16, hy + headR * 0.8);
  ctx.lineTo(w * 0.3, cloudY);
  ctx.lineTo(-w * 0.3, cloudY);
  ctx.fill();
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w * 0.29, cloudY - 3);
  ctx.lineTo(w * 0.29, cloudY - 3);
  ctx.stroke();
  // crossed arms (huff)
  ctx.fillStyle = '#ffd9b0';
  ctx.fillRect(-w * 0.2, hy + headR * 1.6, w * 0.4, Math.max(4, w * 0.09));
  // cloud
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(-w * 0.36 + i * w * 0.18, cloudY + Math.sin(p.t * 3 + i) * 2, w * 0.15, 0, TAU);
    ctx.fill();
  }
  // head with golden curls, one raised eyebrow, enormous pout
  ctx.fillStyle = '#ffd9b0';
  ctx.beginPath();
  ctx.arc(0, hy, headR, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffc94d';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(-headR * 0.75 + i * headR * 0.3, hy - headR * 0.85 + p.lift * headR * 0.5, headR * 0.25, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,120,150,0.5)';
  ctx.beginPath();
  ctx.arc(-headR * 0.6, hy + headR * 0.35, headR * 0.18, 0, TAU);
  ctx.arc(headR * 0.6, hy + headR * 0.35, headR * 0.18, 0, TAU);
  ctx.fill();
  eyes(ctx, 0, hy - headR * 0.1, headR * 0.28, p, 1.1);
  ctx.strokeStyle = '#7a4d00';
  ctx.lineWidth = Math.max(2, headR * 0.12);
  ctx.beginPath();
  ctx.moveTo(-headR * 0.6, hy - headR * 0.55);
  ctx.lineTo(-headR * 0.15, hy - headR * 0.4);
  ctx.moveTo(headR * 0.15, hy - headR * 0.55 - Math.abs(Math.sin(p.t * 3)) * headR * 0.2);
  ctx.lineTo(headR * 0.6, hy - headR * 0.6 - Math.abs(Math.sin(p.t * 3)) * headR * 0.2);
  ctx.stroke();
  if (p.hurt || p.stun) mouth(ctx, 0, hy + headR * 0.55, headR * 0.3, p);
  else {
    ctx.fillStyle = '#c4004a';
    ctx.beginPath();
    ctx.ellipse(0, hy + headR * 0.6, headR * 0.3, headR * 0.12, 0, Math.PI, TAU);
    ctx.fill();
  }
  // weak spot: his halo, taken off and held out like a hoop, a gem glinting on it
  if (!Number.isNaN(p.spotY)) {
    const sy = Math.max(-h / 2, Math.min(h / 2, p.spotY - cy));
    const r = Math.max(7, Math.min(w * 0.26, h * 0.1));
    const hx = -w / 2 + r * 0.7;
    rubberArm(ctx, -w * 0.18, Math.max(hy + headR, Math.min(cloudY, sy)), hx + r * 0.7, sy, p.t, Math.max(3, w * 0.07), '#ffd9b0');
    glow(ctx, hx, sy, r, p);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = r * 0.25;
    ctx.beginPath();
    ctx.ellipse(hx, sy, r * 0.75, r * 0.4, -0.2, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#7fffff';
    ctx.beginPath();
    ctx.moveTo(hx, sy - r * 0.55);
    ctx.lineTo(hx + r * 0.2, sy - r * 0.35);
    ctx.lineTo(hx, sy - r * 0.15);
    ctx.lineTo(hx - r * 0.2, sy - r * 0.35);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, hy - headR * 1.4, headR * 0.7, headR * 0.2, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
};

/**
 * L111 ULTRA CONSCIOUSNESS: a giant pink synthwave brain with googly eyes and a propeller
 * thinking cap, on a wiggly neon brain stem that floats on a striped sunset orb. Its weak spot is
 * the BIG IDEA: a golden lightbulb on a curly neuron, held out on the left at the weak-spot row.
 */
const brainR = (w: number, h: number): number => Math.min(w * 0.58, h * 0.21);
const drawBrain: DrawFn = (ctx, cx, cy, w, h, p) => {
  ctx.save();
  frame(ctx, cx, cy, h, p, 3.2, 0.03);
  const R = brainR(w, h);
  const bob = Math.sin(p.t * 2.2) * R * 0.04;
  const by = -h / 2 + R * 1.3 + bob;
  const orbR = Math.min(w * 0.42, h * 0.11);
  const oy = h / 2 - orbR * 1.05;
  const ink = '#140022';
  const pulse = 0.5 + 0.5 * Math.sin(p.t * 4);
  // aura (alpha fills, no shadowBlur: crisp and cheap on phones)
  ctx.fillStyle = `rgba(255,92,240,${0.1 + 0.08 * pulse})`;
  ctx.beginPath();
  ctx.arc(0, by, R * 1.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(63,240,255,${0.08 + 0.07 * (1 - pulse)})`;
  ctx.beginPath();
  ctx.arc(0, by, R * 1.28, 0, TAU);
  ctx.fill();
  // brain stem: a wiggly neon tube down to the orb, with glowing nodes
  const s0 = by + R * 0.75;
  const s1 = oy - orbR * 0.85;
  const wig = (p.stun ? 0.3 : 1) * Math.sin(p.t * 3) * Math.max(6, w * 0.16);
  const tube = (lw: number, col: string): void => {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, s0);
    ctx.bezierCurveTo(wig, s0 + (s1 - s0) * 0.33, -wig, s0 + (s1 - s0) * 0.66, 0, s1);
    ctx.stroke();
  };
  const tw = Math.max(5, w * 0.13);
  tube(tw + 3, ink);
  tube(tw, '#3ff0ff');
  tube(Math.max(1.5, tw * 0.3), '#ffffff');
  for (let i = 1; i <= 3; i++) {
    const q = i / 4;
    const x = (1 - q) * (1 - q) * (1 - q) * 0 + 3 * (1 - q) * (1 - q) * q * wig + 3 * (1 - q) * q * q * -wig;
    const y = s0 + (s1 - s0) * q;
    ctx.fillStyle = Math.floor(p.t * 6 + i) % 3 === 0 ? '#ffffff' : '#ff5cf0';
    ctx.beginPath();
    ctx.arc(x, y, tw * 0.45, 0, TAU);
    ctx.fill();
  }
  // the sunset orb it floats on, with a hover ring
  ctx.strokeStyle = `rgba(63,240,255,${0.45 + 0.35 * pulse})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, oy + orbR * 0.95, orbR * (1.35 + 0.1 * pulse), orbR * 0.3, 0, 0, TAU);
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, oy, orbR, 0, TAU);
  ctx.clip();
  const sun = ctx.createLinearGradient(0, oy - orbR, 0, oy + orbR);
  sun.addColorStop(0, '#ffe14d');
  sun.addColorStop(0.5, '#ff7a33');
  sun.addColorStop(1, '#ff3ec8');
  ctx.fillStyle = sun;
  ctx.fillRect(-orbR, oy - orbR, orbR * 2, orbR * 2);
  ctx.fillStyle = '#2a0a4a';
  for (let i = 0; i < 4; i++) ctx.fillRect(-orbR, oy + orbR * (0.05 + i * 0.24), orbR * 2, orbR * (0.05 + i * 0.03));
  ctx.restore();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, oy, orbR, 0, TAU);
  ctx.stroke();
  // the brain: an ink blob for the outline, then the pink lobes on top
  const lobes = (pad: number): void => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const x = Math.cos(a) * R * 0.6;
      const y = by + Math.sin(a) * R * 0.46;
      ctx.moveTo(x + R * 0.47 + pad, y);
      ctx.arc(x, y, R * 0.47 + pad, 0, TAU);
    }
    ctx.fill();
  };
  ctx.fillStyle = ink;
  lobes(Math.max(2, R * 0.07));
  ctx.fillStyle = p.stun ? '#bfe6ff' : p.hurt ? '#ffb8e6' : '#ff9ad8';
  lobes(0);
  // folds (a centre fissure and a few squiggles), a shine, the neon rim
  ctx.strokeStyle = p.stun ? '#6fa8d8' : '#d1479f';
  ctx.lineWidth = Math.max(1.5, R * 0.07);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, by - R * 0.92);
  ctx.quadraticCurveTo(R * 0.08, by - R * 0.6, 0, by - R * 0.42);
  for (const s of [-1, 1]) {
    ctx.moveTo(s * R * 0.25, by - R * 0.75);
    ctx.bezierCurveTo(s * R * 0.55, by - R * 0.85, s * R * 0.35, by - R * 0.5, s * R * 0.7, by - R * 0.48);
    ctx.moveTo(s * R * 0.78, by - R * 0.2);
    ctx.bezierCurveTo(s * R * 1.0, by, s * R * 0.75, by + R * 0.2, s * R * 0.92, by + R * 0.4);
    ctx.moveTo(s * R * 0.5, by + R * 0.62);
    ctx.quadraticCurveTo(s * R * 0.7, by + R * 0.5, s * R * 0.78, by + R * 0.7);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(-R * 0.45, by - R * 0.55, R * 0.22, R * 0.11, -0.5, 0, TAU);
  ctx.fill();
  // the propeller thinking cap
  const capY = by - R * 0.82 + p.lift * R * 0.35;
  const capR = R * 0.4;
  const cols = ['#ff3ec8', '#3ff0ff', '#ffe14d', '#3ff0ff'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = cols[i];
    ctx.beginPath();
    ctx.moveTo(0, capY);
    ctx.arc(0, capY, capR, Math.PI + (i * Math.PI) / 4, Math.PI + ((i + 1) * Math.PI) / 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, capY, capR, Math.PI, TAU);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.fillRect(-1.5, capY - capR - R * 0.18, 3, R * 0.18);
  const spin = p.t * (p.stun ? 2 : p.hurt ? 30 : 9);
  const blade = Math.abs(Math.cos(spin)) * R * 0.55 + R * 0.06;
  ctx.fillStyle = Math.cos(spin) > 0 ? '#ffe14d' : '#ff7a33';
  ctx.beginPath();
  ctx.ellipse(0, capY - capR - R * 0.2, blade, R * 0.08, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // face: googly eyes, rosy cheeks, the big grin
  const er = R * 0.25;
  ctx.fillStyle = 'rgba(255,60,140,0.45)';
  ctx.beginPath();
  ctx.arc(-R * 0.62, by + R * 0.32, R * 0.12, 0, TAU);
  ctx.arc(R * 0.62, by + R * 0.32, R * 0.12, 0, TAU);
  ctx.fill();
  eyes(ctx, 0, by + R * 0.02, er, p, 1.12, ink);
  mouth(ctx, 0, by + R * 0.48, R * 0.3, p);
  if (p.stun) {
    // BRAIN FREEZE: snowflakes
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) star(ctx, Math.cos(p.t * 2 + i * 1.3) * R * 1.15, by + Math.sin(p.t * 2 + i * 1.3) * R * 0.85, Math.max(3, R * 0.1), 6);
  }
  // weak spot: the BIG IDEA, a golden lightbulb on a curly neuron at the weak-spot row
  if (!Number.isNaN(p.spotY)) {
    const sy = Math.max(-h / 2, Math.min(h / 2, p.spotY - cy));
    const r = Math.max(8, Math.min(w * 0.26, h * 0.095));
    const hx = -w / 2 + r * 0.45;
    rubberArm(ctx, -w * 0.04, Math.max(s0, Math.min(s1, sy)), hx + r * 0.9, sy, p.t, Math.max(3, w * 0.06), '#3ff0ff');
    glow(ctx, hx, sy, r, p);
    ctx.strokeStyle = `rgba(255,246,160,${0.5 + 0.5 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 0.55 + (i / 5) * Math.PI * 0.9;
      ctx.moveTo(hx + Math.cos(a) * r * 0.95, sy + Math.sin(a) * r * 0.95);
      ctx.lineTo(hx + Math.cos(a) * r * (1.25 + 0.15 * pulse), sy + Math.sin(a) * r * (1.25 + 0.15 * pulse));
    }
    ctx.stroke();
    ctx.fillStyle = '#b8b8c8';
    ctx.fillRect(hx + r * 0.5, sy - r * 0.3, r * 0.5, r * 0.6);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(hx + r * 0.5, sy - r * 0.3, r * 0.5, r * 0.6);
    ctx.beginPath();
    ctx.moveTo(hx + r * 0.67, sy - r * 0.3);
    ctx.lineTo(hx + r * 0.67, sy + r * 0.3);
    ctx.moveTo(hx + r * 0.84, sy - r * 0.3);
    ctx.lineTo(hx + r * 0.84, sy + r * 0.3);
    ctx.stroke();
    const lit = !(p.hurt && Math.floor(p.t * 30) % 2);
    ctx.fillStyle = lit ? '#ffe14d' : '#fffbe0';
    ctx.beginPath();
    ctx.arc(hx, sy, r * 0.7, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = '#ff7a33';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx + r * 0.45, sy - r * 0.12);
    for (let i = 0; i < 4; i++) ctx.lineTo(hx + r * (0.25 - i * 0.18), sy + (i % 2 ? r * 0.18 : -r * 0.18));
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx - r * 0.25, sy - r * 0.28, r * 0.15, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
};

// ---------------------------------------------------------------------------------------------
// Registry, entrances and defeat gags
// ---------------------------------------------------------------------------------------------

const DRAW: Record<string, DrawFn> = {
  calvin: drawHorse,
  decoy: drawMagician,
  buckle: drawBuckle,
  daly: drawCowboy,
  toosuccessful: drawRobot,
  alw: drawDiva,
  slackerman: drawGhost,
  cbb: drawClown,
  curry: drawVJ,
  dvorak: drawAngel,
  itm: drawBrain,
};

export function hasToon(modeId: string): boolean {
  return modeId in DRAW;
}

/** Entrance props drawn behind the character (parachute, hat, cake, rocket flames, car...). */
function entranceProps(ctx: Ctx, id: string, cx: number, cy: number, w: number, h: number, e: number, t: number, W: number): void {
  if (e >= 1) return;
  if (id === 'calvin') {
    // parachute canopy above the head
    const a = clamp01(1.4 - e * 1.4);
    ctx.save();
    ctx.globalAlpha *= a;
    const py = cy - h / 2 - w * 0.5;
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath();
    ctx.arc(cx, py, w * 0.75, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff4ec8';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, py);
      ctx.arc(cx, py, w * 0.75, Math.PI + (i * 2 + 0.5) * (Math.PI / 6), Math.PI + (i * 2 + 1.5) * (Math.PI / 6));
      ctx.fill();
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.75, py);
    ctx.lineTo(cx, cy - h / 2 + 4);
    ctx.lineTo(cx + w * 0.75, py);
    ctx.stroke();
    ctx.restore();
  } else if (id === 'toosuccessful') {
    ctx.fillStyle = Math.floor(t * 20) % 2 ? '#ffb000' : '#ff5a00';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * w * 0.25 - 6, cy + h / 2);
      ctx.lineTo(cx + s * w * 0.25, cy + h / 2 + 22 + Math.sin(t * 40) * 6);
      ctx.lineTo(cx + s * w * 0.25 + 6, cy + h / 2);
      ctx.fill();
    }
  } else if (id === 'dvorak') {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) star(ctx, cx + (hash(i) - 0.5) * w * 1.6, cy + (hash(i + 4) - 0.5) * h, 3 + 2 * Math.sin(t * 9 + i), 4);
  } else if (id === 'cbb' && e < 0.55) {
    // the tiny clown car putters in from the left
    const k = easeOut(e / 0.55);
    const x = -60 + (cx + 60) * k;
    const y = cy + h / 2 - 16;
    ctx.fillStyle = '#ff3b5c';
    ctx.beginPath();
    ctx.roundRect(x - 26, y - 14, 52, 20, 8);
    ctx.fill();
    ctx.fillStyle = '#7fffff';
    ctx.fillRect(x - 10, y - 24, 20, 12);
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(x - 15, y + 8, 7, 0, TAU);
    ctx.arc(x + 15, y + 8, 7, 0, TAU);
    ctx.fill();
    speech(ctx, 'HONK', x - 34, y - 30, 11, '#ffe14d');
    void W;
  } else if (id === 'itm') {
    // ULTRA CONSCIOUSNESS beams down in a neon tractor-beam column
    ctx.save();
    ctx.globalAlpha *= clamp01(1.6 - e * 1.6);
    const bot = cy + h / 2;
    ctx.fillStyle = 'rgba(63,240,255,0.16)';
    ctx.fillRect(cx - w * 0.75, 0, w * 1.5, bot);
    ctx.fillStyle = 'rgba(255,92,240,0.22)';
    ctx.fillRect(cx - w * 0.35, 0, w * 0.7, bot);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 6; i++) ctx.fillRect(cx - w * 0.75, (t * 420 + i * (bot / 6)) % Math.max(1, bot), w * 1.5, 2);
    ctx.restore();
  }
}

/** Props drawn in front of the character during the entrance (cake, top hat, curtains, static). */
function entranceFront(ctx: Ctx, id: string, cx: number, cy: number, w: number, h: number, e: number, t: number, W: number): void {
  if (e >= 1) return;
  if (id === 'decoy') {
    const a = clamp01(2 - e * 2);
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = '#111';
    ctx.fillRect(cx - w * 0.55, cy + h / 2 - w * 0.6, w * 1.1, w * 0.6);
    ctx.fillRect(cx - w * 0.75, cy + h / 2 - w * 0.65, w * 1.5, w * 0.12);
    ctx.fillStyle = '#e0002a';
    ctx.fillRect(cx - w * 0.55, cy + h / 2 - w * 0.5, w * 1.1, w * 0.1);
    ctx.restore();
    if (e > 0.55 && e < 0.85) speech(ctx, 'TA-DAA!', cx, cy - h / 2 - 10, 14, '#ffe14d');
  } else if (id === 'buckle') {
    const burst = e > 0.45;
    ctx.save();
    if (burst) ctx.globalAlpha *= clamp01(1 - (e - 0.45) * 2.5);
    const cw = w * 1.2;
    const ch = Math.min(h * 0.45, w * 0.9);
    const by = cy + h / 2;
    const fly = burst ? (e - 0.45) * 200 : 0;
    const cols = ['#ff9ecf', '#fff59d', '#9ef0ff'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = cols[i];
      const lw = cw * (1 - i * 0.2);
      ctx.fillRect(cx - lw / 2 + (i % 2 ? fly : -fly), by - ch * (i + 1) / 3 - fly * 0.3 * i, lw, ch / 3);
    }
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) ctx.fillRect(cx - cw * 0.25 + i * cw * 0.25 - 2, by - ch - 12 - fly, 4, 12);
    ctx.restore();
    if (burst && e < 0.8) speech(ctx, 'SURPRISE!', cx - w * 0.3, cy - h / 2 - 8, 15, '#ff3b8d');
  } else if (id === 'slackerman') {
    const open = easeOut(clamp01(e * 1.3));
    const cw = (w * 0.75 + 10) * (1 - open);
    ctx.fillStyle = '#b3001e';
    ctx.fillRect(cx - w * 0.75 - 10, cy - h / 2 - 20, cw, h + 30);
    ctx.fillRect(cx + w * 0.75 + 10 - cw, cy - h / 2 - 20, cw, h + 30);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(cx - w * 0.8 - 10, cy - h / 2 - 26, w * 1.6 + 20, 8);
    if (e > 0.2 && e < 0.7) speech(ctx, 'NOW SHOWING', cx, cy - h / 2 - 36, 12, '#ffd23f');
  } else if (id === 'curry') {
    ctx.save();
    ctx.globalAlpha *= clamp01(1.2 - e);
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = hash(i + Math.floor(t * 30) * 7) > 0.5 ? '#fff' : '#333';
      ctx.fillRect(cx - w / 2 + hash(i * 3 + Math.floor(t * 30)) * w, cy - h / 2 + hash(i * 5) * h, 4, 3);
    }
    ctx.restore();
  } else if (id === 'itm' && e > 0.55) {
    speechIn(ctx, 'BEHOLD: BIG BRAIN!', cx - w * 0.4, cy - h / 2 + brainR(w, h) * 0.2, 14, '#ff9ad8', W);
  } else if (id === 'daly' && e < 0.9) {
    speech(ctx, 'YEE-HAW?', cx - w * 0.6, cy - h / 2 + 10, 12, '#ffe14d');
  } else if (id === 'alw' && e > 0.6) {
    speech(ctx, 'LA LAAA!', cx - w * 0.7, cy - h / 2 + 18, 13, '#ff9ecf');
  }
}

/**
 * Entrance transform: offsets / rotation / scale for the character while it arrives.
 * Returns [dx, dy, rot, sx, sy, pivotY] (pivot relative to the box centre).
 */
function entranceXf(id: string, e: number, cx: number, cy: number, w: number, h: number, W: number): [number, number, number, number, number, number] {
  const above = -(cy + h * 0.6 + 40);
  switch (id) {
    case 'calvin':
      return [Math.sin(e * 9) * w * 0.2 * (1 - e), above * (1 - easeOut(e)), Math.sin(e * 9) * 0.15 * (1 - e), 1, 1, -h / 2];
    case 'decoy': {
      const k = backOut(clamp01((e - 0.1) / 0.6));
      return [0, h * (1 - k), 0, 1, 1, h / 2];
    }
    case 'buckle': {
      const k = backOut(clamp01((e - 0.35) / 0.5));
      return [0, h * 0.6 * (1 - k), 0, 1, Math.max(0.05, k), h / 2];
    }
    case 'daly': {
      const a = 1.5 * (1 - e) * (1 - e) * Math.cos(e * 7);
      const L = h * 1.1;
      return [Math.sin(a) * L, L * (1 - Math.cos(a)) * -0.6, a * 0.4, 1, 1, -h / 2];
    }
    case 'toosuccessful':
    case 'dvorak':
      return [0, above * (1 - easeOut(e)), 0, 1, 1, 0];
    case 'alw':
      return [0, above * (1 - backOut(e)), 0, 1, 1, -h / 2];
    case 'cbb': {
      if (e < 0.55) return [0, 0, 0, 0, 0, h / 2];
      const k = backOut(clamp01((e - 0.55) / 0.4));
      return [0, 0, 0, Math.max(0.05, k), Math.max(0.05, k), h / 2];
    }
    case 'curry':
      return [Math.sin(e * 80) * (1 - e) * 8, 0, 0, 1, 1, 0];
    case 'itm': {
      // beamed down stretched thin, then a squashy landing
      if (e < 0.6) {
        const k = easeOut(e / 0.6);
        return [0, above * (1 - k), 0, 1 - 0.45 * (1 - k), 1 + 0.6 * (1 - k), 0];
      }
      const q = (e - 0.6) / 0.4;
      const sq = Math.sin(q * Math.PI * 2) * 0.16 * (1 - q);
      return [0, 0, 0, 1 + sq, 1 - sq, h / 2];
    }
    default:
      return [(1 - e) * (W - cx + w), 0, 0, 1, 1, 0];
  }
}

/** Defeat transform (k = 0..1 through the exit). */
function defeatXf(id: string, k: number, cx: number, cy: number, w: number, h: number, W: number): [number, number, number, number, number, number, number] {
  // [dx, dy, rot, sx, sy, pivotY, alpha]
  switch (id) {
    case 'calvin':
      return [0, k * k * h * 0.3, 0, 1, 1 - k * 0.3, h / 2, 1 - clamp01((k - 0.7) / 0.3)];
    case 'decoy': {
      const s = Math.max(0, 1 - k / 0.3);
      return [0, 0, 0, s, s, h / 2, s > 0 ? 1 : 0];
    }
    case 'buckle': {
      const go = clamp01((k - 0.35) / 0.65);
      return [go * go * (W - cx + w * 2), -Math.abs(Math.sin(k * 14)) * h * 0.08, 0, 1, 1, h / 2, 1];
    }
    case 'daly': {
      const go = clamp01((k - 0.15) / 0.85);
      return [go * W * 0.45, -go * h * 1.2 + go * go * h * 0.3, go * 10, 1 - go * 0.6, 1 - go * 0.6, 0, 1 - clamp01((go - 0.8) / 0.2)];
    }
    case 'alw':
      return [0, k > 0.5 ? (k - 0.5) * (k - 0.5) * h * 4 : 0, Math.min(1, k * 2) * 0.5, 1, 1, -h / 2, 1 - clamp01((k - 0.75) / 0.25)];
    case 'slackerman':
      return [0, 0, 0, 1, 1, 0, 1];
    case 'cbb': {
      const go = clamp01((k - 0.3) / 0.7);
      return [-go * W * 0.7, -go * h * 0.9 + go * go * h * 0.2, -go * 9, 1 - go * 0.7, 1 - go * 0.7, -h * 0.3, 1 - clamp01((go - 0.85) / 0.15)];
    }
    case 'curry': {
      const sy = k < 0.45 ? Math.max(0.02, 1 - k / 0.45) : 0.02;
      const sx = k < 0.45 ? 1 : Math.max(0.01, 1 - (k - 0.45) / 0.35);
      return [0, 0, 0, sx, sy, 0, k > 0.85 ? 0 : 1];
    }
    case 'dvorak': {
      const go = clamp01((k - 0.4) / 0.6);
      return [Math.sin(k * 10) * w * 0.2 * go, -go * (cy + h), Math.sin(k * 8) * 0.2, 1, 1, 0, 1 - go * 0.6];
    }
    case 'itm': {
      // OVERTHINKING: it shakes, swells up... then MIND BLOWN (pops at k = 0.6)
      const shake = k < 0.6 ? Math.sin(k * 140) * w * 0.05 * (0.3 + k) : 0;
      const sw = k < 0.3 ? 1 : k < 0.6 ? 1 + ((k - 0.3) / 0.3) * 0.35 : Math.max(0.01, 1.35 * (1 - (k - 0.6) / 0.08));
      return [shake, 0, 0, sw, sw, 0, k < 0.68 ? 1 : 0];
    }
    default:
      return [0, 0, 0, 1, 1, 0, 1 - k];
  }
}

/** Defeat effects drawn on top (tears, ducks, Zzz, sunset, THE END, papers, BOOM...). */
function defeatFx(ctx: Ctx, id: string, k: number, cx: number, cy: number, w: number, h: number, t: number, W: number): void {
  if (k <= 0) return;
  switch (id) {
    case 'calvin': {
      // cry fountains from both eyes, arcing out, and a puddle
      ctx.fillStyle = '#7fd4ff';
      const hy = cy - h / 2 + Math.min(w * 0.36, h * 0.13) * 1.1;
      for (const s of [-1, 1])
        for (let i = 0; i < 10; i++) {
          const q = (t * 1.8 + i / 10) % 1;
          ctx.beginPath();
          ctx.arc(cx - w * 0.15 + s * q * w * 0.9, hy - Math.sin(q * Math.PI) * h * 0.18 + q * q * h * 0.2, 2.5, 0, TAU);
          ctx.fill();
        }
      ctx.globalAlpha *= 0.6;
      ctx.beginPath();
      ctx.ellipse(cx, cy + h / 2 + 4, w * (0.3 + k * 0.6), 5, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha /= 0.6;
      if (k < 0.6) speech(ctx, 'WAAAH!', cx, cy - h / 2 - 12, 14, '#7fd4ff');
      break;
    }
    case 'decoy': {
      if (k < 0.45) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        for (let i = 0; i < 7; i++) {
          ctx.beginPath();
          ctx.arc(cx + Math.cos(i) * w * 0.4 * (0.5 + k * 2), cy + Math.sin(i * 1.7) * h * 0.25, w * 0.25 * (1 - k * 1.5), 0, TAU);
          ctx.fill();
        }
        speech(ctx, 'POOF!', cx, cy - h * 0.2, 18, '#b48cff');
      }
      for (let i = 0; i < 7; i++) {
        const q = clamp01((k - 0.15) * 1.6);
        const x = cx + (hash(i) - 0.5) * w * 2.5 * q;
        const y = cy + h * 0.2 - Math.abs(Math.sin(q * 6 + i)) * h * 0.25 * (1 - q) + q * h * 0.1;
        duck(ctx, x, y, Math.max(6, w * 0.13), Math.sin(t * 6 + i) * 0.3);
      }
      confetti(ctx, cx, cy, clamp01(k * 1.5), 30, w * 1.4, 3);
      break;
    }
    case 'buckle':
      if (k > 0.1 && k < 0.6) speech(ctx, 'OH NO, MY PANTS!', Math.max(80, cx - w * 0.6), cy - h / 2 - 10, 13, '#ff3b8d');
      break;
    case 'daly':
      ctx.save();
      ctx.globalAlpha *= clamp01(k * 2) * 0.7;
      ctx.fillStyle = '#ff7a33';
      ctx.beginPath();
      ctx.arc(Math.min(W - 30, cx + w), cy + h / 2, w * 0.9, Math.PI, TAU);
      ctx.fill();
      ctx.restore();
      if (k < 0.7) speech(ctx, 'HAPPY TRAILS!', cx - w * 0.3, cy - h / 2 - 12, 13, '#ffe14d');
      break;
    case 'toosuccessful': {
      // bolts and coins spilling out
      for (let i = 0; i < 16; i++) {
        const q = clamp01(k * 1.4 - hash(i) * 0.3);
        const x = cx + (hash(i + 2) - 0.5) * w * 2 * q;
        const y = cy - h * 0.2 + (q * q * 1.4 - q * 0.5) * h;
        ctx.fillStyle = i % 2 ? '#ffd23f' : '#cfcfd8';
        ctx.beginPath();
        if (i % 2) ctx.ellipse(x, y, 5, 5 * Math.abs(Math.cos(t * 8 + i)), 0, 0, TAU);
        else for (let j = 0; j < 6; j++) ctx.lineTo(x + Math.cos(j * 1.05) * 4, y + Math.sin(j * 1.05) * 4);
        ctx.fill();
      }
      if (k < 0.6) speech(ctx, 'CLANK! CLONK! TINKLE.', cx - w * 0.2, cy - h / 2 - 12, 12, '#ffd23f');
      break;
    }
    case 'alw':
      // roses raining from the gallery
      for (let i = 0; i < 12; i++) {
        const q = (k * 1.6 + hash(i)) % 1;
        const x = cx + (hash(i + 7) - 0.5) * w * 2.2;
        const y = cy - h / 2 - 30 + q * h * 1.1;
        ctx.fillStyle = '#e0002a';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#2e9e3a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y + 3);
        ctx.lineTo(x + 3, y + 12);
        ctx.stroke();
      }
      if (k < 0.55) speech(ctx, '*SWOON*', cx - w * 0.5, cy - h / 2 - 8, 14, '#ff9ecf');
      break;
    case 'slackerman': {
      // lights dim, Zzz rise, THE END card
      ctx.fillStyle = `rgba(0,0,20,${Math.min(0.55, k * 0.9)})`;
      ctx.fillRect(cx - w * 0.6, cy - h / 2 - 10, w * 1.2, h + 20);
      for (let i = 0; i < 3; i++) {
        const q = (t * 0.7 + i / 3) % 1;
        speech(ctx, 'Z', cx + w * 0.1 + q * w * 0.4, cy - h * 0.3 - q * h * 0.3, 10 + q * 10, '#b4c8ff');
      }
      if (k > 0.45) {
        const a = clamp01((k - 0.45) * 4);
        ctx.save();
        ctx.globalAlpha *= a;
        ctx.fillStyle = '#000';
        ctx.fillRect(cx - w * 0.7, cy - 22, w * 1.4, 44);
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - w * 0.7, cy - 22, w * 1.4, 44);
        ctx.font = `italic 700 ${Math.max(14, w * 0.2)}px 'Times New Roman', Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(tp('The End'), cx, cy + 1);
        ctx.restore();
      }
      break;
    }
    case 'cbb':
      if (k > 0.25) confetti(ctx, cx - w * 0.4, cy - h * 0.3, clamp01((k - 0.25) * 1.5), 40, w * 1.8, 5);
      if (k > 0.25 && k < 0.65) speech(ctx, 'KA-BOOOOM!', cx - w * 0.3, cy - h * 0.35, 18, '#ffe14d');
      break;
    case 'curry':
      if (k > 0.45 && k < 0.95) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx, cy, 3 + 4 * (1 - k), 0, TAU);
        ctx.fill();
      }
      if (k < 0.5) speech(ctx, 'PLEASE STAND BY', cx - w * 0.2, cy - h / 2 - 12, 12, '#7fffff');
      break;
    case 'dvorak':
      if (k < 0.45) {
        // his own halo drops onto his head
        const q = clamp01(k / 0.3);
        const hy = cy - h / 2 + Math.min(w * 0.3, h * 0.12) * 0.6;
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(cx, hy - (1 - q) * h * 0.6, w * 0.22, w * 0.07, 0, 0, TAU);
        ctx.stroke();
        if (q >= 1) speech(ctx, 'BONK! FINE. YOU WIN. (I DISAGREE.)', Math.max(150, cx - w), hy - 20, 11, '#ffe14d');
      }
      break;
    case 'itm': {
      const R = brainR(w, h);
      const by = cy - h / 2 + R * 1.3;
      if (k < 0.6) {
        // crackling sparks and steam while it overthinks
        ctx.strokeStyle = '#7fffff';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          if (hash(i + Math.floor(t * 18) * 7) < 0.45) continue;
          const a = (i / 6) * TAU + t;
          let x = cx + Math.cos(a) * R * 0.9;
          let y = by + Math.sin(a) * R * 0.7;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let j = 0; j < 3; j++) {
            x += Math.cos(a) * R * 0.22 + (j % 2 ? 5 : -5);
            y += Math.sin(a) * R * 0.22 + (j % 2 ? -5 : 5);
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(255,255,255,${0.5 * clamp01(k * 4)})`;
        for (let i = 0; i < 4; i++) {
          const q = (t * 0.9 + i / 4) % 1;
          ctx.beginPath();
          ctx.arc(cx + (i - 1.5) * R * 0.4, by - R * (1.1 + q), R * (0.12 + q * 0.18), 0, TAU);
          ctx.fill();
        }
        if (k > 0.08) speechIn(ctx, 'OVERTHINKING...', cx - w * 0.3, by + R * 1.45, 13, '#7fffff', W);
      } else {
        const q = clamp01((k - 0.6) / 0.4);
        ctx.strokeStyle = `rgba(255,92,240,${1 - q})`;
        ctx.lineWidth = 2 + 8 * (1 - q);
        ctx.beginPath();
        ctx.arc(cx, by, R * (1 + q * 4), 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(63,240,255,${1 - q})`;
        ctx.lineWidth = 2 + 4 * (1 - q);
        ctx.beginPath();
        ctx.arc(cx, by, R * (0.6 + q * 2.6), 0, TAU);
        ctx.stroke();
        confetti(ctx, cx, by, q, 46, w * 2.2, 11);
        // little lightbulbs (ideas) everywhere
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + 0.3;
          const v = 0.6 + hash(i + 40) * 0.6;
          const x = cx + Math.cos(a) * q * v * Math.max(w * 1.4, R * 3);
          const y = by + Math.sin(a) * q * v * R * 2.4 + q * q * R * 1.5;
          ctx.fillStyle = '#ffe14d';
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#b8b8c8';
          ctx.fillRect(x - 2.5, y + 4, 5, 4);
        }
        // the propeller cap flies off, spinning
        ctx.save();
        ctx.translate(cx + q * w * 0.5, by - R - q * Math.max(h * 0.5, R * 4));
        ctx.rotate(q * 9);
        ctx.fillStyle = '#ff3ec8';
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.4, Math.PI, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffe14d';
        ctx.fillRect(-R * 0.5, -R * 0.55, R, R * 0.12);
        ctx.restore();
        if (q < 0.9) speechIn(ctx, 'MIND BLOWN!', cx - w * 0.4, by - R * 0.4, 18, '#ffe14d', W);
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Draw one boss board as its cartoon. The board rect is the hit box; the weak spot is drawn
 * at the spot-row height. Handles the entrance, slapstick reactions, stun and the defeat gag.
 */
export function drawToon(ctx: Ctx, f: BossFight, b: Board, idx: number, time: number, W: number): void {
  const id = f.def.modeId;
  const fn = DRAW[id];
  if (!fn) return;
  const w = wobble(f, b, time);
  const enter = f.state === 'enter' ? clamp01(f.stateT / (f.enterS * 0.85)) : 1;
  const beaten = f.state === 'defeated' ? clamp01(f.stateT / f.exitS) : f.state === 'gone' ? 1 : 0;
  const rowH = b.h / b.rows;
  const p: Pose = {
    t: time + b.bob,
    enter,
    beaten,
    hurt: f.hurtT > 0.12 && f.state === 'fight',
    stun: f.stunned,
    px: w.px,
    py: w.py,
    lift: w.lift,
    spotY: f.active ? w.spotY : NaN,
    glow: f.active && b.real,
    real: b.real,
    idx,
    slam: f.slam,
    swapAge: time - w.swapAt,
  };
  void rowH;
  const cx = b.x;
  const cy = b.y;
  ctx.save();
  if (enter < 1) entranceProps(ctx, id, cx, cy, b.w, b.h, enter, time, W);
  ctx.save();
  let [dx, dy, rot, sx, sy, pv] = enter < 1 ? entranceXf(id, enter, cx, cy, b.w, b.h, W) : [0, 0, 0, 1, 1, 0];
  let alpha = 1;
  if (beaten > 0) [dx, dy, rot, sx, sy, pv, alpha] = defeatXf(id, beaten, cx, cy, b.w, b.h, W);
  // slapstick hit wobble
  if (p.hurt) rot += Math.sin(time * 45) * 0.04;
  ctx.globalAlpha *= Math.max(0, alpha);
  ctx.translate(cx + dx, cy + dy + pv);
  ctx.rotate(rot);
  ctx.scale(sx, sy);
  ctx.translate(-cx, -cy - pv);
  // (no ctx.filter: even setting it to 'none' knocks canvas drawing off the fast path)
  if (id === 'toosuccessful' && beaten > 0.35) {
    // GOLDBOT falls apart: top half topples one way, treads roll the other
    const q = clamp01((beaten - 0.35) / 0.65);
    for (const half of [0, 1]) {
      ctx.save();
      ctx.beginPath();
      if (half === 0) ctx.rect(cx - b.w * 2, cy - b.h * 2, b.w * 4, b.h * 2);
      else ctx.rect(cx - b.w * 2, cy, b.w * 4, b.h * 2);
      ctx.clip();
      if (half === 0) {
        ctx.translate(-q * b.w * 0.8, q * q * b.h * 0.5);
        ctx.rotate(-q * 0.8);
      } else ctx.translate(q * b.w * 0.6, 0);
      fn(ctx, cx, cy, b.w, b.h, p);
      ctx.restore();
    }
  } else fn(ctx, cx, cy, b.w, b.h, p);
  ctx.restore();
  if (enter < 1) entranceFront(ctx, id, cx, cy, b.w, b.h, enter, time, W);
  // magician swap POOF
  if (id === 'decoy' && p.swapAge < 0.35 && f.state === 'fight') {
    ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - p.swapAge / 0.35)})`;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(cx + Math.cos(i) * b.w * 0.4, cy + Math.sin(i * 1.3) * b.h * 0.3, b.w * 0.22, 0, TAU);
      ctx.fill();
    }
    speech(ctx, 'POOF!', cx, cy - b.h / 2 - 8, 13, '#b48cff');
  }
  if (beaten > 0 && idx === 0) defeatFx(ctx, id, beaten, cx, cy, b.w, b.h, time, W);
  if (beaten > 0 && idx === 1 && id === 'calvin') defeatFx(ctx, id, beaten, cx, cy, b.w, b.h, time + 0.5, W);
  if (p.stun && beaten <= 0) {
    // dizzy birdies circling his head
    for (let i = 0; i < 3; i++) {
      const a = time * 4 + (i * TAU) / 3;
      const x = cx + Math.cos(a) * b.w * 0.4;
      const y = cy - b.h / 2 - 6 + Math.sin(a) * 6;
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff8c1a';
      ctx.fillRect(x + 3, y - 1, 3, 2);
    }
  }
  ctx.restore();
}

/** Group-photo pose (neutral, smiling) for the polaroid. */
export function drawToonMini(ctx: Ctx, modeId: string, x: number, y: number, w: number, h: number, t: number): boolean {
  const fn = DRAW[modeId];
  if (!fn) return false;
  const p: Pose = { t, enter: 1, beaten: 0, hurt: false, stun: false, px: Math.sin(t * 3) * 0.5, py: 0.4, lift: 0, spotY: NaN, glow: false, real: true, idx: 0, slam: 0, swapAge: 9 };
  ctx.save();
  if (modeId === 'itm') fn(ctx, x, y + h * 0.05, w * 1.15, h * 0.95, p);
  else fn(ctx, x, y, w, h, p);
  ctx.restore();
  return true;
}

// ---------------------------------------------------------------------------------------------
// Projectiles: visual-only skins (physics and hit radius unchanged). No digits anywhere.
// ---------------------------------------------------------------------------------------------

/** pattern -> skin per boss; plus the skin for shots spawned by other shots (split pieces, behind shots). */
export const TOON_SKINS: Record<string, { [pattern: string]: string }> = {
  calvin: { aimed: 'shoe', wall: 'hay', spray: 'carrot' },
  decoy: { aimed: 'card', spray: 'dove', wall: 'hanky' },
  buckle: { buckles: 'buckle', slam: 'disco', aimed: 'sock' },
  daly: { aimed: 'beans' },
  toosuccessful: { rain: 'coin', aimed: 'goldbar', wall: 'moneybag' },
  alw: { kick: 'mask', wall: 'rose', aimed: 'note' },
  slackerman: { blink: 'popcorn', spray: 'soda', wall: 'reel' },
  cbb: { split: 'bomb', aimed: 'whoopee', wall: 'flamingo', '>split': 'duck' },
  curry: { countdown: 'tape', homing: 'plane' },
  dvorak: { aimed: 'harp', wall: 'cloud', '>warn': 'feather' },
  itm: { aimed: 'bulb', spray: 'qmark' },
};

/** Draw a skinned shot. Returns false when the shot has no skin (default drawing applies). */
export function drawToonShot(ctx: Ctx, s: BossShot, solid: boolean, time: number): boolean {
  const skin = s.skin;
  if (!skin) return false;
  const r = s.r;
  ctx.save();
  ctx.translate(s.x, s.y);
  if (!solid) ctx.globalAlpha *= 0.3;
  const spin = s.t * 7;
  const ink = '#140022';
  ctx.lineJoin = 'round';
  // a soft danger halo so every hazard reads against busy backgrounds
  ctx.fillStyle = 'rgba(255,60,90,0.22)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.35, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  switch (skin) {
    case 'shoe':
      ctx.rotate(spin);
      ctx.strokeStyle = '#cfcfd8';
      ctx.lineWidth = r * 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.75, Math.PI * 0.8, Math.PI * 2.2);
      ctx.stroke();
      break;
    case 'hay':
      ctx.fillStyle = '#e8c25a';
      ctx.fillRect(-r * 1.1, -r * 0.8, r * 2.2, r * 1.6);
      ctx.strokeRect(-r * 1.1, -r * 0.8, r * 2.2, r * 1.6);
      ctx.strokeStyle = '#a0723c';
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, -r * 0.8);
      ctx.lineTo(-r * 0.4, r * 0.8);
      ctx.moveTo(r * 0.4, -r * 0.8);
      ctx.lineTo(r * 0.4, r * 0.8);
      ctx.stroke();
      break;
    case 'carrot':
      ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(-r * 0.8, -r * 0.6);
      ctx.lineTo(-r * 0.8, r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3ecf4a';
      ctx.fillRect(-r * 1.3, -r * 0.4, r * 0.5, r * 0.8);
      break;
    case 'card':
      ctx.rotate(spin * 0.7);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-r * 0.75, -r, r * 1.5, r * 2);
      ctx.strokeRect(-r * 0.75, -r, r * 1.5, r * 2);
      ctx.fillStyle = '#e0002a';
      ctx.beginPath();
      ctx.moveTo(0, r * 0.5);
      ctx.bezierCurveTo(-r * 0.7, 0, -r * 0.3, -r * 0.6, 0, -r * 0.2);
      ctx.bezierCurveTo(r * 0.3, -r * 0.6, r * 0.7, 0, 0, r * 0.5);
      ctx.fill();
      break;
    case 'dove': {
      const flap = Math.sin(time * 20 + s.x) * 0.6;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(r * 0.2, -r * 0.4, r * 0.8, r * 0.3, -0.6 - flap, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff8c1a';
      ctx.fillRect(-r * 1.25, -r * 0.1, r * 0.35, r * 0.2);
      break;
    }
    case 'hanky': {
      const cols = ['#ff4ec8', '#ffe14d', '#7fffff'];
      ctx.rotate(Math.sin(time * 6 + s.y) * 0.4);
      ctx.fillStyle = cols[Math.floor(Math.abs(s.y)) % 3];
      ctx.beginPath();
      ctx.moveTo(-r, -r);
      ctx.quadraticCurveTo(0, -r * 0.6, r, -r);
      ctx.quadraticCurveTo(r * 0.6, 0, r, r);
      ctx.quadraticCurveTo(0, r * 0.6, -r, r);
      ctx.quadraticCurveTo(-r * 0.6, 0, -r, -r);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'buckle':
      ctx.rotate(spin * 1.4);
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 3;
      ctx.strokeRect(-r, -r * 0.7, r * 2, r * 1.4);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-1.5, -r * 0.7, 3, r * 1.4);
      break;
    case 'disco': {
      ctx.fillStyle = '#c8d0e0';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = hash(i + Math.floor(time * 8)) > 0.6 ? '#fff' : '#7a86a0';
        ctx.fillRect(-r * 0.6 + (i % 3) * r * 0.4, -r * 0.6 + Math.floor(i / 3) * r * 0.4, r * 0.35, r * 0.35);
      }
      break;
    }
    case 'sock':
      ctx.rotate(spin);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, -r);
      ctx.lineTo(r * 0.2, -r);
      ctx.lineTo(r * 0.2, r * 0.3);
      ctx.lineTo(r, r * 0.4);
      ctx.lineTo(r, r);
      ctx.lineTo(-r * 0.4, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff3b8d';
      ctx.fillRect(-r * 0.4, -r, r * 0.6, r * 0.3);
      break;
    case 'beans':
      ctx.rotate(spin);
      ctx.fillStyle = '#cfcfd8';
      ctx.fillRect(-r * 0.7, -r, r * 1.4, r * 2);
      ctx.strokeRect(-r * 0.7, -r, r * 1.4, r * 2);
      ctx.fillStyle = '#c4422a';
      ctx.fillRect(-r * 0.7, -r * 0.45, r * 1.4, r * 0.9);
      break;
    case 'coin':
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * Math.max(0.25, Math.abs(Math.cos(time * 6 + s.x * 0.05))), r, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#a86b00';
      ctx.stroke();
      ctx.fillStyle = '#a86b00';
      ctx.font = `900 ${r * 1.2}px 'Orbitron', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 1);
      break;
    case 'goldbar':
      ctx.rotate(spin * 0.6);
      ctx.fillStyle = '#ffc400';
      ctx.beginPath();
      ctx.moveTo(-r * 1.1, r * 0.5);
      ctx.lineTo(r * 1.1, r * 0.5);
      ctx.lineTo(r * 0.7, -r * 0.5);
      ctx.lineTo(-r * 0.7, -r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 'moneybag':
      ctx.fillStyle = '#c9a66b';
      ctx.beginPath();
      ctx.arc(0, r * 0.15, r * 0.9, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(-r * 0.3, -r * 1.0, r * 0.6, r * 0.4);
      ctx.fillStyle = '#2e7d32';
      ctx.font = `900 ${r * 1.1}px 'Orbitron', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, r * 0.2);
      break;
    case 'mask':
      ctx.rotate(Math.sin(time * 8 + s.y) * 0.3);
      ctx.fillStyle = Math.floor(s.y) % 2 ? '#e8e8ff' : '#ffd0e0';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.85, r, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.25, r * 0.18, 0, TAU);
      ctx.arc(r * 0.35, -r * 0.25, r * 0.18, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, r * 0.2, r * 0.35, 0.2, Math.PI - 0.2);
      ctx.stroke();
      break;
    case 'rose':
      ctx.strokeStyle = '#2e9e3a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(r * 1.2, r * 0.6);
      ctx.stroke();
      ctx.fillStyle = '#e0002a';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.stroke();
      ctx.strokeStyle = '#8a0018';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, Math.PI * 1.5);
      ctx.stroke();
      break;
    case 'note':
      ctx.rotate(Math.sin(time * 9 + s.x) * 0.3);
      ctx.fillStyle = '#ff9ecf';
      ctx.beginPath();
      ctx.ellipse(-r * 0.3, r * 0.5, r * 0.55, r * 0.4, -0.4, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(r * 0.1, -r * 1.1, r * 0.25, r * 1.6);
      ctx.beginPath();
      ctx.moveTo(r * 0.35, -r * 1.1);
      ctx.quadraticCurveTo(r * 1.2, -r * 0.7, r * 0.8, -r * 0.1);
      ctx.lineTo(r * 0.35, -r * 0.6);
      ctx.fill();
      break;
    case 'popcorn':
      ctx.fillStyle = '#fff6c0';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(Math.cos(i * 1.6) * r * 0.45, Math.sin(i * 1.6) * r * 0.45, r * 0.55, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = solid ? '#ffb000' : '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
      break;
    case 'soda':
      ctx.rotate(spin * 0.8);
      ctx.fillStyle = '#e0002a';
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r);
      ctx.lineTo(r * 0.7, -r);
      ctx.lineTo(r * 0.5, r);
      ctx.lineTo(-r * 0.5, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-r * 0.6, -r * 0.2, r * 1.2, r * 0.3);
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(r * 0.2, -r);
      ctx.lineTo(r * 0.5, -r * 1.6);
      ctx.stroke();
      break;
    case 'reel':
      ctx.rotate(spin);
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ccc';
      ctx.stroke();
      ctx.fillStyle = '#ccc';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(Math.cos((i * TAU) / 5) * r * 0.55, Math.sin((i * TAU) / 5) * r * 0.55, r * 0.2, 0, TAU);
        ctx.fill();
      }
      break;
    case 'bomb': {
      ctx.fillStyle = '#ff4ec8';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffe14d';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(Math.cos(i) * r * 0.55, Math.sin(i * 1.7) * r * 0.55, r * 0.12, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = '#c99a5b';
      ctx.beginPath();
      ctx.moveTo(r * 0.5, -r * 0.8);
      ctx.quadraticCurveTo(r * 0.9, -r * 1.4, r * 0.5, -r * 1.6);
      ctx.stroke();
      ctx.fillStyle = Math.floor(time * 20) % 2 ? '#fff' : '#ffb000';
      star(ctx, r * 0.5, -r * 1.6, r * 0.35, 4);
      break;
    }
    case 'duck':
      duck(ctx, 0, 0, r * 0.95, Math.sin(time * 10 + s.x) * 0.3);
      break;
    case 'whoopee':
      ctx.rotate(spin * 0.5);
      ctx.fillStyle = '#ff7ac8';
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.75, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(r * 0.8, -r * 0.2, r * 0.5, r * 0.4);
      break;
    case 'flamingo':
      ctx.fillStyle = '#ff7ac8';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.2, r * 0.9, r * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#ff7ac8';
      ctx.lineWidth = r * 0.3;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, 0);
      ctx.quadraticCurveTo(-r * 1.1, -r * 0.8, -r * 0.6, -r * 1.1);
      ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.fillRect(-r * 0.95, -r * 1.15, r * 0.35, r * 0.15);
      break;
    case 'tape':
      ctx.rotate(Math.sin(s.t * 3) * 0.3);
      ctx.fillStyle = '#222';
      ctx.fillRect(-r * 1.2, -r * 0.75, r * 2.4, r * 1.5);
      ctx.strokeStyle = '#ff4ec8';
      ctx.strokeRect(-r * 1.2, -r * 0.75, r * 2.4, r * 1.5);
      ctx.fillStyle = '#ffe14d';
      ctx.fillRect(-r * 0.95, -r * 0.6, r * 1.9, r * 0.4);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-r * 0.5, r * 0.2, r * 0.25, 0, TAU);
      ctx.arc(r * 0.5, r * 0.2, r * 0.25, 0, TAU);
      ctx.fill();
      break;
    case 'plane':
      ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(-r, -r * 0.8);
      ctx.lineTo(-r * 0.5, 0);
      ctx.lineTo(-r, r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3bc8ff';
      ctx.stroke();
      break;
    case 'harp':
      ctx.rotate(spin * 0.5);
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, r);
      ctx.lineTo(-r * 0.6, -r);
      ctx.quadraticCurveTo(r, -r, r * 0.6, r);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.3 + i * r * 0.3, -r * 0.7);
        ctx.lineTo(-r * 0.3 + i * r * 0.3, r);
        ctx.stroke();
      }
      break;
    case 'cloud':
      ctx.fillStyle = '#f0f4ff';
      ctx.beginPath();
      ctx.arc(-r * 0.5, r * 0.1, r * 0.6, 0, TAU);
      ctx.arc(r * 0.5, r * 0.1, r * 0.6, 0, TAU);
      ctx.arc(0, -r * 0.3, r * 0.7, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#7a86a0';
      ctx.stroke();
      break;
    case 'feather':
      ctx.rotate(Math.sin(time * 6 + s.y) * 0.5);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.2, r * 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 1.2, 0);
      ctx.lineTo(r * 1.2, 0);
      ctx.stroke();
      break;
    case 'bulb':
      // a lightbulb: a bright idea, thrown
      ctx.rotate(spin * 0.5);
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.arc(0, -r * 0.15, r * 0.78, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#b8b8c8';
      ctx.fillRect(-r * 0.36, r * 0.52, r * 0.72, r * 0.5);
      ctx.strokeRect(-r * 0.36, r * 0.52, r * 0.72, r * 0.5);
      ctx.strokeStyle = '#ff7a33';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, -r * 0.1);
      ctx.lineTo(-r * 0.12, -r * 0.35);
      ctx.lineTo(r * 0.05, -r * 0.1);
      ctx.lineTo(r * 0.22, -r * 0.35);
      ctx.stroke();
      break;
    case 'qmark':
      // a thought bubble with a question mark in it
      for (const [pad, col] of [[2, '#7b2cff'], [0, '#ffffff']] as const) {
        ctx.fillStyle = col;
        ctx.beginPath();
        for (const [bx, by, br] of [[-r * 0.42, r * 0.12, r * 0.6], [r * 0.42, r * 0.12, r * 0.6], [0, -r * 0.28, r * 0.72]]) {
          ctx.moveTo(bx + br + pad, by);
          ctx.arc(bx, by, br + pad, 0, TAU);
        }
        ctx.moveTo(r * 0.95 + r * 0.22 + pad, r * 0.85);
        ctx.arc(r * 0.95, r * 0.85, r * 0.22 + pad, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#7b2cff';
      ctx.font = `900 ${Math.max(9, r * 1.25)}px 'Orbitron', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, -r * 0.05);
      break;
    default:
      ctx.restore();
      return false;
  }
  ctx.restore();
  return true;
}

/** Per-boss slapstick hit words (with SFX) and the stun word. */
export const TOON_POPS: Record<string, { hit: [string, 'honk' | 'boing' | 'whistleUp' | 'whistleDown'][]; stun: string }> = {
  calvin: { hit: [['NEIGH!', 'honk'], ['BONK!', 'boing'], ['WHINNY!', 'whistleUp']], stun: 'HOOF-DIZZY!' },
  decoy: { hit: [['ABRACA-OUCH!', 'boing'], ['BONK!', 'honk'], ['PRESTO-NO!', 'whistleDown']], stun: 'HYPNOTIZED!' },
  buckle: { hit: [['POP!', 'boing'], ['SNAP!', 'honk'], ['RIIIP!', 'whistleDown']], stun: 'DISCO DIZZY!' },
  daly: { hit: [['YEE-OUCH!', 'whistleUp'], ['BONK!', 'honk'], ['BOING!', 'boing']], stun: 'HAT IN EYES!' },
  toosuccessful: { hit: [['CLANK!', 'honk'], ['BZZT!', 'boing'], ['KA-CHING!', 'whistleUp']], stun: 'SHORT CIRCUIT!' },
  alw: { hit: [['HIGH C!', 'whistleUp'], ['OH-PERA!', 'boing'], ['BONK!', 'honk']], stun: 'CURTAIN CALL!' },
  slackerman: { hit: [['BOO-HOO!', 'whistleDown'], ['SHHH!', 'boing'], ['BONK!', 'honk']], stun: 'INTERMISSION!' },
  cbb: { hit: [['HONK HONK!', 'honk'], ['SQUEAK!', 'boing'], ['PFFFT!', 'whistleDown']], stun: 'DUD!' },
  curry: { hit: [['ZZZAP!', 'boing'], ['STATIC!', 'whistleDown'], ['RADICAL!', 'honk']], stun: 'TECHNICAL DIFFICULTIES!' },
  dvorak: { hit: [['HMPH!', 'honk'], ['WRONG!', 'boing'], ['BONK!', 'whistleUp']], stun: 'AGREES (BRIEFLY)!' },
  itm: { hit: [['ZAP!', 'boing'], ['MY NEURONS!', 'honk'], ['FORGOT!', 'whistleDown']], stun: 'BRAIN FREEZE!' },
};

// ---------------------------------------------------------------------------------------------
// ULTRA CONSCIOUSNESS: thought waves and psychic beams (drawn by drawBoss before other shots)
// ---------------------------------------------------------------------------------------------

/** Canvas angle of a wave angle (wave angles: 0 = straight left, positive = down). */
const phi = (a: number): number => Math.PI - a;

/**
 * Wave angles (0 = straight left, positive = down) where a ring of radius `rad` about (x, y)
 * enters and leaves the safe corridor gy +- gh/2 (equal when the ring doesn't reach it).
 */
function gapAngles(y: number, rad: number, gy: number, gh: number): [number, number] {
  const c = (v: number) => Math.max(-1, Math.min(1, v));
  return [Math.asin(c((gy - gh / 2 - y) / Math.max(1, rad))), Math.asin(c((gy + gh / 2 - y) / Math.max(1, rad)))];
}

/** Stroke the ring's two arcs (the left half-plane minus the safe corridor). */
function waveArcs(ctx: Ctx, x: number, y: number, rad: number, gy: number, gh: number): void {
  const [a1, a2] = gapAngles(y, rad, gy, gh);
  if (a2 - a1 < 1e-4) {
    ctx.beginPath();
    ctx.arc(x, y, rad, Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    return;
  }
  if (a2 < Math.PI / 2 - 1e-4) {
    ctx.beginPath();
    ctx.arc(x, y, rad, Math.PI / 2, phi(a2));
    ctx.stroke();
  }
  if (a1 > -Math.PI / 2 + 1e-4) {
    ctx.beginPath();
    ctx.arc(x, y, rad, phi(a1), Math.PI * 1.5);
    ctx.stroke();
  }
}

/**
 * Draw a thought wave / psychic beam (true) or leave the shot to the default drawing (false).
 * Telegraphs: a wave's path is drawn dashed (ghost rings) with its safe corridor shaded and
 * bracketed in mint on the pack's column while the brain charges;
 * a beam's lane is outlined and flickers, with a red "!" at the left edge, before it fires.
 */
function drawMindShot(ctx: Ctx, f: BossFight, s: BossShot, W: number, u: (n: number) => number, time: number, lite: boolean): boolean {
  if (s.kind !== 'wave' && s.kind !== 'beam') return false;
  const { top, bottom } = f.lane;
  const blink = Math.floor(time * 14) % 2;
  const pulse = 0.5 + 0.5 * Math.sin(time * 16);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, W, bottom - top);
  ctx.clip();
  if (s.spent) ctx.globalAlpha *= 0.3;
  if (s.kind === 'wave') {
    const tele = Math.max(0.01, s.tele ?? 0.9);
    const gx = s.gx ?? 0;
    const gy = s.gy ?? 0;
    const gh = s.gh ?? 0;
    const D = Math.hypot(s.x - gx, s.y - gy);
    const rad = s.rad ?? 0;
    const passed = rad > D + s.r * 2 + 40;
    if (!passed) {
      // the safe corridor, shaded across the lane up to the brain
      ctx.fillStyle = `rgba(125,255,155,${s.t < 0 ? 0.13 + 0.07 * pulse : 0.08})`;
      ctx.fillRect(0, gy - gh / 2, s.x, gh);
      // ...with its edges ruled across the whole lane (readable wherever the pack and HUD are)
      ctx.strokeStyle = `rgba(125,255,155,${s.t < 0 ? 0.6 + 0.3 * pulse : 0.4})`;
      ctx.lineWidth = Math.max(2, u(2.5));
      ctx.setLineDash([u(12), u(8)]);
      ctx.lineDashOffset = time * 60;
      for (const e of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, gy + (e * gh) / 2);
        ctx.lineTo(s.x, gy + (e * gh) / 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // the gap's brackets on the pack's column
      const bw = u(14);
      ctx.strokeStyle = `rgba(125,255,155,${0.65 + 0.35 * pulse})`;
      ctx.lineWidth = Math.max(2.5, u(3));
      ctx.lineCap = 'round';
      for (const e of [-1, 1]) {
        const y0 = gy + (e * gh) / 2;
        ctx.beginPath();
        ctx.moveTo(gx - bw, y0 - e * u(8));
        ctx.lineTo(gx - bw, y0);
        ctx.lineTo(gx + bw, y0);
        ctx.lineTo(gx + bw, y0 - e * u(8));
        ctx.stroke();
      }
      // chevrons pointing into the gap from either side
      ctx.fillStyle = `rgba(125,255,155,${0.55 + 0.45 * pulse})`;
      for (const e of [-1, 1]) {
        const x0 = gx + e * (bw + u(10) + pulse * u(4));
        ctx.beginPath();
        ctx.moveTo(x0, gy);
        ctx.lineTo(x0 + e * u(9), gy - u(7));
        ctx.lineTo(x0 + e * u(9), gy + u(7));
        ctx.closePath();
        ctx.fill();
      }
    }
    if (s.t < 0) {
      // telegraph: the ring's path on the pack's column, dashed, and the brain charging up
      const k = 1 - -s.t / tele;
      ctx.setLineDash([u(10), u(7)]);
      ctx.lineDashOffset = -time * 80;
      // (ghost rings along the whole path, so the gap reads even behind the pack and the HUD)
      ctx.lineWidth = Math.max(3, s.r * 0.9);
      for (const q of [0.38, 0.69, 1]) {
        ctx.strokeStyle = `rgba(255,92,240,${(0.3 + 0.35 * k) * (q === 1 ? 1.3 : 1) * (0.7 + 0.3 * blink)})`;
        waveArcs(ctx, s.x, s.y, D * q, gy, gh);
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(255,92,240,${0.3 + 0.6 * k})`;
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const q = (k * 2 + i / 3) % 1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 8 + (1 - q) * u(56), 0, TAU);
        ctx.stroke();
      }
    } else if (rad > 0) {
      // the thought wave itself: a neon ring with a white-hot core
      const layers: [number, string][] = lite
        ? [[s.r * 1.7, '#ff5cf0'], [s.r * 0.8, '#bff8ff'], [Math.max(1.5, s.r * 0.25), '#ffffff']]
        : [[s.r * 2.8, 'rgba(255,92,240,0.25)'], [s.r * 1.7, '#ff5cf0'], [s.r * 0.8, '#bff8ff'], [Math.max(1.5, s.r * 0.25), '#ffffff']];
      ctx.lineCap = 'butt';
      for (const [lw, col] of layers) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        waveArcs(ctx, s.x, s.y, rad, gy, gh);
      }
      // bright caps at the gap's edges
      ctx.fillStyle = '#7dff9b';
      const [a1, a2] = gapAngles(s.y, rad, gy, gh);
      for (const a of a2 - a1 > 1e-4 ? [a1, a2] : []) {
        if (Math.abs(a) > Math.PI / 2 - 1e-4) continue;
        ctx.beginPath();
        ctx.arc(s.x + Math.cos(phi(a)) * rad, s.y + Math.sin(phi(a)) * rad, Math.max(3, s.r * 0.55), 0, TAU);
        ctx.fill();
      }
    }
  } else {
    const len = s.x;
    if (s.t < 0) {
      const k = 1 - -s.t / Math.max(0.01, s.tele ?? 0.85);
      ctx.fillStyle = `rgba(255,92,240,${0.07 + 0.12 * k})`;
      ctx.fillRect(0, s.y - s.r, len, s.r * 2);
      ctx.setLineDash([u(8), u(6)]);
      ctx.lineDashOffset = time * 90;
      ctx.strokeStyle = `rgba(255,92,240,${0.55 + 0.4 * blink})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, s.y - s.r);
      ctx.lineTo(len, s.y - s.r);
      ctx.moveTo(0, s.y + s.r);
      ctx.lineTo(len, s.y + s.r);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.5 * blink})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, s.y);
      ctx.lineTo(len, s.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff3355';
      ctx.font = `900 ${u(20)}px 'Orbitron', sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.globalAlpha *= 0.5 + 0.5 * blink;
      ctx.fillText('!', u(6), s.y);
      ctx.restore();
      ctx.fillStyle = `rgba(255,92,240,${0.5 + 0.5 * k})`;
      ctx.beginPath();
      ctx.arc(len, s.y, s.r * (0.35 + 0.65 * k), 0, TAU);
      ctx.fill();
    } else {
      const wob = 1 + Math.sin(time * 60) * 0.08;
      const fade = (0.45 - s.t) / 0.12 + 0.2;
      ctx.globalAlpha *= Math.max(0.2, Math.min(1, fade));
      const layers: [number, string][] = lite
        ? [[0.95, '#ff5cf0'], [0.55, '#bff8ff'], [0.22, '#ffffff']]
        : [[1.3, 'rgba(255,92,240,0.35)'], [0.95, '#ff5cf0'], [0.55, '#bff8ff'], [0.22, '#ffffff']];
      for (const [k, col] of layers) {
        ctx.fillStyle = col;
        ctx.fillRect(0, s.y - s.r * k * wob, len, s.r * k * wob * 2);
      }
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 8; i++) {
        const x = (len * (hash(i + 3) + time * 2.5)) % Math.max(1, len);
        ctx.fillRect(x, s.y + (hash(i + 9) - 0.5) * s.r * 1.6, u(6), 2);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(len, s.y, s.r * 1.3 * wob, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
  return true;
}
