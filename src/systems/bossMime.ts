/**
 * L10 boss, MONSIEUR MIRROR: an original cartoon mime who pedals in on a TINY TRICYCLE.
 * Accordion-stretchy striped body (squash and stretch), giant wobbling googly eyes, a beret that
 * pops off when he's bonked, a propeller on the handlebars (that's how a tricycle flies, obviously).
 * Weak spot: the gold-framed hand mirror on his rubber arm (it moves to a new height now and then).
 * Signature: he copies your moves upside down and throws cream pies from your mirrored height;
 * also slaps you with flying white gloves and floats balloon animals at you.
 * Defeat: deflates like a balloon, zig-zags up and away (PFFFFFT) and waves a tiny white flag.
 * The board rect (b.x, b.y, b.w, b.h, rows, spot) stays the hit area.
 */
import type { Board, BossFight, BossShot } from './Boss';

interface Wobble {
  t: number;
  lastY: number;
  vy: number;
  /** Googly pupils: offset + velocity (spring). */
  px: number;
  py: number;
  pvx: number;
  pvy: number;
  armY: number;
  beret: number;
  beretV: number;
  lastHurt: number;
}
const wob = new WeakMap<BossFight, Wobble>();

function wobble(f: BossFight, b: Board, time: number): Wobble {
  let w = wob.get(f);
  if (!w) {
    w = { t: time, lastY: b.y, vy: 0, px: 0, py: 0, pvx: 0, pvy: 0, armY: b.y, beret: 0, beretV: 0, lastHurt: 0 };
    wob.set(f, w);
  }
  const dt = Math.min(0.05, Math.max(0, time - w.t));
  w.t = time;
  if (dt > 0) {
    const vy = (b.y - w.lastY) / dt;
    const ay = (vy - w.vy) / dt;
    w.vy = vy;
    w.lastY = b.y;
    // Pupils: a damped spring that hangs down (gravity) and sloshes against the body's moves.
    const k = 90;
    const damp = 5;
    w.pvx += (-k * w.px - damp * w.pvx + Math.sin(time * 13) * 30) * dt;
    w.pvy += (-k * w.py - damp * w.pvy + 60 - ay * 0.08) * dt;
    w.px += w.pvx * dt;
    w.py += w.pvy * dt;
    const lim = 1.4;
    w.px = Math.max(-lim, Math.min(lim, w.px));
    w.py = Math.max(-lim, Math.min(lim, w.py));
    // Beret pops off on a bonk and falls back on.
    if (f.hurtT > 0.3 && w.lastHurt <= 0) w.beretV = -9;
    w.lastHurt = f.hurtT;
    w.beretV += 28 * dt;
    w.beret = Math.min(0, w.beret + w.beretV * dt);
    if (w.beret >= 0 && w.beretV > 0) w.beretV = 0;
  }
  return w;
}

export interface MimePose {
  time: number;
  /** Absolute y of the hand mirror (weak spot); NaN hides the mirror. */
  mirrorY: number;
  mirrorGlow: boolean;
  pupilX: number;
  pupilY: number;
  hurt: boolean;
  stun: boolean;
  /** Pedal speed multiplier (entrance = fast). */
  pedal: number;
  /** Beret lift (multiples of head radius, negative = up). */
  beret: number;
  /** 0..1: deflating. */
  deflate: number;
  flag: boolean;
  gray: boolean;
}

/** Draw the mime filling the box (cx, cy, W, H): tricycle at the bottom, head at the top. */
export function drawMimeBody(ctx: CanvasRenderingContext2D, cx: number, cy: number, W: number, H: number, p: MimePose): void {
  const t = p.time;
  ctx.save();
  ctx.translate(cx, cy + H / 2);
  // Squash and stretch around the wheels; deflating shrinks and wobbles him like a balloon.
  const bounce = p.stun ? 0 : Math.sin(t * 9 * p.pedal) * 0.05;
  let sy = 1 + bounce - (p.hurt ? 0.12 : 0);
  let sx = 1 / sy;
  if (p.deflate > 0) {
    const k = 1 - 0.75 * p.deflate;
    sy *= k * (1 + Math.sin(t * 40) * 0.08 * p.deflate);
    sx *= k * (1 - Math.sin(t * 40) * 0.08 * p.deflate);
  }
  ctx.scale(sx, sy);
  ctx.translate(0, -H / 2);
  const ink = p.gray ? '#666' : '#140022';
  const wheelR = Math.min(W * 0.3, H * 0.1);
  const trikeH = wheelR * 2.6;
  const headR = Math.min(W * 0.48, H * 0.17);
  const bodyTop = -H / 2 + headR * 1.7;
  const bodyBot = H / 2 - trikeH * 0.75;
  // --- tiny tricycle -----------------------------------------------------------------------
  const red = p.gray ? '#888' : '#ff2b4e';
  const wy = H / 2 - wheelR;
  const fx = -W * 0.32;
  const rx = W * 0.3;
  const rr = wheelR * 0.62;
  const spin = p.stun ? 0 : t * 14 * p.pedal;
  ctx.lineWidth = Math.max(2, wheelR * 0.18);
  ctx.strokeStyle = red;
  ctx.beginPath();
  ctx.moveTo(fx, wy);
  ctx.lineTo(fx + W * 0.08, wy - wheelR * 1.7);
  ctx.moveTo(fx + W * 0.04, wy - wheelR * 0.9);
  ctx.lineTo(rx, wy + wheelR - rr);
  ctx.stroke();
  for (const [x, r] of [[fx, wheelR], [rx, rr]] as const) {
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(x, H / 2 - r, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const a = spin + (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * r * 0.8, H / 2 - r - Math.sin(a) * r * 0.8);
      ctx.lineTo(x + Math.cos(a) * r * 0.8, H / 2 - r + Math.sin(a) * r * 0.8);
      ctx.stroke();
    }
  }
  // handlebar + bulb horn + a little propeller (how else would a tricycle fly?)
  const hx = fx + W * 0.08;
  const hy = wy - wheelR * 1.7;
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx - W * 0.1, hy);
  ctx.lineTo(hx + W * 0.06, hy);
  ctx.stroke();
  ctx.fillStyle = p.gray ? '#999' : '#ffcc00';
  ctx.beginPath();
  ctx.arc(hx - W * 0.13, hy, Math.max(3, wheelR * 0.28), 0, Math.PI * 2);
  ctx.fill();
  const pa = p.stun ? 0.3 : t * 30;
  ctx.strokeStyle = p.gray ? '#aaa' : '#7fffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(hx - Math.cos(pa) * W * 0.16, hy - wheelR * 0.5 - Math.sin(pa) * 2);
  ctx.lineTo(hx + Math.cos(pa) * W * 0.16, hy - wheelR * 0.5 + Math.sin(pa) * 2);
  ctx.stroke();
  // tiny white flag (defeat)
  if (p.flag) {
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx, wy - rr);
    ctx.lineTo(rx, wy - rr - wheelR * 2.2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    const wv = Math.sin(t * 12) * 3;
    ctx.beginPath();
    ctx.moveTo(rx, wy - rr - wheelR * 2.2);
    ctx.quadraticCurveTo(rx + wheelR * 0.6, wy - rr - wheelR * 2.0 + wv, rx + wheelR * 1.2, wy - rr - wheelR * 1.9);
    ctx.lineTo(rx, wy - rr - wheelR * 1.5);
    ctx.fill();
  }
  // pedaling legs (a blur when he's in a hurry)
  const crank = p.stun ? 0 : t * 12 * p.pedal;
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(3, W * 0.07);
  ctx.lineCap = 'round';
  for (const ph of [0, Math.PI]) {
    const kx = fx * 0.4 + Math.cos(crank + ph) * wheelR * 0.5;
    const ky = wy - wheelR * 0.3 + Math.sin(crank + ph) * wheelR * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, bodyBot);
    ctx.lineTo((kx + 0) / 2 - W * 0.08, (ky + bodyBot) / 2 - wheelR * 0.4);
    ctx.lineTo(kx, ky);
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.ellipse(kx - 2, ky, W * 0.09, W * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // --- accordion body: black-and-white stripes, the stripe count is fixed so it reads as stretchy
  const bw = W * 0.5;
  const n = 9;
  const sh = (bodyBot - bodyTop) / n;
  for (let i = 0; i < n; i++) {
    const wv = Math.sin(t * 6 + i * 0.8) * W * 0.03 * (p.stun ? 0 : 1);
    ctx.fillStyle = i % 2 ? '#fff' : '#111';
    ctx.fillRect(-bw / 2 + wv, bodyTop + i * sh, bw, sh + 0.5);
  }
  // red suspenders
  ctx.strokeStyle = red;
  ctx.lineWidth = Math.max(2, W * 0.05);
  ctx.beginPath();
  ctx.moveTo(-bw * 0.28, bodyTop);
  ctx.lineTo(-bw * 0.28, bodyBot);
  ctx.moveTo(bw * 0.28, bodyTop);
  ctx.lineTo(bw * 0.28, bodyBot);
  ctx.stroke();
  // waving glove arm (right side)
  const wave = Math.sin(t * 7) * 0.6;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(3, W * 0.06);
  const sy0 = bodyTop + sh;
  const gx = bw / 2 + W * 0.25 * Math.cos(wave - 0.8);
  const gy = sy0 - W * 0.35 * Math.sin(wave + 1.2);
  ctx.beginPath();
  ctx.moveTo(bw / 2, sy0);
  ctx.quadraticCurveTo(bw / 2 + W * 0.2, sy0 + W * 0.1, gx, gy);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(gx, gy, Math.max(4, W * 0.09), 0, Math.PI * 2);
  ctx.fill();
  // --- rubber arm + hand mirror: the weak spot --------------------------------------------
  if (!Number.isNaN(p.mirrorY)) {
    const my = Math.max(-H / 2, Math.min(H / 2, p.mirrorY - cy));
    const mr = Math.max(7, Math.min(W * 0.34, H * 0.09));
    const mx = -W / 2 + mr * 0.2;
    const shoulderY = Math.max(bodyTop + sh, Math.min(bodyBot - sh, my));
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(3, W * 0.06);
    ctx.beginPath();
    ctx.moveTo(-bw / 2, shoulderY);
    const wig = Math.sin(t * 11) * W * 0.08;
    ctx.bezierCurveTo(-bw / 2 - W * 0.15, shoulderY + wig, mx + mr, my - wig, mx + mr * 0.9, my);
    ctx.stroke();
    if (p.mirrorGlow) {
      const pulse = 0.6 + 0.4 * Math.sin(t * 10);
      ctx.fillStyle = `rgba(255,214,63,${0.25 + 0.25 * pulse})`;
      ctx.beginPath();
      ctx.arc(mx, my, mr * (1.5 + 0.2 * pulse), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = p.gray ? '#999' : '#ffd23f';
    ctx.beginPath();
    ctx.ellipse(mx, my, mr, mr * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(mx + mr * 0.6, my - mr * 0.15, mr * 0.9, mr * 0.3);
    const gg = ctx.createLinearGradient(mx - mr, my - mr, mx + mr, my + mr);
    gg.addColorStop(0, '#e8fbff');
    gg.addColorStop(1, '#7fb8d8');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.ellipse(mx, my, mr * 0.75, mr * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx - mr * 0.35, my - mr * 0.45);
    ctx.lineTo(mx + mr * 0.05, my - mr * 0.75);
    ctx.stroke();
  }
  // --- head: white face, giant googly eyes, huge red mouth, beret ---------------------------
  const hy0 = -H / 2 + headR * 1.05;
  ctx.fillStyle = p.gray ? '#ddd' : '#fffaf2';
  ctx.beginPath();
  ctx.ellipse(0, hy0, headR, headR * (p.hurt ? 0.85 : 1.05), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.stroke();
  const er = headR * 0.36;
  for (const s of [-1, 1]) {
    const ex = s * headR * 0.42;
    const ey = hy0 - headR * 0.2;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#000';
    if (p.stun) {
      // spiral eyes
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let a = 0; a < 12; a += 0.4) ctx.lineTo(ex + Math.cos(a + t * 8 * s) * er * a / 13, ey + Math.sin(a + t * 8 * s) * er * a / 13);
      ctx.stroke();
    } else if (p.hurt) {
      const a = t * 25 * s;
      ctx.beginPath();
      ctx.arc(ex + Math.cos(a) * er * 0.45, ey + Math.sin(a) * er * 0.45, er * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(ex + p.pupilX * er * 0.4, ey + p.pupilY * er * 0.4, er * 0.48, 0, Math.PI * 2);
      ctx.fill();
    }
    // black teardrop under each eye (mime makeup)
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(ex, ey + er * 1.45, er * 0.13, er * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // mouth: a huge over-acted red grin, an "O" when bonked, a wobbly frown when deflating
  ctx.fillStyle = p.gray ? '#777' : '#e0002a';
  ctx.beginPath();
  const my0 = hy0 + headR * 0.5;
  if (p.hurt || p.stun) ctx.ellipse(0, my0, headR * 0.2, headR * 0.26, 0, 0, Math.PI * 2);
  else if (p.deflate > 0) {
    ctx.ellipse(0, my0 + headR * 0.08, headR * 0.35, headR * 0.12, 0, Math.PI, Math.PI * 2);
  } else {
    ctx.moveTo(-headR * 0.55, my0 - headR * 0.08);
    ctx.quadraticCurveTo(0, my0 + headR * 0.5, headR * 0.55, my0 - headR * 0.08);
    ctx.quadraticCurveTo(0, my0 + headR * 0.15, -headR * 0.55, my0 - headR * 0.08);
  }
  ctx.fill();
  // beret (pops off on a bonk)
  const by = hy0 - headR * 0.9 + p.beret * headR;
  ctx.save();
  ctx.translate(headR * 0.15, by);
  ctx.rotate(-0.25 + p.beret * 0.6);
  ctx.fillStyle = p.gray ? '#555' : '#1a1a2a';
  ctx.beginPath();
  ctx.ellipse(0, 0, headR * 0.8, headR * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-1.5, -headR * 0.5, 3, headR * 0.25);
  ctx.restore();
  ctx.restore();
}

/** The L10 fight drawing. */
export function drawMime(ctx: CanvasRenderingContext2D, f: BossFight, b: Board, time: number): void {
  const w = wobble(f, b, time);
  const rowH = b.h / b.rows;
  const spotY = b.y - b.h / 2 + rowH * (b.spot + 0.5);
  w.armY += (spotY - w.armY) * 0.35;
  const enter = f.state === 'enter';
  const beaten = f.state === 'defeated' || f.state === 'gone';
  const k = beaten ? Math.min(1, f.stateT / f.exitS) : 0;
  // Entrance: a wheelie that slams down at the end (squash), dust puffs behind the wheels.
  ctx.save();
  let cx = b.x;
  let cy = b.y;
  if (enter) {
    const e = f.stateT / f.enterS;
    const wheelie = e < 0.8 ? -0.18 * Math.sin((e / 0.8) * Math.PI) : 0;
    ctx.translate(b.x + b.w * 0.3, b.y + b.h / 2);
    ctx.rotate(wheelie);
    ctx.translate(-(b.x + b.w * 0.3), -(b.y + b.h / 2));
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 5; i++) {
      const pr = (((time * 3 + i * 0.2) % 1) * b.w) / 2;
      ctx.beginPath();
      ctx.arc(b.x - b.w * 0.45 - pr * 2, b.y + b.h / 2 - pr * 0.3, 4 + pr * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e > 0.75 && e < 0.95) {
      // skid marks + a little smoke where he brakes
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.w * 1.4, b.y + b.h / 2);
      ctx.lineTo(b.x - b.w * 0.3, b.y + b.h / 2);
      ctx.stroke();
    }
  }
  if (beaten) {
    // Deflating balloon: zig-zags up and away.
    cx += Math.sin(k * 28) * b.w * 0.5 * k;
    cy -= k * k * b.h * 0.9;
  }
  drawMimeBody(ctx, cx, cy, b.w, b.h, {
    time,
    mirrorY: beaten ? Number.NaN : w.armY + (cy - b.y),
    mirrorGlow: f.state === 'fight',
    pupilX: w.px,
    pupilY: w.py,
    hurt: f.hurtT > 0,
    stun: f.stunned,
    pedal: enter ? 3 : beaten ? 0.3 : 1,
    beret: w.beret,
    deflate: k,
    flag: beaten,
    gray: false,
  });
  ctx.restore();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = Math.max(11, Math.min(18, b.w * 0.2));
  if (f.stunned && f.state === 'fight') {
    ctx.fillStyle = '#ffe66d';
    ctx.font = `900 ${fs}px 'Orbitron', sans-serif`;
    ctx.fillText('STUNNED', b.x - b.w * 1.1, b.y - b.h * 0.25);
  }
  if (beaten && k < 0.95) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${fs * 1.2}px 'Orbitron', sans-serif`;
    ctx.fillText('PFFFFFFT!', b.x - b.w * 0.6, b.y - k * k * b.h * 0.9 + b.h * 0.1);
  }
  ctx.restore();
}

/** Group-photo pose. */
export function drawMimeMini(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number): void {
  drawMimeBody(ctx, x, y, w, h, { time: t, mirrorY: y, mirrorGlow: false, pupilX: Math.sin(t * 3) * 0.6, pupilY: 0.5, hurt: false, stun: false, pedal: 0.6, beret: 0, deflate: 0, flag: false, gray: false });
}

/** Mime projectiles: cream pies, flying white gloves, balloon animals. Returns false for other kinds. */
export function drawMimeShot(ctx: CanvasRenderingContext2D, s: BossShot): boolean {
  if (s.kind !== 'pie' && s.kind !== 'glove' && s.kind !== 'balloon') return false;
  const r = s.r;
  ctx.save();
  ctx.translate(s.x, s.y);
  if (s.kind === 'pie') {
    ctx.rotate(Math.sin(s.t * 6) * 0.2);
    ctx.fillStyle = '#c98a3d';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.25, r * 1.1, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.05, r * 1.0, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-r * 0.45, r * 0.35, r * 0.2, 0, Math.PI * 2);
    ctx.arc(r * 0.3, r * 0.42, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0002a';
    ctx.beginPath();
    ctx.arc(0, -r * 0.45, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  } else if (s.kind === 'glove') {
    ctx.rotate(Math.atan2(s.vy, s.vx) + Math.PI + Math.sin(s.t * 20) * 0.25);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#140022';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(r * 0.95, (i - 1) * r * 0.45, r * 0.45, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, -r * 0.85, r * 0.2, r * 0.4, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // balloon dog: three bulbs and a squeaky little tail, gently bobbing
    ctx.rotate(Math.sin(s.t * 4) * 0.25);
    const hue = Math.floor((s.x * 7 + s.y * 3) / 40) % 3;
    ctx.fillStyle = ['#ff4ec8', '#7fffff', '#7dff6b'][Math.abs(hue)];
    ctx.beginPath();
    ctx.ellipse(-r * 0.55, 0, r * 0.6, r * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.45, -r * 0.1, r * 0.55, r * 0.4, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.95, -r * 0.55, r * 0.35, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-r * 0.75, r * 0.2, r * 0.18, r * 0.65);
    ctx.fillRect(-r * 0.25, r * 0.2, r * 0.18, r * 0.65);
    ctx.fillRect(r * 0.35, r * 0.2, r * 0.18, r * 0.65);
    ctx.fillRect(r * 0.7, r * 0.2, r * 0.18, r * 0.65);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(r * 0.35, -r * 0.25, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return true;
}
