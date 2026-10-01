/**
 * Bubble digits made of tiny rubber ducks (Dan's silliness pack). Each glyph (0-9 and the
 * thousands comma) is pre-rendered once per size / colour / font into a sprite: a puffy bubble
 * outline of the digit, filled with a grid of little ducks. Anything else falls back to text.
 * The canvas is not accessible by itself; the game mirrors the score into a live region.
 */
const cache = new Map<string, { c: HTMLCanvasElement; adv: number; base: number; h: number }>();
const SS = 2; // supersample

function duck(g: CanvasRenderingContext2D, x: number, y: number, s: number, flip: boolean): void {
  const d = flip ? -1 : 1;
  g.fillStyle = '#ffd23f';
  g.beginPath();
  g.ellipse(x, y + s * 0.12, s * 0.5, s * 0.34, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(x + d * s * 0.28, y - s * 0.22, s * 0.24, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ff8a00';
  g.beginPath();
  g.moveTo(x + d * s * 0.48, y - s * 0.24);
  g.lineTo(x + d * s * 0.72, y - s * 0.16);
  g.lineTo(x + d * s * 0.48, y - s * 0.1);
  g.fill();
  if (s >= 5) {
    g.fillStyle = '#222';
    g.fillRect(x + d * s * 0.3 - s * 0.05, y - s * 0.3, Math.max(1, s * 0.1), Math.max(1, s * 0.1));
  }
}

function glyph(ch: string, px: number, family: string, ink: string) {
  const h = Math.max(6, Math.round(px));
  const key = `${ch}|${h}|${family}|${ink}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = h * SS;
  const font = `900 ${S}px ${family}`;
  const m = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  m.font = font;
  const adv = m.measureText(ch).width / SS;
  const pad = Math.ceil(S * 0.12);
  const c = document.createElement('canvas');
  c.width = Math.ceil(adv * SS + pad * 2);
  c.height = Math.ceil(S * 1.3 + pad * 2);
  const base = pad + S * 1.0;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.font = font;
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  // Bubble: dark puffy outline, then the ink fill.
  g.strokeStyle = 'rgba(30, 10, 50, 0.9)';
  g.lineWidth = S * 0.16;
  g.strokeText(ch, pad, base);
  g.fillStyle = ink;
  g.fillText(ch, pad, base);
  // Ducks: sample the glyph mask on a grid and drop a duck on every inside point.
  const mk = document.createElement('canvas');
  mk.width = c.width;
  mk.height = c.height;
  const mg = mk.getContext('2d') as CanvasRenderingContext2D;
  mg.font = font;
  mg.fillText(ch, pad, base);
  const data = mg.getImageData(0, 0, mk.width, mk.height).data;
  const step = Math.max(4, S * 0.15);
  let row = 0;
  for (let y = step / 2; y < mk.height; y += step * 0.86, row++) {
    for (let x = step / 2 + (row % 2 ? step / 2 : 0); x < mk.width; x += step) {
      const a = data[(Math.floor(y) * mk.width + Math.floor(x)) * 4 + 3];
      if (a > 140) duck(g, x, y, step * 0.95, (row + Math.floor(x / step)) % 3 === 0);
    }
  }
  const out = { c, adv, base: base / SS, h, pad: pad / SS } as { c: HTMLCanvasElement; adv: number; base: number; h: number; pad?: number };
  cache.set(key, out);
  return out;
}

const DUCKABLE = /[0-9,]/;

function familyOf(ctx: CanvasRenderingContext2D): string {
  const m = /\d+(?:\.\d+)?px\s+(.+)$/.exec(ctx.font);
  return m ? m[1] : "'Rajdhani', sans-serif";
}

function sizeOf(ctx: CanvasRenderingContext2D): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
  return m ? parseFloat(m[1]) : 16;
}

/** Width of text drawn with drawDuckText in the context's current font. */
export function duckWidth(ctx: CanvasRenderingContext2D, text: string): number {
  const px = sizeOf(ctx);
  const fam = familyOf(ctx);
  let w = 0;
  for (const ch of text) w += DUCKABLE.test(ch) ? glyph(ch, px, fam, '#fff').adv : ctx.measureText(ch).width;
  return w;
}

/**
 * Draw text with duck digits in the current font size / family; ink = bubble colour. Honors
 * ctx.textAlign (left / center / right) and ctx.textBaseline (alphabetic / middle). Returns width.
 */
export function drawDuckText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, ink?: string): number {
  const px = sizeOf(ctx);
  const fam = familyOf(ctx);
  const col = ink ?? (typeof ctx.fillStyle === 'string' ? ctx.fillStyle : '#fff');
  const w = duckWidth(ctx, text);
  const align = ctx.textAlign;
  let cx = align === 'center' ? x - w / 2 : align === 'right' || align === 'end' ? x - w : x;
  const by = ctx.textBaseline === 'middle' ? y + px * 0.35 : ctx.textBaseline === 'top' ? y + px * 0.8 : y;
  const saveAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of text) {
    if (DUCKABLE.test(ch)) {
      const gl = glyph(ch, px, fam, col) as { c: HTMLCanvasElement; adv: number; base: number; pad?: number };
      const k = 1 / SS;
      const pad = gl.pad ?? 0;
      ctx.drawImage(gl.c, cx - pad, by - gl.base, gl.c.width * k, gl.c.height * k);
      cx += gl.adv;
    } else {
      const sb = ctx.textBaseline;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(ch, cx, by);
      ctx.textBaseline = sb;
      cx += ctx.measureText(ch).width;
    }
  }
  ctx.textAlign = saveAlign;
  return w;
}
