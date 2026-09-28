import { AudioEngine } from '../audio/AudioEngine';
import { Player } from '../entities/Player';
import { WorldSpawner, aabb, circleRect, type Obstacle } from '../entities/Obstacles';
import { Input } from './Input';
import { ParticleSystem } from './Particles';
import { Renderer } from './Renderer';
import { clamp } from '../utils/math';
import {
  loadHighScore,
  saveHighScore,
  loadHandPreference,
  saveHandPreference,
  applyHandPreference,
  loadLeaderboard,
  qualifiesForBoard,
  addEntry,
  nextLetter,
  type HandPreference,
  type LeaderboardEntry,
} from '../utils/storage';

export type GameState = 'title' | 'playing' | 'paused' | 'initials' | 'gameover';

const LANDSCAPE_W = 960;
const LANDSCAPE_H = 540;
const PORTRAIT_W = 600;

export interface GameOptions {
  touchPrimary?: boolean;
}

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input: Input;
  private audio = new AudioEngine();
  private player = new Player();
  private world = new WorldSpawner();
  private particles = new ParticleSystem();
  private renderer: Renderer;
  private touchPrimary: boolean;

  private state: GameState = 'title';
  private lastTs = 0;
  private score = 0;
  private high = 0;
  private distance = 0;
  private charge = 1;
  private scrollSpeed = 220;
  private newBest = false;
  private pulse = 0;
  private leaderboard: LeaderboardEntry[] = [];
  private highlightIndex = -1;
  private initialsChars = ['A', 'A', 'A'];
  private initialsSlot = 0;
  private initialsCooldown = 0;
  private pendingScore = 0;
  private dpr = 1;
  private viewW = LANDSCAPE_W;
  private viewH = LANDSCAPE_H;
  private lastBufW = 0;
  private lastBufH = 0;
  private floaters: { x: number; y: number; text: string; life: number; color: string }[] = [];
  private floaterPool: { x: number; y: number; text: string; life: number; color: string }[] = [];
  /** Accumulators to throttle particle spawn on mobile Safari. */
  private trailAcc = 0;
  /** Locked screen aspect while in an orientation (URL-bar noise). */
  private stableAspect = LANDSCAPE_H / LANDSCAPE_W;
  private lastPortrait: boolean | null = null;
  private fitRaf = 0;
  private bufTimer = 0;
  private pendingBufW = 0;
  private pendingBufH = 0;
  private slowFrames = 0;
  private pauseDrawn = false;
  private wake: { release: () => Promise<void> } | null = null;

  constructor(canvas: HTMLCanvasElement, opts: GameOptions = {}) {
    this.canvas = canvas;
    this.touchPrimary = !!opts.touchPrimary;
    // desynchronized can blank frames on some iOS Safari builds — skip on touch.
    const ctx = canvas.getContext(
      '2d',
      this.touchPrimary
        ? ({ alpha: false } as CanvasRenderingContext2DSettings)
        : ({ alpha: false, desynchronized: true } as CanvasRenderingContext2DSettings),
    );
    if (!ctx) throw new Error('Canvas 2D not available');
    this.ctx = ctx;
    this.input = new Input();
    this.renderer = new Renderer(this.viewW, this.viewH);

    // Mobile Safari perf: fewer particles / glow / scanlines / rays
    if (this.touchPrimary) {
      this.renderer.lite = true;
      this.renderer.touchUi = true;
      this.particles.maxParticles = 32;
      this.particles.useGlow = false;
      this.player.maxTrail = 4;
      this.renderer.resize(this.viewW, this.viewH); // rebuild backdrop at lite star count
    }

    this.leaderboard = loadLeaderboard();
    this.high = loadHighScore();
    this.fitCanvas();
    // iOS often reports 0 safe-area until after first layout / font load
    requestAnimationFrame(() => {
      this.fitCanvas();
      requestAnimationFrame(this.fitCanvas);
    });
    void document.fonts?.ready.then(() => this.fitCanvas());
    window.addEventListener('resize', this.requestFit);
    window.addEventListener('orientationchange', this.onOrientation);
    window.visualViewport?.addEventListener('resize', this.requestFit);
    window.visualViewport?.addEventListener('scroll', this.requestFit);
    screen.orientation?.addEventListener('change', this.onOrientation);

    // iOS Web Audio: create/resume synchronously from a real gesture. Keep
    // listeners forever so a later interrupt (lock, call) can re-unlock on tap.
    const unlockOnGesture = () => {
      void this.audio.unlock();
    };
    window.addEventListener('pointerdown', unlockOnGesture, { capture: true, passive: false });
    window.addEventListener('pointerup', unlockOnGesture, { capture: true });
    window.addEventListener('touchstart', unlockOnGesture, { capture: true, passive: false });
    window.addEventListener('touchend', unlockOnGesture, { capture: true, passive: false });
    window.addEventListener('click', unlockOnGesture, { capture: true });
    window.addEventListener('pageshow', () => {
      void this.audio.unlock();
      this.fitCanvas();
    });

    // Auto-pause when Safari backgrounds the tab / locks the phone.
    const autoPause = (): void => {
      if (this.state === 'playing') {
        this.state = 'paused';
        this.input.clearTouch();
        this.setBodyFlags();
      } else {
        this.input.clearTouch();
      }
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        autoPause();
      } else if (document.visibilityState === 'visible') {
        void this.audio.unlock();
        this.syncWakeLock();
      }
    });
    window.addEventListener('pagehide', autoPause);

    const app = document.getElementById('app') ?? canvas;
    app.addEventListener('pointerdown', this.onPointer, { passive: false });
    this.bindChrome();
    this.setBodyFlags();
  }

  private bindChrome(): void {
    const bindTap = (el: HTMLElement | null, fn: () => void): void => {
      if (!el) return;
      let armed = false;
      let fromPointer = false;
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        // Do not preventDefault — Safari can drop pointerup/click if we do.
        if (e.button !== undefined && e.button !== 0) return;
        armed = true;
      });
      el.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        if (!armed) return;
        armed = false;
        fromPointer = true;
        fn();
      });
      el.addEventListener('pointercancel', () => {
        armed = false;
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (fromPointer) {
          fromPointer = false;
          return;
        }
        fn();
      });
    };

    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) muteBtn.style.touchAction = 'none';
    bindTap(muteBtn, () => {
      void this.audio.unlock();
      const muted = this.audio.toggleMute();
      if (muteBtn) muteBtn.textContent = muted ? '🔇' : '🔊';
    });

    bindTap(document.getElementById('pause-btn'), () => {
      void this.audio.unlock();
      this.togglePause();
    });

    // BOOST doubles as Start / Ride Again / Confirm (large thumb target).
    const boost = document.querySelector<HTMLButtonElement>('[data-action="boost"]');
    boost?.addEventListener('pointerdown', (e) => {
      if (this.state === 'title' || this.state === 'gameover') {
        e.stopPropagation();
        void this.audio.unlock();
        this.beginRun();
      } else if (this.state === 'initials') {
        e.stopPropagation();
        void this.audio.unlock();
        this.confirmInitials();
      }
    });

    // Left / right hand virtual controls (title & game-over menus)
    const handBtn = document.getElementById('hand-btn');
    const syncHandBtn = (hand: HandPreference): void => {
      if (!handBtn) return;
      if (hand === 'left') {
        handBtn.textContent = 'LEFT HAND';
        handBtn.setAttribute('aria-label', 'Left-hand controls — tap for right hand');
      } else {
        handBtn.textContent = 'RIGHT HAND';
        handBtn.setAttribute('aria-label', 'Right-hand controls — tap for left hand');
      }
    };
    syncHandBtn(loadHandPreference());
    bindTap(handBtn, () => {
      void this.audio.unlock();
      const next: HandPreference = loadHandPreference() === 'left' ? 'right' : 'left';
      saveHandPreference(next);
      applyHandPreference(next);
      syncHandBtn(next);
      this.input.clearTouch();
      this.audio.playUi();
    });
  }

  start(): void {
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      requestAnimationFrame(loop);
      if (document.visibilityState === 'hidden') {
        this.lastTs = ts;
        return;
      }
      const rawMs = ts - this.lastTs;
      const dt = clamp(rawMs / 1000, 0, 0.05);
      this.lastTs = ts;
      if (this.touchPrimary) {
        if (rawMs > 23 && rawMs < 200) this.slowFrames = Math.min(90, this.slowFrames + 1);
        else this.slowFrames = Math.max(0, this.slowFrames - 2);
        if (this.pulse > 1.5 && this.slowFrames > 50 && this.renderer.gridEnabled) {
          this.renderer.gridEnabled = false;
          this.particles.maxParticles = 20;
        }
      }
      this.tick(dt);
      if (this.state === 'paused' && this.pauseDrawn) return;
      this.draw();
      this.pauseDrawn = this.state === 'paused';
    };
    requestAnimationFrame(loop);
  }

  private onOrientation = (): void => {
    // Safari often reports old sizes until after the rotation settles
    this.lastPortrait = null;
    this.input.clearTouch();
    window.setTimeout(this.requestFit, 50);
    window.setTimeout(this.requestFit, 250);
    window.setTimeout(this.requestFit, 500);
  };

  /** Coalesce visualViewport scroll/resize onto one rAF (URL-bar animation). */
  private requestFit = (): void => {
    if (this.fitRaf) return;
    this.fitRaf = requestAnimationFrame(() => {
      this.fitRaf = 0;
      this.fitCanvas();
    });
  };

  /** Read env(safe-area-inset-*) via #safe-probe padding (updates on rotate). */
  private readSafeInsets(): { top: number; right: number; bottom: number; left: number } {
    const n = (raw: string) => {
      const parsed = parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const probe = document.getElementById('safe-probe');
    if (probe) {
      const cs = getComputedStyle(probe);
      const insets = {
        top: n(cs.paddingTop),
        right: n(cs.paddingRight),
        bottom: n(cs.paddingBottom),
        left: n(cs.paddingLeft),
      };
      const root = document.documentElement.style;
      root.setProperty('--sat', `${insets.top}px`);
      root.setProperty('--sar', `${insets.right}px`);
      root.setProperty('--sab', `${insets.bottom}px`);
      root.setProperty('--sal', `${insets.left}px`);
      return insets;
    }
    const cs = getComputedStyle(document.documentElement);
    return {
      top: n(cs.getPropertyValue('--sat')),
      right: n(cs.getPropertyValue('--sar')),
      bottom: n(cs.getPropertyValue('--sab')),
      left: n(cs.getPropertyValue('--sal')),
    };
  }

  /** Logical px reserved so craft stays above thumb stick / BOOST / notch. */
  private touchReserves(): { top: number; bottom: number; left: number } {
    if (!this.touchPrimary) return { top: 60, bottom: 60, left: 20 };
    const portrait = this.viewH > this.viewW * 1.05;
    const top = Math.round(Math.max(70, this.viewH * 0.08) + this.renderer.padTop);
    const bottom = Math.round(this.viewH * (portrait ? 0.22 : 0.16) + this.renderer.padBottom);
    const left = Math.round(20 + this.renderer.padLeft);
    return { top, bottom: Math.max(96, bottom), left };
  }

  /**
   * Pin #app to visualViewport and fill it (no letterbox on phones).
   * Desktop keeps a 16:9 letterbox. HUD uses safe-area pads; canvas itself
   * draws under the notch so the playfield never shrinks into a strip.
   */
  private fitCanvas = (): void => {
    const vv = window.visualViewport;
    // Safari can report visualViewport.width/height as 0 during rotate.
    // Keep fractional CSS px — flooring leaves a 1px letterbox gap on iOS.
    const layoutW = Math.max(1, document.documentElement.clientWidth || window.innerWidth || 1);
    const layoutH = Math.max(1, document.documentElement.clientHeight || window.innerHeight || 1);
    const cssW = vv && vv.width > 1 ? vv.width : layoutW;
    const cssH = vv && vv.height > 1 ? vv.height : layoutH;
    const offsetLeft = Math.max(0, vv?.offsetLeft ?? 0);
    const offsetTop = Math.max(0, vv?.offsetTop ?? 0);

    document.documentElement.style.setProperty('--vvh', `${cssH}px`);
    if (this.touchPrimary) {
      document.documentElement.style.height = `${cssH}px`;
      document.documentElement.style.maxHeight = `${cssH}px`;
      document.body.style.height = `${cssH}px`;
      document.body.style.maxHeight = `${cssH}px`;
      document.body.style.minHeight = '0';
    }

    const app = this.canvas.parentElement;
    if (app && this.touchPrimary) {
      app.style.position = 'fixed';
      app.style.left = '0';
      app.style.top = '0';
      app.style.width = `${cssW}px`;
      app.style.height = `${cssH}px`;
      app.style.right = 'auto';
      app.style.bottom = 'auto';
      app.style.margin = '0';
      app.style.padding = '0';
      app.style.minHeight = '0';
      app.style.maxHeight = `${cssH}px`;
      app.style.overflow = 'hidden';
      app.style.touchAction = 'none';
      app.style.transform = `translate(${offsetLeft}px, ${offsetTop}px)`;
    }

    const portrait = cssH >= cssW;
    document.body.classList.toggle('portrait', portrait);
    document.body.classList.toggle('landscape', !portrait);

    const nextW = this.touchPrimary ? (portrait ? PORTRAIT_W : LANDSCAPE_W) : LANDSCAPE_W;
    const rawAspect = cssH / Math.max(1, cssW);
    if (this.touchPrimary) {
      if (this.lastPortrait === null || this.lastPortrait !== portrait) {
        this.stableAspect = rawAspect;
        this.lastPortrait = portrait;
      } else if (Math.abs(rawAspect - this.stableAspect) / this.stableAspect > 0.1) {
        // Real resize (split view / large chrome), not URL-bar jitter
        this.stableAspect = rawAspect;
      }
    }
    const nextH = this.touchPrimary
      ? Math.max(320, Math.round(nextW * this.stableAspect))
      : LANDSCAPE_H;
    const viewChanged = nextW !== this.viewW || nextH !== this.viewH;
    if (viewChanged) {
      this.viewW = nextW;
      this.viewH = nextH;
      this.renderer.resize(this.viewW, this.viewH);
    }

    let displayW: number;
    let displayH: number;
    if (this.touchPrimary) {
      displayW = cssW;
      displayH = cssH;
      // Explicit CSS px avoids % rounding letterbox on Safari.
      this.canvas.style.width = `${cssW}px`;
      this.canvas.style.height = `${cssH}px`;
      this.canvas.style.maxWidth = 'none';
      this.canvas.style.maxHeight = 'none';
      this.canvas.style.touchAction = 'none';
    } else {
      const letter = Math.min(cssW / this.viewW, cssH / this.viewH);
      displayW = Math.max(1, Math.floor(this.viewW * letter));
      displayH = Math.max(1, Math.floor(this.viewH * letter));
      this.canvas.style.width = `${displayW}px`;
      this.canvas.style.height = `${displayH}px`;
    }

    const rawDpr = window.devicePixelRatio || 1;
    const minSide = Math.min(cssW, cssH);
    const dprCap = this.touchPrimary
      ? (minSide >= 900 ? 1.35 : minSide >= 700 ? 1.25 : 1.15)
      : 2;
    this.dpr = Math.min(rawDpr, dprCap);
    const scale = displayW / this.viewW;
    this.renderer.uiBoost = this.touchPrimary && scale > 0
      ? clamp(0.95 / scale, 1, 1.65)
      : 1;

    const bufW = Math.max(1, Math.round(displayW * this.dpr));
    const bufH = Math.max(1, Math.round(displayH * this.dpr));
    this.pendingBufW = bufW;
    this.pendingBufH = bufH;
    const dw = Math.abs(bufW - this.lastBufW);
    const dh = Math.abs(bufH - this.lastBufH);
    const applyBuf = (): void => {
      if (this.pendingBufW === this.lastBufW && this.pendingBufH === this.lastBufH) return;
      this.lastBufW = this.pendingBufW;
      this.lastBufH = this.pendingBufH;
      this.canvas.width = this.lastBufW;
      this.canvas.height = this.lastBufH;
      this.ctx.setTransform(this.lastBufW / this.viewW, 0, 0, this.lastBufH / this.viewH, 0, 0);
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = this.touchPrimary ? 'low' : 'medium';
      // Backing store wipe — force a redraw even if paused.
      this.pauseDrawn = false;
    };
    if (this.lastBufW === 0 || dw > 32 || dh > 32) {
      window.clearTimeout(this.bufTimer);
      applyBuf();
    } else if (dw > 0 || dh > 0) {
      window.clearTimeout(this.bufTimer);
      this.bufTimer = window.setTimeout(applyBuf, 90);
    }
    if (this.lastBufW > 0 && this.lastBufH > 0) {
      this.ctx.setTransform(this.lastBufW / this.viewW, 0, 0, this.lastBufH / this.viewH, 0, 0);
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = this.touchPrimary ? 'low' : 'medium';
    }

    // Pads before reserves so the craft / HUD clear the island on first layout
    const safe = this.readSafeInsets();
    const sx = this.viewW / displayW;
    const sy = this.viewH / displayH;
    this.renderer.padTop = safe.top * sy;
    this.renderer.padRight = safe.right * sx;
    this.renderer.padBottom = safe.bottom * sy;
    this.renderer.padLeft = safe.left * sx;
    this.renderer.chromeRight = this.touchPrimary ? 128 * sx : 0;

    const r = this.touchReserves();
    this.player.x = clamp(this.player.x, r.left, this.viewW * 0.55);
    this.player.y = clamp(this.player.y, r.top, this.viewH - r.bottom);
    if (this.state === 'paused') this.pauseDrawn = false;
  };

  private syncWakeLock(): void {
    const want = this.touchPrimary && this.state === 'playing';
    if (want) void this.requestWake();
    else void this.releaseWake();
  }

  private async requestWake(): Promise<void> {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock || this.wake) return;
    try {
      this.wake = await nav.wakeLock.request('screen');
    } catch {
      this.wake = null;
    }
  }

  private async releaseWake(): Promise<void> {
    try {
      await this.wake?.release();
    } catch {
      /* ignore */
    }
    this.wake = null;
  }

  private onPointer = (e: PointerEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('#mute-btn, #pause-btn, #hand-btn')) return;
    // Stick / BOOST handle themselves while a run is live or entering initials
    if (
      (this.state === 'playing' || this.state === 'initials') &&
      t?.closest?.('#joy-zone, [data-action="boost"]')
    ) {
      return;
    }
    if (e.cancelable) e.preventDefault();
    void this.audio.unlock();
    if (this.state === 'title' || this.state === 'gameover') this.beginRun();
    else if (this.state === 'paused') this.togglePause();
    // initials: stick / BOOST / keys handle entry — ignore canvas taps
  };

  private setBodyFlags(): void {
    document.body.classList.toggle('playing', this.state === 'playing');
    document.body.classList.toggle('paused', this.state === 'paused');
    document.body.classList.toggle('title-screen', this.state === 'title');
    document.body.classList.toggle('gameover', this.state === 'gameover');
    document.body.classList.toggle('initials', this.state === 'initials');
    this.syncWakeLock();
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.textContent = this.state === 'paused' ? '▶' : '⏸';
      pauseBtn.setAttribute('aria-label', this.state === 'paused' ? 'Resume' : 'Pause');
    }
    const boost = document.querySelector<HTMLButtonElement>('[data-action="boost"]');
    if (boost) {
      if (this.state === 'title') {
        boost.textContent = 'START';
        boost.setAttribute('aria-label', 'Start');
      } else if (this.state === 'initials') {
        boost.textContent = 'OK';
        boost.setAttribute('aria-label', 'Confirm initials');
      } else if (this.state === 'gameover') {
        boost.textContent = 'RIDE';
        boost.setAttribute('aria-label', 'Ride again');
      } else {
        boost.textContent = 'BOOST';
        boost.setAttribute('aria-label', 'Boost');
      }
    }
    const hint = document.getElementById('touch-hint');
    if (hint) {
      const hand = loadHandPreference() === 'left' ? 'Left hand' : 'Right hand';
      if (this.state === 'title') hint.textContent = `Tap to start · ${hand}`;
      else if (this.state === 'initials') hint.textContent = 'Stick · letters · OK';
      else if (this.state === 'gameover') hint.textContent = 'Tap · RIDE AGAIN';
      else hint.textContent = 'Stick · BOOST';
    }
  }

  private spawnFloater(x: number, y: number, text: string, color: string): void {
    const f = this.floaterPool.pop() ?? { x: 0, y: 0, text: '', life: 0, color: '' };
    f.x = x;
    f.y = y;
    f.text = text;
    f.life = 0.7;
    f.color = color;
    this.floaters.push(f);
  }

  private togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.input.clearTouch();
      this.audio.playUi();
      this.setBodyFlags();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.audio.playUi();
      this.setBodyFlags();
    }
  }

  private beginRun(): void {
    this.audio.playStart();
    this.state = 'playing';
    this.setBodyFlags();
    this.score = 0;
    this.distance = 0;
    this.charge = 1;
    this.scrollSpeed = 240;
    this.newBest = false;
    this.highlightIndex = -1;
    this.player.reset(this.viewH);
    this.world.reset();
    this.particles.clear();
    while (this.floaters.length) {
      const f = this.floaters.pop();
      if (f) this.floaterPool.push(f);
    }
    this.renderer.shake = 0;
    this.renderer.flash = 0;
    this.input.clearTouch();
    this.input.clearJustPressed();
  }

  private endRun(): void {
    this.input.clearTouch();
    this.audio.playGameOver();
    this.pendingScore = Math.floor(this.score);
    this.leaderboard = loadLeaderboard();
    if (this.pendingScore > this.high) {
      this.high = this.pendingScore;
      this.newBest = true;
    } else {
      this.newBest = false;
    }
    // Keep legacy single-key in sync even if they skip the board
    saveHighScore(this.pendingScore);
    this.high = Math.max(this.high, loadHighScore());

    if (qualifiesForBoard(this.pendingScore, this.leaderboard)) {
      this.initialsChars = ['A', 'A', 'A'];
      this.initialsSlot = 0;
      this.initialsCooldown = 0.25;
      this.highlightIndex = -1;
      this.state = 'initials';
      this.setBodyFlags();
      this.input.clearJustPressed();
      return;
    }
    this.highlightIndex = -1;
    this.state = 'gameover';
    this.setBodyFlags();
  }

  private confirmInitials(): void {
    if (this.state !== 'initials') return;
    const initials = this.initialsChars.join('');
    const result = addEntry(this.pendingScore, initials);
    this.leaderboard = result.board;
    this.highlightIndex = result.index;
    this.high = loadHighScore();
    this.audio.playUi();
    this.state = 'gameover';
    this.setBodyFlags();
    this.input.clearTouch();
    this.input.clearJustPressed();
  }

  private tickInitials(dt: number): void {
    this.renderer.update(dt, 40);
    this.particles.update(dt);
    this.initialsCooldown = Math.max(0, this.initialsCooldown - dt);

    if (this.input.consume(' ') || this.input.consume('enter')) {
      this.confirmInitials();
      return;
    }

    const axis = this.input.axis;
    const thresh = 0.55;
    let moved = false;

    // Discrete keys / D-pad via justPressed (no spam)
    if (this.input.consume('arrowleft') || this.input.consume('a')) {
      this.initialsSlot = (this.initialsSlot + 2) % 3;
      moved = true;
    } else if (this.input.consume('arrowright') || this.input.consume('d')) {
      this.initialsSlot = (this.initialsSlot + 1) % 3;
      moved = true;
    }
    if (this.input.consume('arrowup') || this.input.consume('w')) {
      this.initialsChars[this.initialsSlot] = nextLetter(this.initialsChars[this.initialsSlot], 1);
      moved = true;
    } else if (this.input.consume('arrowdown') || this.input.consume('s')) {
      this.initialsChars[this.initialsSlot] = nextLetter(this.initialsChars[this.initialsSlot], -1);
      moved = true;
    }

    // Analog stick: rate-limited so it doesn't spam letter changes
    if (!moved && this.initialsCooldown <= 0) {
      if (axis.x <= -thresh) {
        this.initialsSlot = (this.initialsSlot + 2) % 3;
        this.initialsCooldown = 0.22;
        moved = true;
      } else if (axis.x >= thresh) {
        this.initialsSlot = (this.initialsSlot + 1) % 3;
        this.initialsCooldown = 0.22;
        moved = true;
      } else if (axis.y <= -thresh) {
        this.initialsChars[this.initialsSlot] = nextLetter(this.initialsChars[this.initialsSlot], 1);
        this.initialsCooldown = 0.18;
        moved = true;
      } else if (axis.y >= thresh) {
        this.initialsChars[this.initialsSlot] = nextLetter(this.initialsChars[this.initialsSlot], -1);
        this.initialsCooldown = 0.18;
        moved = true;
      }
    }

    if (moved) this.audio.playUi();
    this.input.clearJustPressed();
  }

  private tick(dt: number): void {
    this.pulse += dt;

    if (this.input.consume('m')) {
      const muted = this.audio.toggleMute();
      const muteBtn = document.getElementById('mute-btn');
      if (muteBtn) muteBtn.textContent = muted ? '🔇' : '🔊';
    }

    if (this.state === 'title') {
      this.renderer.update(dt, 80);
      this.player.y = this.viewH * 0.58 + Math.sin(this.pulse * 2.2) * 16;
      this.player.x = this.viewW * 0.28;
      const tr = this.touchReserves();
      this.player.update(dt, { x: 0, y: 0 }, true, this.viewW, this.viewH, 0.4, tr.top, tr.bottom, tr.left);
      this.trailAcc += dt;
      if (!this.touchPrimary || this.trailAcc >= 0.04) {
        this.trailAcc = 0;
        this.particles.trail(this.player.x - 24, this.player.y, '#00f0ff');
      }
      if (Math.random() < (this.touchPrimary ? 0.08 : 0.3)) this.particles.spark(this.player.x + 8, this.player.y - 6, '#ffe66d');
      this.particles.update(dt);
      // Any key (after mute handled above) or prior Space/Enter starts the run.
      if (this.input.consumeAny()) {
        void this.audio.unlock();
        this.beginRun();
      }
      return;
    }

    if (this.state === 'initials') {
      this.tickInitials(dt);
      return;
    }

    if (this.state === 'gameover') {
      this.renderer.update(dt, 40);
      this.particles.update(dt);
      if (this.input.consumeAny()) this.beginRun();
      return;
    }

    if (this.input.consume('p') || this.input.consume('escape')) {
      this.togglePause();
    }

    if (this.state === 'paused') {
      this.input.clearJustPressed();
      return;
    }

    const boosting = this.input.boosting && this.charge > 0.05;
    const speedMul = boosting ? 1.35 : 1;
    if (boosting && this.input.consume(' ')) this.audio.playBoost();

    this.scrollSpeed = 240 + this.distance * 0.035 + (boosting ? 90 : 0);
    const pr = this.touchReserves();
    this.player.update(dt, this.input.axis, boosting, this.viewW, this.viewH, speedMul, pr.top, pr.bottom, pr.left);
    this.world.update(dt, this.scrollSpeed, this.viewW, this.viewH, this.distance, pr.top, this.viewH - pr.bottom);
    this.particles.update(dt);
    this.renderer.update(dt, this.scrollSpeed);
    {
      const fs = this.floaters;
      let w = 0;
      for (let i = 0; i < fs.length; i++) {
        const f = fs[i];
        f.y -= 40 * dt;
        f.life -= dt;
        if (f.life > 0) fs[w++] = f;
        else this.floaterPool.push(f);
      }
      fs.length = w;
    }

    this.distance += this.scrollSpeed * dt * 0.35;
    this.score += this.scrollSpeed * dt * 0.12 + (boosting ? 12 * dt : 0);

    // shade drain
    const drain = (boosting ? 0.14 : 0.048) + this.distance * 0.000003;
    this.charge = clamp(this.charge - drain * dt, 0, 1);
    if (this.charge <= 0) {
      this.particles.burst(this.player.x, this.player.y, '#ffaa44', this.touchPrimary ? 12 : 28, 260);
      this.renderer.bumpShake(14);
      this.renderer.bumpFlash(0.7);
      this.endRun();
      this.input.clearJustPressed();
      return;
    }

    // Throttle trail on touch — every-frame arcs are fill-rate heavy on Safari
    this.trailAcc += dt;
    const trailEvery = this.touchPrimary ? 0.033 : 0;
    if (this.trailAcc >= trailEvery) {
      this.trailAcc = 0;
      this.particles.trail(
        this.player.x - 24,
        this.player.y,
        boosting ? '#00f0ff' : '#ff4ec8',
      );
    }

    // collect
    const hb = this.player.hitbox;
    for (const c of this.world.collectibles) {
      if (!c.alive) continue;
      if (circleRect(c.x, c.y, c.r, hb.x, hb.y, hb.w, hb.h)) {
        c.alive = false;
        this.charge = clamp(this.charge + 0.22, 0, 1);
        this.score += c.value;
        this.audio.playCollect();
        this.particles.burst(c.x, c.y, '#00f0ff', this.touchPrimary ? 8 : 12, 160);
        this.spawnFloater(c.x, c.y, '+SHADE', '#00f0ff');
      }
    }

    // obstacles
    if (this.player.invuln <= 0) {
      for (const o of this.world.obstacles) {
        if (!o.alive) continue;
        if (this.hitsObstacle(o, hb)) {
          this.charge = clamp(this.charge - 0.28, 0, 1);
          this.player.invuln = 0.85;
          this.audio.playHit();
          this.renderer.bumpShake(10);
          this.renderer.bumpFlash(0.35);
          this.particles.burst(this.player.x, this.player.y, '#ff6b35', this.touchPrimary ? 10 : 20, 220);
          if (this.charge <= 0) {
            this.endRun();
            this.input.clearJustPressed();
            return;
          }
          break;
        }
      }
    }

    this.input.clearJustPressed();
  }

  private hitsObstacle(o: Obstacle, hb: { x: number; y: number; w: number; h: number }): boolean {
    if (o.kind === 'ring') {
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const px = hb.x + hb.w / 2;
      const py = hb.y + hb.h / 2;
      const nx = (px - cx) / (o.w / 2);
      const ny = (py - cy) / (o.h / 2);
      const d2 = nx * nx + ny * ny;
      // hit the rim, safe in the hole
      return d2 < 1.05 && d2 > 0.42;
    }
    if (o.kind === 'flare') {
      return circleRect(o.x + o.w / 2, o.y + o.h / 2, o.w * 0.38, hb.x, hb.y, hb.w, hb.h);
    }
    return aabb(hb.x, hb.y, hb.w, hb.h, o.x, o.y, o.w, o.h);
  }

  private draw(): void {
    const ctx = this.ctx;
    const shake = this.renderer.shake;
    const sx = shake > 0 ? (Math.random() - 0.5) * shake * 2 : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake * 2 : 0;

    ctx.save();
    ctx.translate(sx, sy);
    this.renderer.drawBackground(ctx, this.charge);
    if (this.state !== 'title') {
      this.renderer.drawObstacles(ctx, this.world.obstacles);
      this.renderer.drawCollectibles(ctx, this.world.collectibles);
      this.particles.draw(ctx);
      this.renderer.drawPlayer(ctx, this.player, this.charge);
      this.renderer.drawFloaters(ctx, this.floaters);
    } else {
      this.renderer.drawPlayer(ctx, this.player, 1);
      this.particles.draw(ctx);
    }
    ctx.restore();

    this.renderer.applyPost(ctx, this.state === 'playing' || this.state === 'paused' ? this.charge : 1);

    if (this.state === 'playing' || this.state === 'paused') {
      this.renderer.drawHud(ctx, this.score, this.high, this.charge, this.distance);
    }
    if (this.state === 'title') this.renderer.drawTitle(ctx, this.high, this.pulse);
    if (this.state === 'paused') this.renderer.drawPause(ctx);
    if (this.state === 'initials') {
      this.renderer.drawInitialsEntry(
        ctx,
        this.pendingScore,
        this.initialsChars,
        this.initialsSlot,
        this.pulse,
      );
    }
    if (this.state === 'gameover') {
      this.renderer.drawGameOver(
        ctx,
        this.score,
        this.high,
        this.newBest,
        this.leaderboard,
        this.highlightIndex,
      );
    }
  }
}
