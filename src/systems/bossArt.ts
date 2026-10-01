/**
 * Character bosses (original cartoons in the game's neon canvas style):
 *  - L40 BUCKLE BUSTER: a very large dancer bursting out of a buckle-and-zipper leather jacket,
 *    glasses, big curly hair; his belly is the scoreboard and the gold #1 row is the weak spot.
 *  - L50 (THE ANDY DALY PODCAST SHOW TRYOUT): a comical cowboy on a stick horse: giant wobbling
 *    hat, tiny body, huge boots with pinwheel spurs, droopy handlebar mustache, fringed chaps;
 *    the weak spot is a WANTED poster on his chest; desert sunset behind him.
 *  - L100 (ADAM CURRY): an 80s VJ host as a faceted low-poly TV head in a CRT frame with a
 *    rotating wireframe background, scanlines, tracking glitches, stutter frames and RGB split;
 *    the weak spot is the gold #1 row of an on-screen countdown chart.
 * The board (b.x, b.y, b.w, b.h, rows, spot) is the hit area; every drawing keeps its rows there.
 */
import type { Board, BossFight } from './Boss';

const rowY = (b: Board, r: number): number => b.y - b.h / 2 + (b.h / b.rows) * (r + 0.5);

function rows(ctx: CanvasRenderingContext2D, b: Board, x0: number, w: number, f: BossFight, time: number, opts: { paper?: string; ink?: string; label?: (r: number, spot: boolean) => string }): void {
  const rh = b.h / b.rows;
  for (let r = 0; r < b.rows; r++) {
    const spot = r === b.spot && f.active;
    const y = b.y - b.h / 2 + rh * r;
    if (spot) {
      const p = 0.6 + 0.4 * Math.sin(time * 10);
      ctx.fillStyle = `rgba(255,214,63,${0.65 + 0.3 * p})`;
    } else ctx.fillStyle = opts.paper ?? 'rgba(255,255,255,0.12)';
    ctx.fillRect(x0 + 3, y + 3, w - 6, rh - 6);
    ctx.fillStyle = spot ? '#1a0030' : opts.ink ?? 'rgba(255,255,255,0.75)';
    ctx.font = `800 ${Math.max(8, Math.min(13, rh * 0.42))}px 'Orbitron', sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.label ? opts.label(r, spot) : spot ? '#1' : `#${r + 2}`, x0 + 6, y + rh / 2);
  }
}

export function drawBuckleBuster(ctx: CanvasRenderingContext2D, f: BossFight, b: Board, time: number): void {
  const stun = f.stunned;
  const hurt = f.hurtT > 0;
  const W = b.w;
  const H = b.h;
  const strut = f.slam > 0 || f.slamT > 0;
  const sway = Math.sin(time * (strut ? 9 : 4)) * W * 0.04;
  ctx.save();
  ctx.translate(b.x + sway, b.y);
  if (hurt) ctx.rotate(Math.sin(time * 40) * 0.04);
  // legs: moonwalk (feet slide backwards in turn while he glides)
  const step = Math.sin(time * (strut ? 10 : 5));
  ctx.fillStyle = '#2a2a33';
  ctx.strokeStyle = '#ff3b8d';
  ctx.lineWidth = 2;
  for (const [i, k] of [[-1, step], [1, -step]] as const) {
    const lx = i * W * 0.18 + k * W * 0.08;
    ctx.fillRect(lx - W * 0.09, H * 0.42, W * 0.18, H * 0.38);
    ctx.fillStyle = '#fff';
    ctx.fillRect(lx - W * 0.13 + (k > 0 ? -W * 0.04 : 0), H * 0.78, W * 0.26, H * 0.07); // white socks/shoes flash
    ctx.fillStyle = '#2a2a33';
  }
  // belly / jacket (the scoreboard lives on the belly: exactly the board rect)
  const jg = ctx.createRadialGradient(-W * 0.2, -H * 0.2, W * 0.05, 0, 0, W * 0.7);
  jg.addColorStop(0, stun ? '#777' : '#4a4a55');
  jg.addColorStop(1, stun ? '#333' : '#121216');
  ctx.fillStyle = jg;
  ctx.beginPath();
  ctx.ellipse(0, 0, W * 0.62, H * 0.56, 0, 0, Math.PI * 2);
  ctx.fill();
  // leather shine
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(-W * 0.12, -H * 0.12, W * 0.42, H * 0.36, 0, Math.PI * 1.05, Math.PI * 1.45);
  ctx.stroke();
  ctx.strokeStyle = '#ff3b8d';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#ff3b8d';
  ctx.shadowBlur = stun ? 0 : 14;
  ctx.stroke();
  ctx.shadowBlur = 0;
  // zippers + buckles everywhere (some strained ones pop off as projectiles)
  ctx.strokeStyle = '#c0c0c0';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const zx = -W * 0.55 + (i % 3) * W * 0.06;
    const zy = -H * 0.4 + i * H * 0.14;
    ctx.beginPath();
    ctx.moveTo(zx, zy);
    for (let j = 0; j < 5; j++) ctx.lineTo(zx + (j % 2 ? 3 : -3), zy + j * 4);
    ctx.stroke();
  }
  ctx.fillStyle = '#d9d9d9';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const bx = Math.cos(a) * W * 0.58;
    const by = Math.sin(a) * H * 0.5;
    ctx.strokeStyle = '#d9d9d9';
    ctx.strokeRect(bx - 4, by - 3, 8, 6);
  }
  ctx.restore();
  // belly scoreboard rows (hit area)
  ctx.save();
  ctx.translate(sway, 0);
  rows(ctx, b, b.x - W * 0.36, W * 0.72, f, time, { paper: 'rgba(255, 59, 141, 0.18)' });
  // straining belt + buckle
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(b.x - W * 0.6, b.y + H * 0.36, W * 1.2, H * 0.07);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(b.x - W * 0.08, b.y + H * 0.34, W * 0.16, H * 0.11);
  // head: glasses + big curly hair
  const hx = b.x;
  const hy = b.y - H * 0.62;
  ctx.fillStyle = '#3a1d0e';
  for (let i = 0; i < 11; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    ctx.beginPath();
    ctx.arc(hx + Math.cos(a) * W * 0.24, hy - H * 0.04 + Math.sin(a) * H * 0.2, W * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e8b48a';
  ctx.beginPath();
  ctx.ellipse(hx, hy, W * 0.2, H * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.strokeRect(hx - W * 0.16, hy - H * 0.04, W * 0.13, H * 0.06);
  ctx.strokeRect(hx + W * 0.03, hy - H * 0.04, W * 0.13, H * 0.06);
  ctx.beginPath();
  ctx.moveTo(hx - W * 0.03, hy - H * 0.01);
  ctx.lineTo(hx + W * 0.03, hy - H * 0.01);
  ctx.stroke();
  ctx.beginPath();
  if (hurt) ctx.arc(hx, hy + H * 0.09, W * 0.04, 0, Math.PI * 2);
  else ctx.arc(hx, hy + H * 0.05, W * 0.07, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

export function drawCowboy(ctx: CanvasRenderingContext2D, f: BossFight, b: Board, time: number): void {
  const W = b.w;
  const H = b.h;
  const hurt = f.hurtT > 0;
  const tangled = f.tangleT > 0;
  const bounce = Math.abs(Math.sin(time * 6)) * H * 0.06;
  // desert sunset behind him
  const g = ctx.createLinearGradient(0, b.y - H, 0, b.y + H);
  g.addColorStop(0, '#3a0a4a');
  g.addColorStop(0.55, '#ff6b35');
  g.addColorStop(1, '#ffd23f');
  ctx.fillStyle = g;
  ctx.fillRect(b.x - W * 0.75, b.y - H * 1.05, W * 1.5, H * 2.1);
  ctx.fillStyle = 'rgba(255, 230, 109, 0.85)';
  ctx.beginPath();
  ctx.arc(b.x + W * 0.35, b.y + H * 0.4, W * 0.28, Math.PI, 0);
  ctx.fill();
  ctx.save();
  ctx.translate(0, -bounce);
  if (hurt) ctx.translate(Math.sin(time * 50) * 3, 0);
  // stick horse
  ctx.strokeStyle = '#8b5a2b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(b.x + W * 0.45, b.y + H * 0.9);
  ctx.lineTo(b.x - W * 0.5, b.y - H * 0.05);
  ctx.stroke();
  ctx.fillStyle = '#c9a26b';
  ctx.beginPath();
  ctx.ellipse(b.x - W * 0.58, b.y - H * 0.12, W * 0.14, H * 0.1, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.fillRect(b.x - W * 0.63, b.y - H * 0.17, 3, 3);
  // huge boots with pinwheel spurs
  for (const s of [-1, 1]) {
    const bx = b.x + s * W * 0.16;
    ctx.fillStyle = '#5a3418';
    ctx.fillRect(bx - W * 0.1, b.y + H * 0.48, W * 0.2, H * 0.32);
    ctx.fillRect(bx - W * 0.2, b.y + H * 0.72, W * 0.32, H * 0.12);
    ctx.save();
    ctx.translate(bx + W * 0.14, b.y + H * 0.78);
    ctx.rotate(time * 14 * s);
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.fillStyle = i % 2 ? '#ffd23f' : '#ff4ec8';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W * 0.08, -W * 0.03);
      ctx.lineTo(W * 0.08, W * 0.03);
      ctx.fill();
    }
    ctx.restore();
  }
  // tiny body + fringed chaps (the board rect)
  ctx.fillStyle = '#7a4a24';
  ctx.fillRect(b.x - W * 0.3, b.y - H / 2, W * 0.6, H);
  ctx.strokeStyle = '#d9a066';
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const fy = b.y - H / 2 + (i / 26) * H;
    const sw = Math.sin(time * 8 + i) * 3;
    ctx.beginPath();
    ctx.moveTo(b.x - W * 0.3, fy);
    ctx.lineTo(b.x - W * 0.38 + sw, fy + 4);
    ctx.moveTo(b.x + W * 0.3, fy);
    ctx.lineTo(b.x + W * 0.38 + sw, fy + 4);
    ctx.stroke();
  }
  // rows on his chest; the weak spot reads WANTED
  rows(ctx, b, b.x - W * 0.28, W * 0.56, f, time, {
    paper: 'rgba(244, 228, 190, 0.35)',
    ink: '#3a1d0e',
    label: (r, spot) => (spot ? 'WANTED' : `#${r + 2}`),
  });
  // lasso (tangling him when he messes up)
  ctx.strokeStyle = '#e8c27a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (tangled) {
    for (let i = 0; i < 4; i++) ctx.ellipse(b.x, b.y - H * 0.1 + i * H * 0.12, W * 0.36, H * 0.05, 0.2, 0, Math.PI * 2);
  } else {
    ctx.ellipse(b.x - W * 0.5, b.y - H * 0.55 + Math.sin(time * 9) * 6, W * 0.22, H * 0.07, time * 6, 0, Math.PI * 2);
  }
  ctx.stroke();
  // head, droopy handlebar mustache
  const hx = b.x;
  const hy = b.y - H / 2 - H * 0.16;
  ctx.fillStyle = '#f0c090';
  ctx.beginPath();
  ctx.arc(hx, hy, W * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a1d0e';
  ctx.lineWidth = 3;
  const droop = hurt ? 1 : 0;
  ctx.beginPath();
  ctx.moveTo(hx - W * 0.16, hy + W * 0.02 + droop * W * 0.08);
  ctx.quadraticCurveTo(hx - W * 0.08, hy + W * 0.08 - droop * W * 0.03, hx, hy + W * 0.04);
  ctx.quadraticCurveTo(hx + W * 0.08, hy + W * 0.08 - droop * W * 0.03, hx + W * 0.16, hy + W * 0.02 + droop * W * 0.08);
  ctx.stroke();
  // gigantic wobbling hat (about 3x his head), sometimes over his eyes
  const over = f.hatT > 0 ? W * 0.12 : 0;
  ctx.save();
  ctx.translate(hx, hy - W * 0.1 + over);
  ctx.rotate(Math.sin(time * 5) * 0.12 + (hurt ? 0.3 : 0));
  ctx.fillStyle = '#c0782f';
  ctx.beginPath();
  ctx.ellipse(0, 0, W * 0.55, W * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-W * 0.24, -W * 0.38, W * 0.48, W * 0.38);
  ctx.fillStyle = '#ff6b35';
  ctx.fillRect(-W * 0.24, -W * 0.1, W * 0.48, W * 0.06);
  ctx.restore();
  ctx.restore();
}

export function drawVJ(ctx: CanvasRenderingContext2D, f: BossFight, b: Board, time: number, lite: boolean): void {
  const W = b.w;
  const H = b.h;
  const x0 = b.x - W / 2;
  const y0 = b.y - H / 2;
  // stutter-repeat frames: time snaps back now and then
  const st = Math.floor(time * 12) % 17 < 3 ? Math.floor(time * 4) / 4 : time;
  const glitch = Math.floor(time * 7) % 11 === 0 || f.hurtT > 0;
  // CRT frame
  ctx.fillStyle = '#222';
  ctx.fillRect(x0 - 10, y0 - 10, W + 20, H + 26);
  ctx.fillStyle = '#7fffff';
  ctx.fillRect(x0 + W - 22, y0 + H + 4, 6, 6);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, W, H);
  ctx.clip();
  ctx.fillStyle = '#05010f';
  ctx.fillRect(x0, y0, W, H);
  // rotating wireframe background
  ctx.strokeStyle = 'rgba(127,255,255,0.55)';
  ctx.lineWidth = 1;
  const cx = b.x;
  const cy = b.y;
  for (let i = 0; i < 10; i++) {
    const a = st * 0.8 + (i * Math.PI) / 10;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * W, cy + Math.sin(a) * H);
    ctx.stroke();
  }
  for (let k = 1; k < 5; k++) ctx.strokeRect(cx - (W * k) / 8 - Math.sin(st) * 4, cy - (H * k) / 8, (W * k) / 4, (H * k) / 4);
  // faceted low-poly head + shoulders in a sharp suit and sunglasses (RGB split copies)
  const head = (dx: number, col: string | null): void => {
    ctx.save();
    ctx.translate(cx + dx + Math.sin(st * 2) * W * 0.04, cy - H * 0.1);
    ctx.rotate(Math.sin(st * 1.3) * 0.12);
    const s = Math.min(W, H) * 0.32;
    const faces: [number, number][][] = [
      [[-0.6, -0.9], [0, -1.1], [0, -0.2]],
      [[0, -1.1], [0.6, -0.9], [0, -0.2]],
      [[-0.6, -0.9], [0, -0.2], [-0.55, 0.3]],
      [[0.6, -0.9], [0.55, 0.3], [0, -0.2]],
      [[-0.55, 0.3], [0, -0.2], [0, 0.75]],
      [[0.55, 0.3], [0, 0.75], [0, -0.2]],
    ];
    faces.forEach((fc, i) => {
      ctx.fillStyle = col ?? ['#e9d7c3', '#cbb59f', '#f3e5d6', '#b89f88', '#dcc6b0', '#c4ad96'][i];
      ctx.beginPath();
      fc.forEach(([px, py], j) => (j ? ctx.lineTo(px * s, py * s) : ctx.moveTo(px * s, py * s)));
      ctx.closePath();
      ctx.fill();
    });
    if (!col) {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(-0.55 * s, -0.5 * s, 1.1 * s, 0.22 * s); // sunglasses
      ctx.fillStyle = '#7fffff';
      ctx.fillRect(-0.45 * s, -0.46 * s, 0.25 * s, 0.05 * s);
      ctx.fillStyle = '#c2185b';
      ctx.fillRect(-0.18 * s, 0.32 * s, 0.36 * s, 0.06 * s); // grin
      // sharp suit shoulders
      ctx.fillStyle = '#1b1f3a';
      ctx.beginPath();
      ctx.moveTo(-1.4 * s, 1.6 * s);
      ctx.lineTo(-0.3 * s, 0.75 * s);
      ctx.lineTo(0.3 * s, 0.75 * s);
      ctx.lineTo(1.4 * s, 1.6 * s);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(-0.3 * s, 0.75 * s);
      ctx.lineTo(0, 1.3 * s);
      ctx.lineTo(0.3 * s, 0.75 * s);
      ctx.fill();
      ctx.fillStyle = '#7fffff';
      ctx.fillRect(-0.05 * s, 0.85 * s, 0.1 * s, 0.4 * s); // tie, 777 cyan accent
    }
    ctx.restore();
  };
  if (!lite) {
    ctx.globalAlpha = 0.45;
    ctx.globalCompositeOperation = 'lighter';
    head(-3, 'rgba(255,0,60,0.8)');
    head(3, 'rgba(0,200,255,0.8)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  head(0, null);
  // on-screen countdown chart (the rows / weak spot), translucent over the right side
  ctx.globalAlpha = 0.9;
  rows(ctx, b, x0 + W * 0.02, W * 0.96, f, time, { paper: 'rgba(127,255,255,0.08)', label: (r, spot) => (spot ? '#1 ★' : `#${r + 2}`) });
  ctx.globalAlpha = 1;
  // VHS tracking glitch band + scanlines
  if (glitch) {
    const gy = y0 + ((time * 160) % H);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x0, gy, W, 6);
    ctx.fillStyle = 'rgba(127,255,255,0.25)';
    ctx.fillRect(x0 + 8, gy + 8, W, 3);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = y0; y < y0 + H; y += 3) ctx.fillRect(x0, y, W, 1);
  ctx.restore();
  ctx.strokeStyle = '#7fffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0 - 10, y0 - 10, W + 20, H + 26);
  void rowY;
}
