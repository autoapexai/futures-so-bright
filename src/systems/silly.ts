/**
 * Dan's silliness pack: kitchen-appliance pickups, the leftover-pizza shield, the "cat is
 * walking on the keyboard" fake loading screen, trailer-voice grocery-list taunts, and the
 * THE BOARD group photo shown after the level 111 boss.
 */
import type { BossDef } from './Boss';

export type Appliance = 'toaster' | 'blender' | 'microwave';
export const APPLIANCES: readonly Appliance[] = ['toaster', 'blender', 'microwave'];
/** TOASTER: speed burst + points + brief invulnerability. */
export const TOASTER_SECONDS = 0.9;
export const TOASTER_POINTS = 300;
/** BLENDER: one gentle eased camera spin. */
export const BLENDER_SECONDS = 2.6;
/** MICROWAVE: leftover-pizza shield that absorbs hits. */
export const MICROWAVE_SECONDS = 6;

/** Grocery lists per boss (read in a movie-trailer voice). */
export const GROCERIES: Record<string, string[]> = {
  mantzoukas: ['EGGS', 'MILK', 'ONE (1) REGRETTABLE MELON', 'A MIRROR, FOR SOME REASON', 'TWO OF EVERYTHING', 'ADJACENT CHEESE'],
  calvin: ['TWIN-PACK YOGURT', 'BOGO BANANAS', 'TWO (2) IDENTICAL HAMS', 'DOUBLE-STUFFED ANYTHING', 'MATCHING SOCKS'],
  decoy: ['DECOY DUCKS', 'FAKE MUSTACHE', 'IMITATION CRAB', 'ONE (1) SUSPICIOUS LEMON', 'TRENCH COAT (SNACK SIZE)'],
  buckle: ['EXTRA-LONG BELT', 'SPARE BUCKLES (BULK)', 'ZIPPER WAX', 'LEATHER CONDITIONER', 'ONE (1) HAIR PICK', 'STRETCHY JEANS', 'DANCE-FLOOR SNACKS'],
  toofat: ['FAMILY-SIZE EVERYTHING', 'A WHEEL OF CHEESE', 'BULK BUTTER', 'ONE (1) ENORMOUS TURKEY', 'STRETCHY PANTS'],
  daly: ['HEADSHOTS', 'AUDITION SNACKS', 'A CHARACTER VOICE', 'MYSTERY JERKY', 'CALLBACK CRACKERS'],
  toosuccessful: ['GOLD-LEAF BAGELS', 'CAVIAR (THE GOOD KIND)', 'A YACHT, SMALL', 'IMPORTED WATER', 'MONOGRAMMED NAPKINS'],
  alw: ['THROAT LOZENGES', 'CHANDELIER (DECORATIVE)', 'CATS FOOD', 'A PHANTOM MASK', 'OPERA-LENGTH BAGUETTE'],
  slackerman: ['SNACKS (UNOPENED)', 'TISSUES', 'ONE (1) NAP', 'COLD PIZZA', 'SOMEDAY SPINACH'],
  cbb: ['BANG BANG SHRIMP', 'IMPROV PICKLES', 'YES-AND YAMS', 'ONE (1) BIT', 'NOISEMAKERS'],
  curry: ['MORNING COFFEE', 'SATS-FLAVORED GUM', 'A BOOSTAGRAM', 'DOLLAR-STORE MICROPHONE', 'VALUE-FOR-VALUE VEGGIES'],
  dvorak: ['WRONG MILK', 'CONTRARIAN CEREAL', 'BACKWARDS BAGELS', 'A STRONGLY WORDED LETTUCE', 'ONE (1) OPINION'],
  itm: ['3,333 EGGS', 'MORNING MUFFINS', 'DOTS (BULK)', 'ONE (1) CORKBOARD', 'A CAT MAGNET', 'EVERYTHING ELSE'],
};

/** Build one trailer taunt: "IN A WORLD... EGGS. MILK. ONE (1) REGRETTABLE MELON." */
export function groceryTaunt(modeId: string, rng: () => number, jabs: string[]): string {
  const pool = [...(GROCERIES[modeId] ?? GROCERIES.itm)];
  const items: string[] = [];
  const n = 3;
  for (let i = 0; i < n && pool.length; i++) items.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  if (jabs.length && rng() < 0.55) items.splice(1 + Math.floor(rng() * 2), 1, jabs[Math.floor(rng() * jabs.length)]);
  return `IN A WORLD... ${items.join('. ')}.`;
}

/** Player-history jabs as list items, from local data only. */
export function historyJabs(high: number, bestLevel: number, entries: number): string[] {
  const f = (n: number) => Math.floor(n).toLocaleString('en-US');
  const out: string[] = [];
  if (high > 0) out.push(`BREAD. YOUR ${f(high)}`);
  if (bestLevel > 1) out.push(`SOUR CREAM. YOUR LEVEL ${bestLevel} "PEAK"`);
  if (entries > 0) out.push(`TISSUES FOR YOUR ${entries} BOARD ENTR${entries === 1 ? 'Y' : 'IES'}`);
  return out;
}

/** Read a taunt in a low, slow trailer voice (only when sound is on; silently skipped if unsupported). */
export function speakTrailer(text: string): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\((\d+)\)/g, '').replace(/\s+/g, ' '));
    u.pitch = 0.1;
    u.rate = 0.72;
    u.volume = 0.9;
    u.lang = 'en-US';
    synth.speak(u);
  } catch {
    /* unsupported: skip */
  }
}

export function stopSpeech(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

/** Appliance pickup icon centred at (0,0) (caller translates). */
export function drawAppliance(ctx: CanvasRenderingContext2D, kind: Appliance, t: number): void {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1b0b2e';
  if (kind === 'toaster') {
    ctx.fillStyle = '#c9d1d9';
    ctx.beginPath();
    ctx.roundRect(-16, -8, 32, 20, 6);
    ctx.fill();
    ctx.stroke();
    const pop = Math.abs(Math.sin(t * 3)) * 6;
    ctx.fillStyle = '#e0a458';
    ctx.fillRect(-11, -14 - pop, 9, 10);
    ctx.fillRect(2, -14 - pop, 9, 10);
    ctx.fillStyle = '#1b0b2e';
    ctx.fillRect(-12, -9, 11, 2);
    ctx.fillRect(1, -9, 11, 2);
  } else if (kind === 'blender') {
    ctx.fillStyle = 'rgba(160, 230, 255, 0.75)';
    ctx.beginPath();
    ctx.moveTo(-10, -16);
    ctx.lineTo(10, -16);
    ctx.lineTo(7, 6);
    ctx.lineTo(-7, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff4ec8';
    ctx.save();
    ctx.translate(0, -4);
    ctx.rotate(t * 12);
    ctx.fillRect(-7, -1.5, 14, 3);
    ctx.restore();
    ctx.fillStyle = '#444b55';
    ctx.fillRect(-11, 6, 22, 8);
    ctx.strokeRect(-11, 6, 22, 8);
  } else {
    ctx.fillStyle = '#e6e6e6';
    ctx.beginPath();
    ctx.roundRect(-18, -11, 36, 22, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 200, 80, ${0.55 + 0.35 * Math.sin(t * 8)})`;
    ctx.fillRect(-14, -7, 20, 14);
    ctx.fillStyle = '#333';
    ctx.fillRect(9, -7, 5, 3);
    ctx.fillRect(9, -1, 5, 3);
  }
  ctx.fillStyle = '#ffe66d';
  ctx.font = "800 9px 'Orbitron', sans-serif";
  ctx.textAlign = 'center';
  ctx.fillText(kind.toUpperCase(), 0, 26);
  ctx.restore();
}

/** Leftover-pizza shield: a ring of slices orbiting the lead dog. */
export function drawPizzaShield(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, left: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = left < 1.2 ? 0.45 + 0.45 * Math.abs(Math.sin(t * 14)) : 0.95;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = t * 1.6 + (i * Math.PI * 2) / n;
    ctx.save();
    ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    const s = Math.max(7, r * 0.32);
    ctx.fillStyle = '#f4c542';
    ctx.beginPath();
    ctx.moveTo(0, s);
    ctx.lineTo(-s * 0.6, -s * 0.5);
    ctx.lineTo(s * 0.6, -s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#b5651d';
    ctx.fillRect(-s * 0.65, -s * 0.62, s * 1.3, s * 0.22);
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(-s * 0.15, -s * 0.1, s * 0.13, 0, Math.PI * 2);
    ctx.arc(s * 0.15, s * 0.25, s * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Fake loading screen. */
export function drawCatLoading(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, u: (n: number) => number): void {
  ctx.save();
  ctx.fillStyle = '#101014';
  ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2 - u(18));
  for (let i = 0; i < 12; i++) {
    ctx.globalAlpha = 0.15 + 0.85 * (((i - t * 12) % 12 + 12) % 12) / 12;
    ctx.fillStyle = '#ddd';
    const a = (i * Math.PI * 2) / 12;
    ctx.fillRect(Math.cos(a) * u(18) - 2, Math.sin(a) * u(18) - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#cfcfcf';
  ctx.textAlign = 'center';
  ctx.font = `400 ${u(15)}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillText('the cat is walking on the keyboard', 0, u(52));
  ctx.restore();
}

function mini(ctx: CanvasRenderingContext2D, d: BossDef, x: number, y: number, w: number, h: number, tilt: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  const cork = d.level === 111;
  ctx.fillStyle = cork ? '#b5835a' : 'rgba(10,0,28,0.95)';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = d.tint;
  ctx.lineWidth = 3;
  if (d.style !== 'solid') ctx.setLineDash([4, 4]);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.setLineDash([]);
  for (let r = 0; r < 4; r++) {
    ctx.fillStyle = r === 0 ? '#ffd23f' : cork ? '#f4ecd8' : 'rgba(255,255,255,0.5)';
    ctx.fillRect(-w / 2 + 5, -h / 2 + 6 + r * (h - 12) / 4, w - 10, (h - 12) / 4 - 3);
  }
  // eyes + grin so they "pose"
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-w * 0.18, -h * 0.62, w * 0.09, 0, Math.PI * 2);
  ctx.arc(w * 0.18, -h * 0.62, w * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(-w * 0.16, -h * 0.6, w * 0.04, 0, Math.PI * 2);
  ctx.arc(w * 0.2, -h * 0.6, w * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Scribbled signature: the boss's initials in a script hand plus a looping flourish. */
function signature(ctx: CanvasRenderingContext2D, d: BossDef, x: number, y: number, w: number, seed: number): void {
  const ini = d.name.split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]$/.test(p)).map((p) => p[0]).join('').slice(0, 3) || d.name[0];
  ctx.save();
  ctx.fillStyle = '#1d3bb8';
  ctx.strokeStyle = '#1d3bb8';
  ctx.font = `italic 700 ${Math.max(10, w * 0.32)}px 'Brush Script MT', 'Segoe Script', 'Comic Sans MS', cursive`;
  ctx.textAlign = 'center';
  ctx.fillText(ini, x, y);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  let px = x - w * 0.4;
  ctx.moveTo(px, y + 4);
  for (let i = 0; i < 6; i++) {
    const s = Math.sin(seed * 9.1 + i * 1.7);
    px += w * 0.14;
    ctx.quadraticCurveTo(px - w * 0.07, y + 4 + s * 7, px, y + 4 + Math.cos(seed + i) * 3);
  }
  ctx.stroke();
  ctx.restore();
}

/** Group photo of every boss fought in this run, as a tilted polaroid. */
export function drawGroupPhoto(ctx: CanvasRenderingContext2D, defs: BossDef[], W: number, H: number, u: (n: number) => number, t: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(5,0,18,0.78)';
  ctx.fillRect(0, 0, W, H);
  const portrait = H > W * 1.1;
  const pw = Math.min(W * 0.92, portrait ? W * 0.92 : H * 1.5);
  const ph = Math.min(H * 0.86, pw * (portrait ? 1.25 : 0.68));
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.025 + Math.sin(t * 0.8) * 0.006);
  ctx.fillStyle = '#fbfaf5';
  ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
  const ix = -pw / 2 + pw * 0.05;
  const iy = -ph / 2 + pw * 0.05;
  const iw = pw * 0.9;
  const ih = ph - pw * 0.05 - ph * 0.17;
  const g = ctx.createLinearGradient(0, iy, 0, iy + ih);
  g.addColorStop(0, '#2a0a4a');
  g.addColorStop(0.6, '#ff4ec8');
  g.addColorStop(1, '#ffb347');
  ctx.fillStyle = g;
  ctx.fillRect(ix, iy, iw, ih);
  const list = defs.length ? defs : [];
  const cols = portrait ? Math.min(3, Math.max(1, list.length)) : Math.min(6, Math.max(1, list.length));
  const rowsN = Math.max(1, Math.ceil(list.length / cols));
  const cw = iw / cols;
  const chh = ih / rowsN;
  list.forEach((d, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const inRow = Math.min(cols, list.length - r * cols);
    const off = (cols - inRow) * cw * 0.5;
    const bx = ix + off + c * cw + cw / 2;
    const by = iy + r * chh + chh * 0.5;
    const bw = Math.min(cw * 0.62, chh * 0.42);
    const bh = Math.min(chh * 0.62, bw * 1.5);
    mini(ctx, d, bx, by, bw, bh, Math.sin(i * 2.3) * 0.08);
    signature(ctx, d, bx, by + bh / 2 + Math.max(10, bw * 0.3), bw * 1.2, i + 1);
  });
  // The prize sits front and center.
  drawDuchess(ctx, ix + iw / 2 - Math.min(iw, ih) * 0.04, iy + ih * 0.8, Math.min(iw * 0.3, ih * 0.42), t);
  ctx.fillStyle = '#222';
  ctx.textAlign = 'center';
  ctx.font = `700 ${u(portrait ? 16 : 15)}px 'Comic Sans MS', 'Marker Felt', cursive`;
  ctx.fillText(`THE BOARD · CLASS OF LEVEL 111 (${list.length} BOSS${list.length === 1 ? '' : 'ES'})`, 0, ph / 2 - ph * 0.07);
  ctx.restore();
}

/** THE DUCHESS OF PASADENA: the level 111 prize, a regal cartoon chocolate Lab (neon style). */
export function drawDuchess(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  const coat = '#6b3b1f';
  const coatHi = '#8a5230';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#ff4ec8';
  ctx.shadowBlur = 18;
  // wagging tail
  ctx.save();
  ctx.translate(-48, 18);
  ctx.rotate(-0.6 + Math.sin(t * 12) * 0.45);
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.ellipse(-16, 0, 20, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // body (sitting) + legs
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.ellipse(-10, 22, 46, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = coatHi;
  ctx.fillRect(4, 36, 14, 26);
  ctx.fillRect(22, 36, 14, 26);
  ctx.fillStyle = '#4a2814';
  ctx.beginPath();
  ctx.ellipse(11, 62, 10, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(29, 62, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // sash
  ctx.save();
  ctx.rotate(-0.25);
  ctx.fillStyle = '#ff4ec8';
  ctx.fillRect(-76, 12, 122, 15);
  ctx.fillStyle = '#fff';
  ctx.font = "900 7px 'Orbitron', sans-serif";
  ctx.textAlign = 'center';
  ctx.fillText('DUCHESS OF PASADENA', -15, 22.5, 112);
  ctx.restore();
  // head
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.ellipse(30, -22, 30, 26, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(54, -12, 18, 13, 0.15, 0, Math.PI * 2); // muzzle
  ctx.fill();
  ctx.fillStyle = '#4a2814';
  ctx.beginPath();
  ctx.ellipse(10, -14, 9, 20, 0.35, 0, Math.PI * 2); // ear
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(68, -16, 5, 0, Math.PI * 2); // nose
  ctx.fill();
  ctx.beginPath();
  ctx.arc(38, -28, 4, 0, Math.PI * 2); // eye
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(39.5, -29.5, 1.4, 0, Math.PI * 2);
  ctx.fill();
  // happy tongue
  ctx.fillStyle = '#ff6b8a';
  ctx.beginPath();
  ctx.ellipse(56, -2, 6, 8 + Math.sin(t * 6) * 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // tiny tiara
  ctx.fillStyle = '#ffd23f';
  ctx.shadowColor = '#ffe66d';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(16, -44);
  ctx.lineTo(20, -58);
  ctx.lineTo(26, -48);
  ctx.lineTo(32, -62);
  ctx.lineTo(38, -48);
  ctx.lineTo(44, -58);
  ctx.lineTo(46, -44);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff4ec8';
  ctx.beginPath();
  ctx.arc(32, -50, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The big prize reveal after the group photo: confetti, roses and the Duchess. */
export function drawPrizeReveal(ctx: CanvasRenderingContext2D, W: number, H: number, u: (n: number) => number, t: number, age: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 0, 22, 0.9)';
  ctx.fillRect(0, 0, W, H);
  // confetti + roses
  for (let i = 0; i < 70; i++) {
    const x = ((i * 97.13) % W + Math.sin(t * 1.3 + i) * 12 + W) % W;
    const y = ((i * 53.7 + age * (40 + (i % 5) * 18)) % (H + 40)) - 20;
    if (i % 7 === 0) {
      ctx.fillStyle = '#e0245e';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.arc(x + 3, y - 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2e8b57';
      ctx.fillRect(x - 1, y + 4, 2, 9);
    } else {
      ctx.fillStyle = ['#ffe66d', '#ff4ec8', '#00f0ff', '#9b5cff', '#ffb347'][i % 5];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 3 + i);
      ctx.fillRect(-3, -1.5, 6, 3);
      ctx.restore();
    }
  }
  const portrait = H > W * 1.1;
  const pop = Math.min(1, age / 0.6);
  const ease = 1 - (1 - pop) ** 3;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe66d';
  ctx.shadowColor = '#ffb347';
  ctx.shadowBlur = 16;
  const fit = (txt: string, weight: string, px: number, max: number): void => {
    let s = px;
    ctx.font = `${weight} ${s}px 'Orbitron', sans-serif`;
    while (ctx.measureText(txt).width > max && s > 10) {
      s -= 1;
      ctx.font = `${weight} ${s}px 'Orbitron', sans-serif`;
    }
  };
  fit('YOUR PRIZE:', '800', u(portrait ? 20 : 18), W * 0.9);
  ctx.fillText('YOUR PRIZE:', W / 2, H * (portrait ? 0.17 : 0.14));
  ctx.fillStyle = '#ff9de8';
  fit('THE DUCHESS OF PASADENA', '900', u(portrait ? 26 : 30), W * 0.92);
  ctx.fillText('THE DUCHESS OF PASADENA', W / 2, H * (portrait ? 0.23 : 0.25));
  ctx.shadowBlur = 0;
  // The drawing spans about -0.85..+0.75 of its size horizontally: keep it inside the screen.
  const size = Math.min(W * (portrait ? 0.5 : 0.3), H * (portrait ? 0.34 : 0.42)) * ease;
  if (size > 1) drawDuchess(ctx, W / 2 + size * 0.05, H * (portrait ? 0.52 : 0.6), size, t);
  // Caption just under her paws (upright phones: two lines, clear of the BOOST / stick controls).
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.font = `700 ${u(15)}px 'Rajdhani', sans-serif`;
  if (portrait) {
    const cy = H * 0.52 + Math.max(size, 1) * 0.72 + u(18);
    ctx.fillText('A chocolate Lab of impeccable breeding.', W / 2, cy, W * 0.92);
    ctx.fillText('Good girl.', W / 2, cy + u(19));
  } else {
    ctx.fillText('A chocolate Lab of impeccable breeding. Good girl.', W / 2, H * 0.9, W * 0.6);
  }
  ctx.restore();
}
