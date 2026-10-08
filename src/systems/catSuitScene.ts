/**
 * CAT MODE locked: the cats can't breathe in space (Dan, 2026-10-08). G-rated: nobody gets hurt.
 *
 * First locked tap on this device: a ~5 s scene. Three cats with no space suit float up from
 * Earth, their ears go POP! (cartoon ears puff up), the lead cat says "We can't breathe up here!",
 * and all three zip back home to Earth. Then the NEED A SPACE SUIT card. Every later locked tap
 * goes straight to the card (it has a WATCH AGAIN button), so the joke lands once and the useful
 * part, how to unlock, is never more than one tap away.
 *
 * Self-contained DOM overlay with its own canvas and requestAnimationFrame loop, drawn over the
 * MODES menu; the game loop and the run state are untouched.
 */
import { CAT_BREEDS, paintShip } from '../render/shipSprite';
import { localFont, onLang, t as tr } from '../i18n';
import { roundRectPath } from '../render/shapes';

export interface CatSceneOpts {
  /** Play the bounce-home scene first (the first locked tap); false = straight to the card. */
  scene: boolean;
  /** UI blip / promote sounds (optional). */
  sfx?: (kind: 'pop' | 'zip' | 'ui') => void;
  onClose?: () => void;
}

const SCENE_S = 5.2;
const CATS = [CAT_BREEDS[7], CAT_BREEDS[0], CAT_BREEDS[4]];

/** The locked CAT SPACE SUIT icon (inline SVG: a cat-eared helmet + padlock). */
export function lockedSuitSvg(size = 34, locked = true): string {
  const lock = locked
    ? '<g transform="translate(25 24)"><rect x="0" y="5" width="13" height="10" rx="2" fill="#ffe66d" stroke="#0a0018" stroke-width="1.2"/><path d="M3 5.5 V3.2 a3.5 3.5 0 0 1 7 0 V5.5" fill="none" stroke="#ffe66d" stroke-width="2.2"/><circle cx="6.5" cy="10" r="1.6" fill="#0a0018"/></g>'
    : '';
  return (
    `<svg class="suit-ico" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true" focusable="false">` +
    '<path d="M9 13 L11 3 L17 10 Z M31 13 L29 3 L23 10 Z" fill="#cfd9ea" stroke="#0a0018" stroke-width="1"/>' +
    '<path d="M11.3 10.5 L12 5.6 L15 9 Z M28.7 10.5 L28 5.6 L25 9 Z" fill="#ff7ad9"/>' +
    '<circle cx="20" cy="19" r="12.5" fill="rgba(180,240,255,0.25)" stroke="#00f0ff" stroke-width="2"/>' +
    '<path d="M13 15 a8 8 0 0 1 6 -5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>' +
    '<rect x="9" y="30" width="22" height="7" rx="3.5" fill="#eef4ff" stroke="#0a0018" stroke-width="1"/>' +
    '<rect x="9" y="32.6" width="22" height="1.8" fill="#00f0ff"/>' +
    lock +
    '</svg>'
  );
}

let open = false;

/** Show the locked-cat-mode flow (scene and/or card). Ignored if it's already up. */
export function showCatSuitLocked(opts: CatSceneOpts): void {
  if (open) return;
  open = true;
  const host = document.getElementById('app') ?? document.body;
  const el = document.createElement('div');
  el.id = 'catsuit';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'cs-title');
  const cv = document.createElement('canvas');
  cv.className = 'cs-canvas';
  cv.setAttribute('aria-hidden', 'true');
  const live = document.createElement('p');
  live.className = 'cs-live';
  live.setAttribute('aria-live', 'polite');
  const card = document.createElement('div');
  card.className = 'cs-card';
  card.innerHTML =
    `<div class="cs-icon">${lockedSuitSvg(64)}</div>` +
    '<p id="cs-title" class="cs-title"></p><p class="cs-body"></p>' +
    '<div class="cs-btns"><button type="button" class="cs-btn cs-replay" draggable="false"></button>' +
    '<button type="button" class="cs-btn cs-ok" draggable="false"></button></div>';
  el.append(cv, live, card);
  host.appendChild(el);
  // Taps and keys here never reach the game / MODES menu underneath.
  for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup', 'touchstart', 'touchend'])
    el.addEventListener(ev, (e) => e.stopPropagation());

  const title = card.querySelector<HTMLElement>('.cs-title')!;
  const body = card.querySelector<HTMLElement>('.cs-body')!;
  const ok = card.querySelector<HTMLButtonElement>('.cs-ok')!;
  const replay = card.querySelector<HTMLButtonElement>('.cs-replay')!;
  const sync = (): void => {
    title.textContent = tr('cm_suit_title');
    body.textContent = tr('cm_suit_body');
    ok.textContent = tr('btn_ok');
    replay.textContent = tr('cm_replay');
  };
  sync();
  onLang(() => {
    if (open) sync();
  });

  let raf = 0;
  let t0 = 0;
  let popped = false;
  let zipped = false;
  const g = cv.getContext('2d');
  const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.3, p: Math.random() * 6 }));

  const showCard = (): void => {
    cancelAnimationFrame(raf);
    raf = 0;
    el.classList.add('card-on');
    live.textContent = `${tr('cm_suit_title')} ${tr('cm_suit_body')}`;
    ok.focus({ preventScroll: true });
  };
  const close = (): void => {
    cancelAnimationFrame(raf);
    open = false;
    el.remove();
    opts.onClose?.();
  };
  const play = (): void => {
    el.classList.remove('card-on');
    popped = false;
    zipped = false;
    t0 = performance.now();
    live.textContent = `${tr('cm_breathe')} ${tr('cm_zoom')}`;
    const frame = (now: number): void => {
      const s = (now - t0) / 1000;
      draw(s);
      if (s >= 1.25 && !popped) {
        popped = true;
        opts.sfx?.('pop');
      }
      if (s >= 3.2 && !zipped) {
        zipped = true;
        opts.sfx?.('zip');
      }
      if (s >= SCENE_S) showCard();
      else raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  };

  const draw = (s: number): void => {
    if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = el.clientWidth || 390;
    const H = el.clientHeight || 844;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // space
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05000f');
    sky.addColorStop(1, '#1a0636');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    for (const st of stars) {
      g.globalAlpha = 0.45 + 0.4 * Math.sin(st.p + s * 3);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(st.x * W, st.y * H, st.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // Earth (home), peeking up at the bottom
    const er = Math.min(W, H) * 0.42;
    const ex = W * 0.5;
    const ey = H + er * 0.45;
    const eg = g.createRadialGradient(ex - er * 0.3, ey - er * 0.4, er * 0.1, ex, ey, er);
    eg.addColorStop(0, '#5fd3ff');
    eg.addColorStop(1, '#1b5fb0');
    g.fillStyle = eg;
    g.beginPath();
    g.arc(ex, ey, er, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5ee08a';
    for (const [ax, ay, rx, ry] of [[-0.45, -0.72, 0.22, 0.1], [0.15, -0.8, 0.18, 0.08], [0.5, -0.62, 0.14, 0.09], [-0.1, -0.6, 0.12, 0.06]] as const) {
      g.beginPath();
      g.ellipse(ex + ax * er, ey + ay * er, rx * er, ry * er, 0.2, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(160, 230, 255, 0.55)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(ex, ey, er + 4, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
    if (s > 4.2) {
      // a happy twinkle where they landed
      const k = Math.min(1, (s - 4.2) / 0.5);
      g.save();
      g.translate(ex, ey - er);
      g.rotate(s * 2);
      g.globalAlpha = 1 - Math.abs(k - 0.5);
      g.fillStyle = '#ffe66d';
      star(g, 0, 0, 16 * k + 4, 6 * k + 2, 5);
      g.restore();
      g.globalAlpha = 1;
    }

    const size = Math.max(1.6, Math.min(W, H) / 150);
    const home = { x: ex, y: ey - er };
    const spots = [
      { x: W * 0.5, y: H * 0.38 },
      { x: W * 0.24, y: H * 0.5 },
      { x: W * 0.74, y: H * 0.52 },
    ];
    // ears: 1 -> big POP between 1.2 and 1.5 s (wobbly afterwards)
    const earK = s < 1.2 ? 1 : s < 1.45 ? 1 + ((s - 1.2) / 0.25) * 0.9 : 1.9 + Math.sin(s * 18) * 0.06;
    CATS.forEach((b, i) => {
      const sp = spots[i];
      let x: number;
      let y: number;
      let sc = size * (i === 0 ? 1.25 : 1);
      let rot = 0;
      if (s < 1.2) {
        // float up from Earth
        const k = easeOut(Math.min(1, s / 1.2));
        x = home.x + (sp.x - home.x) * k;
        y = home.y + (sp.y - home.y) * k;
      } else if (s < 3.2) {
        x = sp.x + Math.sin(s * 9 + i) * 2.5;
        y = sp.y + Math.sin(s * 3 + i * 2) * 4;
        rot = Math.sin(s * 7 + i) * 0.05;
      } else {
        // zip home
        const k = Math.min(1, (s - 3.2 - i * 0.12) / 0.8);
        const e = k <= 0 ? 0 : easeIn(k);
        x = sp.x + (home.x - sp.x) * e;
        y = sp.y + (home.y - sp.y) * e;
        sc *= 1 - 0.8 * e;
        rot = Math.atan2(home.y - sp.y, home.x - sp.x) * Math.min(1, k * 3) * 0.6;
        if (k > 0 && k < 1) {
          // speed lines
          g.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          g.lineWidth = 2;
          const dx = sp.x - home.x;
          const dy = sp.y - home.y;
          const d = Math.hypot(dx, dy) || 1;
          for (const off of [-10, 0, 10]) {
            const ox = (-dy / d) * off * size * 0.4;
            const oy = (dx / d) * off * size * 0.4;
            g.beginPath();
            g.moveTo(x + ox, y + oy);
            g.lineTo(x + ox + (dx / d) * 60 * size * 0.4, y + oy + (dy / d) * 60 * size * 0.4);
            g.stroke();
          }
        }
        if (k >= 1) return;
      }
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.scale(sc, sc);
      paintShip(g, b, { noSuit: true, noHelmet: true, earK, accent: '#ff7ad9' });
      g.restore();
      // POP! bursts by the ears
      if (s >= 1.2 && s < 2.2) {
        const k = (s - 1.2) / 1.0;
        const hx = x + (b.bodyL + b.headR * 0.55 - 4) * sc;
        const hy = y - (b.bodyH + b.headR * 1.6) * sc;
        g.save();
        g.globalAlpha = 1 - k * 0.8;
        g.translate(hx, hy - k * 10);
        g.fillStyle = '#ffe66d';
        star(g, 0, 0, 13 * size * 0.55 + k * 6, 6 * size * 0.55, 8);
        g.fillStyle = '#ff2bd6';
        g.font = localFont(`900 ${Math.round(9 * size * 0.55 + 4)}px 'Orbitron', sans-serif`);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('POP!', 0, 1);
        g.restore();
        g.globalAlpha = 1;
      }
    });

    // speech bubble from the lead cat
    if (s >= 1.6 && s < 3.4) {
      const a = Math.min(1, (s - 1.6) / 0.2) * Math.min(1, (3.4 - s) / 0.2);
      bubble(g, spots[0].x, spots[0].y - 48 * size * 0.55 - 24, tr('cm_breathe'), W, a, size);
    }
    // caption while they zip home
    if (s >= 3.2) {
      const a = Math.min(1, (s - 3.2) / 0.25);
      g.globalAlpha = a;
      g.fillStyle = '#ffe66d';
      g.font = localFont(`900 ${Math.round(Math.min(26, W / 16))}px 'Orbitron', sans-serif`);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = '#ff2bd6';
      g.shadowBlur = 12;
      fitText(g, tr('cm_zoom'), W / 2, H * 0.2, W * 0.9);
      g.shadowBlur = 0;
      g.globalAlpha = 1;
    }
  };

  ok.addEventListener('click', close);
  replay.addEventListener('click', () => play());
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  // Tapping during the scene skips to the card.
  cv.addEventListener('pointerup', () => {
    if (!el.classList.contains('card-on') && raf) showCard();
  });
  if (opts.scene) play();
  else {
    draw(0);
    showCard();
  }
}

/** True while the locked-cat-mode overlay is up. */
export function catSuitOpen(): boolean {
  return open;
}

const easeOut = (k: number): number => 1 - (1 - k) * (1 - k);
const easeIn = (k: number): number => k * k;

function star(g: CanvasRenderingContext2D, x: number, y: number, R: number, r: number, n: number): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2;
    const rr = i % 2 ? r : R;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number): void {
  const w = g.measureText(text).width;
  if (w > max) {
    g.save();
    g.translate(x, y);
    g.scale(max / w, 1);
    g.fillText(text, 0, 0);
    g.restore();
  } else g.fillText(text, x, y);
}

/** White comic speech bubble with its tail pointing down at (x, y + h/2 + tail). */
function bubble(g: CanvasRenderingContext2D, x: number, y: number, text: string, W: number, alpha: number, size: number): void {
  const fs = Math.round(Math.max(15, Math.min(22, W / 20)));
  g.font = localFont(`700 ${fs}px 'Rajdhani', sans-serif`);
  const maxW = Math.min(W * 0.8, 340);
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur + w;
    if (g.measureText(next).width > maxW - 24 && cur.trim()) {
      lines.push(cur.trim());
      cur = w.trimStart();
    } else cur = next;
  }
  if (cur.trim()) lines.push(cur.trim());
  // CJK / Thai without spaces: hard-wrap by characters.
  const out: string[] = [];
  for (const ln of lines) {
    if (g.measureText(ln).width <= maxW - 24) {
      out.push(ln);
      continue;
    }
    let c = '';
    for (const ch of Array.from(ln)) {
      if (g.measureText(c + ch).width > maxW - 24 && c) {
        out.push(c);
        c = ch;
      } else c += ch;
    }
    if (c) out.push(c);
  }
  const lh = fs * 1.2;
  const bw = Math.min(maxW, Math.max(...out.map((l) => g.measureText(l).width)) + 28);
  const bh = out.length * lh + 18;
  const bx = Math.max(8, Math.min(W - bw - 8, x - bw / 2));
  const by = y - bh;
  g.globalAlpha = alpha;
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#0a0018';
  g.lineWidth = 2.5;
  roundRectPath(g, bx, by, bw, bh, 14);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(x - 8, by + bh - 1);
  g.lineTo(x + 2, by + bh + 14 * Math.max(1, size * 0.4));
  g.lineTo(x + 10, by + bh - 1);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(x - 8, by + bh);
  g.lineTo(x + 2, by + bh + 14 * Math.max(1, size * 0.4));
  g.lineTo(x + 10, by + bh);
  g.stroke();
  g.fillStyle = '#2a1050';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  out.forEach((l, i) => g.fillText(l, bx + bw / 2, by + 9 + lh * (i + 0.5)));
  g.globalAlpha = 1;
}
