import { AudioEngine } from '../audio/AudioEngine';
import { Player } from '../entities/Player';
import { WorldSpawner, aabb, circleRect, type Obstacle } from '../entities/Obstacles';
import { Input } from './Input';
import { ParticleSystem } from './Particles';
import { Renderer, GATE_GLOW_SECONDS } from './Renderer';
import { Formation, CLONE_SLOTS, CLONE_SCALE, type CloneSlot } from '../entities/Formation';
import { FIRST_CLONE_LEVEL, LEVEL_SECONDS, shipsForLevel, shipsLabel } from '../utils/cloneLevels';
import { clamp } from '../utils/math';
import { PLAYER_BREED, breedScale, type Breed } from '../render/shipSprite';
import { DONATE_URL, VENMO_HANDLE, VENMO_APP_URL, VENMO_APP_WAIT_MS, V4V_MESSAGE } from '../config';
import {
  loadHighScore,
  saveHighScore,
  loadHandPreference,
  saveHandPreference,
  applyHandPreference,
  loadLeaderboard,
  qualifiesForBoard,
  addEntry,
  insertEntry,
  nextLetter,
  saveDifficulty,
  loadClaimTokens,
  addClaimToken,
  loadElevenUnlocked,
  saveElevenUnlocked,
  loadElevenRevealSeen,
  saveElevenRevealSeen,
  loadTutorialDone,
  saveTutorialDone,
  type HandPreference,
  type LeaderboardEntry,
} from '../utils/storage';
import { remoteEnabled, fetchRemoteBoard, submitRemoteScore, amITop, startRemoteRun } from '../utils/remoteBoard';
import {
  MIN_DIFFICULTY,
  MAX_PUBLIC_DIFFICULTY,
  SECRET_DIFFICULTY,
  pointMultiplier,
  difficultyLabel,
  hazardLevers,
} from '../utils/difficulty';

export type GameState = 'title' | 'playing' | 'paused' | 'initials' | 'gameover';

/** How to Play walkthrough step count. */
const TUT_STEPS = 4;
/** Level-up banner duration (s). */
const BANNER_SECONDS = 2.4;
/**
 * Gate boost: flying through a ring gate's hole refills this much shade charge. It equals the
 * original game's ring-rim (gate) hit penalty (0.28 of the bar), with the sign flipped.
 */
const GATE_BOOST = 0.28;
/** Dog pack: a normal run (levels 1-10) starts with N0 dogs on screen. */
const PACK_START = 4;
/** Per-dog scale with the full pack (s0); each dog is this times its breed size. */
const PACK_S0 = 0.5;
/**
 * Continues offered when the last dog is lost (10 s "CONTINUE?" countdown, pack refilled).
 * The code path is kept but disabled: 0 = losing the last dog is game over.
 */
const LAST_DOG_CONTINUES: number = 0;
/** Continue countdown (s). */
const CONTINUE_SECONDS = 10;

/**
 * Per-dog scale with n dogs left: s(n) = s0^(ln n / ln N0). Four dogs 0.5x, three 0.58x,
 * two 0.71x, the last dog 1.0x (the rest "eat the sunglasses" and grow).
 */
export function packScale(n: number): number {
  if (n <= 1) return 1;
  return Math.pow(PACK_S0, Math.log(n) / Math.log(PACK_START));
}

/** Promotion interstitial ("LEVEL N COMPLETED / YOU'VE BEEN PROMOTED!") duration (s). */
const PROMO_SECONDS = 2.0;
/** Re-request the difficulty-11 ticket on dismiss if the card sat open this long (ticket lives 1 h). */
const TICKET_REFRESH_MS = 45 * 60 * 1000;

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
  /** Simulated play time of the current run (sum of dt while playing; pauses excluded). */
  private runTime = 0;
  private pendingRunMs = 0;
  /** Increments every run so late network replies can't touch a newer run. */
  private runId = 0;
  /** Last successfully fetched shared board (null = never fetched / unavailable). */
  private remoteBoard: LeaderboardEntry[] | null = null;
  private remoteFetch: Promise<LeaderboardEntry[] | null> | null = null;
  /** Which board is on screen: shared online board or this device's board. */
  private boardIsRemote = false;
  /** Selected starting level (1-10, or 11 while this device holds #1). Always 1 on load. */
  private difficulty = MIN_DIFFICULTY;
  /** Difficulty locked in for the current / last run. */
  private runDifficulty = MIN_DIFFICULTY;
  private pendingDifficulty = MIN_DIFFICULTY;
  /** This device currently holds #1 on the shared board (11 selectable). */
  private elevenUnlocked = false;
  /** Difficulty-11 run ticket request for the current run. */
  private runTicket: Promise<string | 'denied' | null> | null = null;
  private topCheckSeq = 0;
  private revealTimer = 0;
  /** Congratulations overlay is up (after a server-confirmed new #1). */
  private congratsOpen = false;
  private congratsAt = 0;
  /** "I Think I'm a Clone Now" card is up: a real difficulty-11 run waits for it. */
  private cloneOpen = false;
  private cloneAt = 0;
  /** Difficulty-11 ticket request in flight (run not started yet). */
  private ticketPending = false;
  private startSeq = 0;
  /** Ticket issued for the run waiting behind the clone card. */
  private pendingTicket: string | null = null;
  private pendingTicketAt = 0;
  /** Clone level of the current run (11+), or 0 when this isn't a difficulty-11 run. */
  private level = 0;
  /** Ships left (player + clones, drawn or in reserve). */
  private ships = 1;
  /** Play time on the current level (pauses excluded). Levels 1-10 and clone levels alike. */
  private levelTime = 0;
  /** Current run cleared level 10 and ended as a win (victory screen). */
  private victory = false;
  /** Difficulty-11 ticket for a run started below 11 by the current #1 (so clearing 10 can enter 11). */
  private climbTicket: Promise<string | 'denied' | null> | null = null;
  private climbDenied = false;
  /** How to Play walkthrough: -1 = off, else the current step (0-based). Runs in 'playing' state. */
  private tutStep = -1;
  private tutT = 0;
  private tutProgress = 0;
  private tutLastX = 0;
  private tutLastY = 0;
  private bannerText = '';
  private bannerT = 0;
  /** Promotion interstitial between stages: play is frozen (not timed, not scored) while > 0. */
  private promoT = 0;
  private promoTitle = '';
  private promoSub = '';
  private promoNext: (() => void) | null = null;
  /** Dog pack (levels 1-10): drawn per-dog scale, eased toward packScale(ships). */
  private packK = 1;
  private continuesLeft = 0;
  /** "CONTINUE?" countdown while > 0 (play frozen). Only reachable if LAST_DOG_CONTINUES > 0. */
  private continueT = 0;
  /** Distance flown on the current stage; drives the speed / spawn / drain ramp, reset each stage. */
  private stageDist = 0;
  private formation = new Formation();
  private readonly cloneHb = { x: 0, y: 0, w: 52 * CLONE_SCALE * 0.7, h: 28 * CLONE_SCALE * 0.7 };
  private lastHitSfx = 0;
  /** An accepted submit is waiting for its #1 check (survives superseded checks). */
  private awaitingTopAfterSubmit = false;
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
    // 11 is shown right away only if this device was #1 last time; re-checked below.
    this.elevenUnlocked = remoteEnabled && loadElevenUnlocked();
    // Every visit starts at level 1; the difficulty selector is optional and only lasts for
    // this visit (the stored pick is no longer restored on load).
    this.difficulty = MIN_DIFFICULTY;
    // Warm the shared board on the title screen so game over can use it instantly.
    void this.refreshRemoteBoard().then(() => this.checkTop());
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
    // First load on this device: the How to Play walkthrough plays before any run can start.
    if (!loadTutorialDone()) this.startTutorial();
    // Test-only hooks (FSB_TEST=1 builds); compiled out of production bundles.
    if (__FSB_TEST__) void import('./testHooks').then((m) => m.installTestHooks(this));
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

    // How to Play (title & game-over menus): replay the walkthrough.
    bindTap(document.getElementById('howto-btn'), () => {
      void this.audio.unlock();
      if (this.state !== 'title' && this.state !== 'gameover') return;
      if (this.ticketPending || this.cloneOpen || this.congratsOpen) return;
      this.startTutorial();
    });

    // VALUE FOR VALUE card (game-over / victory only; hidden entirely while VENMO_HANDLE is empty).
    const donate = document.getElementById('donate-btn') as HTMLAnchorElement | null;
    if (donate && DONATE_URL) {
      donate.href = DONATE_URL;
      const msg = document.getElementById('v4v-msg');
      if (msg) msg.textContent = V4V_MESSAGE;
      const note = document.getElementById('donate-note');
      if (note) note.textContent = `Goes to @${VENMO_HANDLE}, the game's creator.`;
      document.body.classList.add('has-donate');
      document.getElementById('donate')?.setAttribute('aria-hidden', 'false');
      donate.addEventListener('pointerdown', (e) => e.stopPropagation());
      donate.addEventListener('click', (e) => this.openVenmo(e));
    } else {
      document.getElementById('donate')?.remove();
    }

    // Difficulty − / + (title & game-over menus, all devices)
    bindTap(document.getElementById('diff-minus'), () => {
      void this.audio.unlock();
      this.changeDifficulty(-1);
    });
    bindTap(document.getElementById('diff-plus'), () => {
      void this.audio.unlock();
      this.changeDifficulty(1);
    });
    this.syncDifficultyUi();
  }

  /**
   * "Open Venmo": on phones try the Venmo app first (deep link); if the page is still in front
   * after VENMO_APP_WAIT_MS the app didn't open, so open the web profile in a new tab (or this
   * tab, if the browser blocks the late new tab). Desktop: the plain link (new tab).
   */
  private openVenmo(e: MouseEvent): void {
    if (!this.touchPrimary || !VENMO_APP_URL) return; // desktop: default <a target=_blank>
    e.preventDefault();
    let left = false;
    const onHide = () => {
      if (document.visibilityState === 'hidden') left = true;
    };
    const onBlur = () => {
      left = true;
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onBlur);
    window.addEventListener('blur', onBlur);
    window.location.href = VENMO_APP_URL;
    window.setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onBlur);
      window.removeEventListener('blur', onBlur);
      if (left || document.visibilityState === 'hidden') return;
      // (No 'noopener' feature: it makes window.open return null, hiding a real popup block.)
      const w = window.open(DONATE_URL, '_blank');
      if (w) w.opener = null;
      else window.location.href = DONATE_URL;
    }, VENMO_APP_WAIT_MS);
  }

  /** Canvas y of the VALUE FOR VALUE card's top edge on the game-over screen (0 = not shown). */
  private donateCardTop(): number {
    const el = document.getElementById('donate');
    if (!el || !document.body.classList.contains('has-donate')) return 0;
    const r = el.getBoundingClientRect();
    if (r.height <= 0) return 0;
    const c = this.canvas.getBoundingClientRect();
    if (c.height <= 0) return 0;
    return ((r.top - c.top) * this.viewH) / c.height;
  }

  private syncDifficultyUi(): void {
    const d = this.difficulty;
    const main = document.getElementById('diff-main');
    const mult = document.getElementById('diff-mult');
    const ctl = document.getElementById('diff-ctl');
    const label = difficultyLabel(d);
    const cut = label.lastIndexOf(' · ');
    if (main) main.textContent = label.slice(0, cut);
    if (mult) mult.textContent = label.slice(cut + 3);
    ctl?.classList.toggle('eleven', d === SECRET_DIFFICULTY);
    ctl?.setAttribute('aria-label', `Difficulty ${d}, points ${pointMultiplier(d).toFixed(1)}x`);
    const minus = document.getElementById('diff-minus') as HTMLButtonElement | null;
    const plus = document.getElementById('diff-plus') as HTMLButtonElement | null;
    const max = this.elevenUnlocked ? SECRET_DIFFICULTY : MAX_PUBLIC_DIFFICULTY;
    if (minus) minus.disabled = d <= MIN_DIFFICULTY;
    if (plus) plus.disabled = d >= max;
    document.body.dataset.difficulty = String(d);
  }

  private changeDifficulty(delta: number): void {
    if (this.state !== 'title' && this.state !== 'gameover') return;
    if (this.ticketPending || this.cloneOpen) return;
    const max = this.elevenUnlocked ? SECRET_DIFFICULTY : MAX_PUBLIC_DIFFICULTY;
    const next = Math.min(max, Math.max(MIN_DIFFICULTY, this.difficulty + delta));
    if (next === this.difficulty) return;
    this.difficulty = next;
    saveDifficulty(next);
    this.syncDifficultyUi();
    if (next === SECRET_DIFFICULTY && !loadElevenRevealSeen()) {
      // First time past 10 this reign: sun flare + shades + "This one goes to eleven."
      saveElevenRevealSeen(true);
      this.playElevenReveal();
    } else {
      this.audio.playUi();
    }
  }

  /** Ask the server whether this device's claim tokens own #1; show / hide 11 accordingly. */
  private checkTop(afterSubmit = false): void {
    if (!remoteEnabled) return;
    if (this.state !== 'title' && this.state !== 'gameover') return;
    const seq = ++this.topCheckSeq;
    void amITop(loadClaimTokens()).then((top) => {
      if (top === null || seq !== this.topCheckSeq) return; // offline / superseded: keep last state
      this.setEleven(top, afterSubmit);
    });
  }

  private setEleven(top: boolean, afterSubmit = false): void {
    afterSubmit = afterSubmit || this.awaitingTopAfterSubmit;
    this.awaitingTopAfterSubmit = false;
    if (top) {
      const newTop = !loadElevenUnlocked();
      this.elevenUnlocked = true;
      saveElevenUnlocked(true);
      // Server just confirmed a new #1 right after this device's accepted submit:
      // congratulate once. The difficulty setting is left as it is (11 is opt-in via +).
      if (newTop && afterSubmit && this.state === 'gameover') this.showCongrats();
    } else {
      // Lost #1 (or never had it): remove 11 silently.
      this.elevenUnlocked = false;
      saveElevenUnlocked(false);
      saveElevenRevealSeen(false);
      if (this.difficulty === SECRET_DIFFICULTY) {
        this.difficulty = MAX_PUBLIC_DIFFICULTY;
        saveDifficulty(MAX_PUBLIC_DIFFICULTY);
      }
    }
    this.syncDifficultyUi();
  }

  private showCongrats(): void {
    const el = document.getElementById('congrats');
    if (!el) return;
    this.congratsOpen = true;
    this.congratsAt = performance.now();
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('congrats-open');
    this.input.clearTouch();
    this.input.clearJustPressed();
    this.audio.playCollect();
  }

  /** Dismiss the congratulations overlay (ignored for the first 450 ms to avoid stray taps). */
  private dismissCongrats(): boolean {
    if (!this.congratsOpen) return false;
    if (performance.now() - this.congratsAt < 450) return true;
    this.congratsOpen = false;
    const el = document.getElementById('congrats');
    el?.classList.remove('open');
    el?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('congrats-open');
    this.input.clearTouch();
    this.input.clearJustPressed();
    this.audio.playUi();
    return true;
  }

  /** Gold "I Think I'm a Clone Now" title card, shown before every real difficulty-11 run. */
  private showClone(): void {
    const el = document.getElementById('clone-card');
    this.cloneOpen = true;
    this.cloneAt = performance.now();
    el?.classList.add('open');
    el?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('clone-open');
    this.input.clearTouch();
    this.input.clearJustPressed();
    this.audio.playCollect();
  }

  /** Dismiss the clone card and start the difficulty-11 run (first 450 ms ignored, like congrats). */
  private dismissClone(): boolean {
    if (!this.cloneOpen) return false;
    if (performance.now() - this.cloneAt < 450) return true;
    this.cloneOpen = false;
    const el = document.getElementById('clone-card');
    el?.classList.remove('open');
    el?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('clone-open');
    const t = this.pendingTicket;
    this.pendingTicket = null;
    // Waiting on the card only ages the ticket (run time <= ticket age always holds);
    // but a ticket expires after 1 h, so fetch a fresh one if the card sat open very long.
    let ticket: Promise<string | 'denied' | null> = Promise.resolve(t);
    if (performance.now() - this.pendingTicketAt > TICKET_REFRESH_MS) {
      ticket = startRemoteRun(loadClaimTokens());
      void ticket.then((r) => {
        if (r === 'denied') this.setEleven(false);
      });
    }
    this.startRun(SECRET_DIFFICULTY, ticket);
    return true;
  }

  /** Difficulty 11: get the server ticket first, then show the clone card; play starts on dismiss. */
  private requestElevenRun(): void {
    this.ticketPending = true;
    const seq = ++this.startSeq;
    this.audio.playUi();
    void startRemoteRun(loadClaimTokens()).then((t) => {
      if (seq !== this.startSeq) return;
      this.ticketPending = false;
      if (this.state !== 'title' && this.state !== 'gameover') return;
      if (this.congratsOpen) return;
      if (t === 'denied') {
        // Lost #1 before starting: drop to 10 and play that instead.
        this.setEleven(false);
        this.startRun(this.difficulty, null);
      } else if (t === null) {
        // Offline / timeout: play 11 locally as before (no card; submit falls back to this device's board).
        this.startRun(SECRET_DIFFICULTY, Promise.resolve(null));
      } else {
        this.pendingTicket = t;
        this.pendingTicketAt = performance.now();
        this.showClone();
      }
    });
  }

  /** ~1.6 s dimmed overlay: sun-flare + shades + "This one goes to eleven." Never blocks input. */
  private playElevenReveal(): void {
    const fx = document.getElementById('eleven-fx');
    const ctl = document.getElementById('diff-ctl');
    if (!fx) return;
    fx.classList.remove('play');
    ctl?.classList.remove('reveal');
    void fx.offsetWidth; // restart the CSS animation
    fx.classList.add('play');
    ctl?.classList.add('reveal');
    this.audio.playCollect();
    window.setTimeout(() => this.audio.playUi(), 180);
    window.clearTimeout(this.revealTimer);
    this.revealTimer = window.setTimeout(() => {
      fx.classList.remove('play');
      ctl?.classList.remove('reveal');
    }, 1700);
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
    if (this.congratsOpen) {
      if (e.cancelable) e.preventDefault();
      this.dismissCongrats();
      return;
    }
    if (this.cloneOpen) {
      if (e.cancelable) e.preventDefault();
      this.dismissClone();
      return;
    }
    if (t?.closest?.('#mute-btn, #pause-btn, #hand-btn, #howto-btn, #diff-ctl, #donate')) return;
    // Walkthrough's last step: a tap (outside the stick / BOOST) finishes it.
    if (this.tutStep === TUT_STEPS - 1 && this.state === 'playing' && !t?.closest?.('#joy-zone, [data-action="boost"]')) {
      if (e.cancelable) e.preventDefault();
      this.finishTutorial();
      return;
    }
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
    if (this.congratsOpen) {
      this.dismissCongrats();
      return;
    }
    if (this.cloneOpen) {
      this.dismissClone();
      return;
    }
    if (this.ticketPending) return;
    if (this.difficulty === SECRET_DIFFICULTY && remoteEnabled) {
      // Difficulty 11 needs a server ticket, issued only to the current #1.
      this.requestElevenRun();
      return;
    }
    this.startRun(this.difficulty, null);
  }

  /** Actually start play. The run timer (runTime) starts from 0 here. */
  private startRun(difficulty: number, ticket: Promise<string | 'denied' | null> | null): void {
    this.awaitingTopAfterSubmit = false;
    this.audio.playStart();
    this.state = 'playing';
    this.setBodyFlags();
    this.score = 0;
    this.distance = 0;
    this.charge = 1;
    this.scrollSpeed = 240;
    this.newBest = false;
    this.highlightIndex = -1;
    this.runTime = 0;
    this.runId++;
    this.runDifficulty = difficulty;
    this.victory = false;
    this.runTicket = difficulty === SECRET_DIFFICULTY ? ticket : null;
    // Levels 1-10 are 30 s stages; clearing 10 enters 11 only for the current #1. The server
    // only accepts an 11 score whose run is no longer than its ticket's age, so the ticket
    // must be requested now, at run start, not when level 10 is cleared.
    this.climbTicket = null;
    this.climbDenied = false;
    if (difficulty < SECRET_DIFFICULTY && remoteEnabled && this.elevenUnlocked) {
      const id = this.runId;
      const req = startRemoteRun(loadClaimTokens());
      this.climbTicket = req;
      void req.then((r) => {
        if (r === 'denied' && id === this.runId) this.climbDenied = true;
      });
    }
    // Clone levels: a difficulty-11 run starts on level 11 with one ship.
    this.level = difficulty === SECRET_DIFFICULTY ? FIRST_CLONE_LEVEL : 0;
    this.ships = 1;
    this.levelTime = 0;
    this.bannerT = 0;
    this.promoT = 0;
    this.promoNext = null;
    this.stageDist = 0;
    this.formation.clear();
    // Refresh the shared board in the background while this run plays.
    void this.refreshRemoteBoard();
    this.player.reset(this.viewH);
    this.continueT = 0;
    this.continuesLeft = LAST_DOG_CONTINUES;
    if (this.level === 0) this.fillPack();
    else this.setPackK(1);
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

  /** Fetch the shared board (deduped, short timeout). Resolves null on failure. */
  private refreshRemoteBoard(): Promise<LeaderboardEntry[] | null> {
    if (!remoteEnabled) return Promise.resolve(null);
    if (this.remoteFetch) return this.remoteFetch;
    const p = fetchRemoteBoard().then((board) => {
      if (board) this.remoteBoard = board;
      return board;
    });
    this.remoteFetch = p;
    void p.finally(() => {
      if (this.remoteFetch === p) this.remoteFetch = null;
    });
    return p;
  }

  private enterInitials(): void {
    this.initialsChars = ['A', 'A', 'A'];
    this.initialsSlot = 0;
    this.initialsCooldown = 0.25;
    this.highlightIndex = -1;
    this.state = 'initials';
    this.setBodyFlags();
    this.input.clearJustPressed();
  }

  private endRun(): void {
    this.input.clearTouch();
    this.audio.playGameOver();
    this.pendingScore = Math.floor(this.score);
    this.pendingRunMs = Math.round(this.runTime * 1000);
    this.pendingDifficulty = this.runDifficulty;
    // Load (and, for legacy saves, migrate) the local board before touching the high-score key.
    const localBoard = loadLeaderboard();
    if (this.pendingScore > this.high) {
      this.high = this.pendingScore;
      this.newBest = true;
    } else {
      this.newBest = false;
    }
    // Keep legacy single-key in sync even if they skip the board
    saveHighScore(this.pendingScore);
    this.high = Math.max(this.high, loadHighScore());

    // Qualify against the shared board when we have it (fetched at run start),
    // else the local board. Never wait on the network here.
    this.boardIsRemote = this.remoteBoard !== null;
    this.leaderboard = this.remoteBoard ? [...this.remoteBoard] : localBoard;
    this.highlightIndex = -1;
    if (qualifiesForBoard(this.pendingScore, this.leaderboard)) {
      this.enterInitials();
    } else {
      this.state = 'gameover';
      this.setBodyFlags();
    }

    // Re-fetch now for the freshest display; late replies only apply to this run.
    const id = this.runId;
    const hadRemote = this.boardIsRemote;
    void this.refreshRemoteBoard().then((board) => {
      if (!board || id !== this.runId || this.state !== 'gameover' || this.highlightIndex !== -1) return;
      this.leaderboard = [...board];
      this.boardIsRemote = true;
      // Shared board was unavailable at game over but is now: offer initials if it qualifies.
      if (!hadRemote && qualifiesForBoard(this.pendingScore, board)) this.enterInitials();
    }).then(() => this.checkTop());
  }

  private confirmInitials(): void {
    if (this.state !== 'initials') return;
    const initials = this.initialsChars.join('');
    const score = this.pendingScore;
    const runMs = this.pendingRunMs;
    const difficulty = this.pendingDifficulty;
    const ticketReq = difficulty === SECRET_DIFFICULTY ? this.runTicket : null;
    const id = this.runId;
    // Always keep this device's board (offline fallback + personal best).
    const local = addEntry(score, initials, undefined, difficulty);
    if (remoteEnabled && this.remoteBoard) {
      // Optimistic: show the entry on the shared board until the server replies.
      const optimistic = insertEntry(score, initials, this.remoteBoard, difficulty);
      this.leaderboard = optimistic.board;
      this.highlightIndex = optimistic.index;
      this.boardIsRemote = true;
    } else {
      this.leaderboard = local.board;
      this.highlightIndex = local.index;
      this.boardIsRemote = false;
    }
    this.high = loadHighScore();
    this.audio.playUi();
    this.state = 'gameover';
    this.setBodyFlags();
    this.input.clearTouch();
    this.input.clearJustPressed();

    if (!remoteEnabled) return;
    void (ticketReq ?? Promise.resolve(null))
      .then((t) => submitRemoteScore(initials, score, runMs, difficulty, t && t !== 'denied' ? t : null))
      .then((res) => {
      if (res?.claimToken) addClaimToken(res.claimToken);
      if (res) this.remoteBoard = res.board;
      if (id !== this.runId || this.state !== 'gameover') return;
      if (res) {
        this.leaderboard = res.board;
        this.highlightIndex = res.index;
        this.boardIsRemote = true;
      } else {
        // Network down / rejected: fall back to this device's board.
        this.leaderboard = local.board;
        this.highlightIndex = local.index;
        this.boardIsRemote = false;
      }
      if (res) this.awaitingTopAfterSubmit = true;
      this.checkTop(!!res);
    });
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

  /** Title / game-over only: [ or - = easier, ] or = (+) = harder. Returns true if handled. */
  private handleDifficultyKeys(): boolean {
    let delta = 0;
    if (this.input.consume('[') || this.input.consume('-') || this.input.consume('_')) delta = -1;
    else if (this.input.consume(']') || this.input.consume('=') || this.input.consume('+')) delta = 1;
    if (delta === 0) return false;
    this.changeDifficulty(delta);
    this.input.clearJustPressed();
    return true;
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
      if (this.cloneOpen) {
        if (this.input.consumeAny()) this.dismissClone();
        return;
      }
      if (this.ticketPending) {
        this.input.clearJustPressed();
        return;
      }
      if (this.handleDifficultyKeys()) return;
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
      if (this.congratsOpen) {
        if (this.input.consumeAny()) this.dismissCongrats();
        return;
      }
      if (this.cloneOpen) {
        if (this.input.consumeAny()) this.dismissClone();
        return;
      }
      if (this.ticketPending) {
        this.input.clearJustPressed();
        return;
      }
      if (this.handleDifficultyKeys()) return;
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

    if (this.tutStep >= 0) {
      this.tickTutorial(dt);
      this.input.clearJustPressed();
      return;
    }

    if (this.continueT > 0) {
      // Last dog lost with a continue left: frozen until tapped or the countdown runs out.
      this.continueT -= dt;
      this.particles.update(dt);
      if (this.input.consumeAny() || (this.touchPrimary && this.input.boosting)) {
        this.continuesLeft--;
        this.continueT = 0;
        this.charge = 1;
        this.fillPack();
        this.player.invuln = 2;
        this.audio.playStart();
      } else if (this.continueT <= 0) {
        this.continueT = 0;
        this.endRun();
      }
      this.input.clearJustPressed();
      return;
    }

    if (this.promoT > 0) {
      // Promotion interstitial: the world is frozen, the run clock and score stand still.
      this.promoT -= dt;
      this.particles.update(dt);
      if (this.promoT <= 0) {
        this.promoT = 0;
        const next = this.promoNext;
        this.promoNext = null;
        next?.();
      }
      this.input.clearJustPressed();
      return;
    }

    this.runTime += dt;
    // Every level is a 30 s stage: 1-10 advance one level (score carries over), clone levels
    // (11+) multiply ships. Exactly one level per pass.
    this.levelTime += dt;
    if (this.levelTime >= LEVEL_SECONDS) {
      this.levelTime -= LEVEL_SECONDS;
      if (this.level > 0) this.levelUp();
      else if (this.clearStage()) return;
    }
    this.bannerT = Math.max(0, this.bannerT - dt);

    const boosting = this.input.boosting && this.charge > 0.05;
    const speedMul = boosting ? 1.35 : 1;
    if (boosting && this.input.consume(' ')) this.audio.playBoost();

    // Difficulty scales base speed + ramp (m) and points (pts). m is the eased hazard speed
    // (original level 1 eased for 1-10, original level 5 for 11; see utils/difficulty.ts).
    const d = this.runDifficulty;
    const hz = hazardLevers(d);
    const m = hz.speed;
    const pts = pointMultiplier(d);
    this.scrollSpeed = 240 * m + this.stageDist * 0.035 * m + (boosting ? 90 : 0);
    const pr = this.touchReserves();
    // Keep the whole formation on screen: the player's clamp grows by the formation's extents.
    const f = this.formation;
    this.player.update(
      dt,
      this.input.axis,
      boosting,
      this.viewW,
      this.viewH,
      speedMul,
      pr.top + f.extUp,
      pr.bottom + f.extDown,
      pr.left + f.extLeft,
    );
    if (this.level === 0) {
      // Pack growth eases in over ~0.3 s; sprites and hitboxes use the same scale.
      const want = packScale(this.ships);
      if (this.packK !== want) {
        const k = this.packK + (want - this.packK) * (1 - Math.exp(-12 * dt));
        this.setPackK(Math.abs(want - k) < 0.002 ? want : k);
      }
    }
    if (f.occupiedCount > 0) f.update(dt, this.player.x, this.player.y, this.pulse);
    this.world.update(
      dt,
      this.scrollSpeed,
      this.viewW,
      this.viewH,
      this.stageDist,
      pr.top,
      this.viewH - pr.bottom,
      hz.density,
      hz.rampMul,
    );
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
    this.stageDist += this.scrollSpeed * dt * 0.35;
    this.score += (this.scrollSpeed * dt * 0.12 + (boosting ? 12 * dt : 0)) * pts;

    // shade drain
    const drain = ((boosting ? 0.14 : 0.048) + this.stageDist * 0.000003) * hz.drainMul;
    this.charge = clamp(this.charge - drain * dt, 0, 1);
    if (this.charge <= 0 && this.ships > 1) {
      // Out of shade with clones / pack dogs left: one is lost, the rest carry on.
      this.loseLeadShip(this.level === 0 ? 0.85 * hz.hitGraceMul : 1.0);
      this.charge = 0.75;
    }
    if (this.charge <= 0 && this.level === 0 && this.lastDogLost()) return;
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
        this.score += c.value * pts;
        this.audio.playCollect();
        this.particles.burst(c.x, c.y, '#00f0ff', this.touchPrimary ? 8 : 12, 160);
        this.spawnFloater(c.x, c.y, '+SHADE', '#00f0ff');
      }
    }

    this.checkGates();

    // obstacles
    if (this.player.invuln <= 0) {
      for (const o of this.world.obstacles) {
        if (!o.alive) continue;
        if (this.hitsObstacle(o, hb)) {
          if (this.ships > 1) {
            // With clones / pack dogs, a hit costs one ship (dog), not shade. No pause.
            this.loseLeadShip(this.level === 0 ? 0.85 * hz.hitGraceMul : 1.0);
            break;
          }
          if (this.level === 0) {
            // The last dog of the pack is hit: game over (or a continue, if enabled).
            if (this.lastDogLost()) return;
            break;
          }
          this.charge = clamp(this.charge - 0.28 * hz.hitDamageMul, 0, 1);
          this.player.invuln = 0.85 * hz.hitGraceMul;
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

    // Clones: only the drawn ones collide; a hit clone is lost (the reserve refills its slot).
    if (f.occupiedCount > 0) this.collideClones();

    this.input.clearJustPressed();
  }

  /** Start the How to Play walkthrough (first load, or the How to Play button). Never scores. */
  private startTutorial(): void {
    this.tutStep = 0;
    this.tutT = 0;
    this.tutProgress = 0;
    this.state = 'playing';
    this.setBodyFlags();
    this.score = 0;
    this.distance = 0;
    this.charge = 1;
    this.runDifficulty = MIN_DIFFICULTY;
    this.level = 0;
    this.ships = 1;
    this.levelTime = 0;
    this.bannerT = 0;
    this.victory = false;
    this.formation.clear();
    this.setPackK(1);
    this.player.reset(this.viewH);
    this.tutLastX = this.player.x;
    this.tutLastY = this.player.y;
    this.world.reset();
    this.world.spawnObstacles = false;
    this.world.spawnCollectibles = false;
    this.particles.clear();
    this.renderer.shake = 0;
    this.renderer.flash = 0;
    this.input.clearTouch();
    this.input.clearJustPressed();
  }

  private nextTutorialStep(): void {
    this.tutStep++;
    this.tutT = 0;
    this.tutProgress = 0;
    this.audio.playCollect();
    if (this.tutStep === 1) this.world.spawnObstacles = true;
    if (this.tutStep === 2) {
      this.world.spawnObstacles = false;
      this.world.spawnCollectibles = true;
      this.charge = Math.min(this.charge, 0.45);
    }
    if (this.tutStep === 3) {
      this.world.spawnObstacles = true;
      this.world.spawnCollectibles = true;
    }
  }

  /** Walkthrough done: remember it on this device and go to the title screen (pick a level, play). */
  private finishTutorial(): void {
    if (this.tutStep < 0) return;
    this.tutStep = -1;
    saveTutorialDone();
    this.world.reset();
    this.world.spawnObstacles = true;
    this.world.spawnCollectibles = true;
    this.particles.clear();
    this.state = 'title';
    this.setBodyFlags();
    this.input.clearTouch();
    this.input.clearJustPressed();
    this.audio.playUi();
  }

  /**
   * One walkthrough frame, ~30 s in total. Each step is finished by doing it:
   * 1 move, 2 dodge hazards for a few seconds, 3 grab 2 circles, 4 read the rules and tap / ENTER.
   * Hazards run at level 1 speed; hits flash but never end it; nothing is scored or submitted.
   */
  private tickTutorial(dt: number): void {
    this.tutT += dt;
    const boosting = this.tutStep === 3 && this.input.boosting && this.charge > 0.05;
    const hz = hazardLevers(MIN_DIFFICULTY);
    this.scrollSpeed = 240 * hz.speed + (boosting ? 90 : 0);
    const pr = this.touchReserves();
    this.player.update(dt, this.input.axis, boosting, this.viewW, this.viewH, boosting ? 1.35 : 1, pr.top, pr.bottom, pr.left);
    // A steady trickle of hazards so step 2 has something to dodge within a few seconds.
    this.world.update(dt, this.scrollSpeed, this.viewW, this.viewH, 0, pr.top, this.viewH - pr.bottom, 1.2, 1);
    this.particles.update(dt);
    this.renderer.update(dt, this.scrollSpeed);
    this.trailAcc += dt;
    if (this.trailAcc >= (this.touchPrimary ? 0.033 : 0)) {
      this.trailAcc = 0;
      this.particles.trail(this.player.x - 24, this.player.y, boosting ? '#00f0ff' : '#ff4ec8');
    }
    if (this.tutStep === 3) this.charge = clamp(this.charge - (boosting ? 0.14 : 0) * dt, 0.2, 1);

    const hb = this.player.hitbox;
    for (const c of this.world.collectibles) {
      if (c.alive && circleRect(c.x, c.y, c.r, hb.x, hb.y, hb.w, hb.h)) {
        c.alive = false;
        this.charge = clamp(this.charge + 0.22, 0, 1);
        this.audio.playCollect();
        this.particles.burst(c.x, c.y, '#00f0ff', this.touchPrimary ? 8 : 12, 160);
        this.spawnFloater(c.x, c.y, '+SHADE', '#00f0ff');
        if (this.tutStep === 2) this.tutProgress++;
      }
    }
    this.checkGates();
    if (this.player.invuln <= 0) {
      for (const o of this.world.obstacles) {
        if (o.alive && this.hitsObstacle(o, hb)) {
          this.charge = clamp(this.charge - 0.1, 0.25, 1);
          this.player.invuln = 0.85;
          this.audio.playHit();
          this.renderer.bumpShake(6);
          this.renderer.bumpFlash(0.25);
          this.particles.burst(this.player.x, this.player.y, '#ff6b35', this.touchPrimary ? 10 : 20, 220);
          break;
        }
      }
    }
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

    if (this.tutStep === 0) {
      this.tutProgress += Math.hypot(this.player.x - this.tutLastX, this.player.y - this.tutLastY);
      this.tutLastX = this.player.x;
      this.tutLastY = this.player.y;
      if (this.tutProgress > 180 && this.tutT > 1.2) this.nextTutorialStep();
    } else if (this.tutStep === 1) {
      if (this.tutT > 7) this.nextTutorialStep();
    } else if (this.tutStep === 2) {
      if (this.tutProgress >= 2 || this.tutT > 12) this.nextTutorialStep();
    } else if (this.tutStep === 3) {
      if (this.input.consume('enter') || this.tutT > 12) this.finishTutorial();
    }
  }

  private tutorialText(): { title: string; lines: string[] } {
    const touch = this.touchPrimary;
    switch (this.tutStep) {
      case 0:
        return { title: 'MOVE YOUR SHIP', lines: [touch ? 'Drag the stick to fly' : 'WASD / Arrows to fly'] };
      case 1:
        return {
          title: 'DODGE THE GLARE',
          lines: ['Beams, flares, neon bars and ring rims cost a dog', "Fly through a ring's hole: GATE BOOST, +shade"],
        };
      case 2:
        return {
          title: 'GRAB THE CIRCLES',
          lines: ['Glowing circles refill your shades', 'SHADE CHARGE runs out = you lose a dog'],
        };
      default:
        return {
          title: 'SURVIVE 30 SECONDS',
          lines: [
            'Survive 30 seconds to pass a level',
            'Levels 1 to 10 get harder as you go',
            'You start with 4 dogs: lose them all = game over',
            `Circles and ring gates refill shade; ${touch ? 'BOOST' : 'SPACE (boost)'} burns it`,
            touch ? 'Tap to ride' : 'ENTER or click to ride',
          ],
        };
    }
  }

  /**
   * Pass a level 1-10. Returns true if the run ended (cleared 10 without access to 11: a win).
   * 1-9: a ~2 s "LEVEL N COMPLETED / YOU'VE BEEN PROMOTED!" interstitial, then the next level
   * starts fresh (hazards cleared, ramp reset, shades full) with the score carried over.
   * 10: the current #1 gets a "YOU BEAT LEVEL 10" interstitial, then clone mode (level 11);
   * everyone else ends the run as a win on the YOU BEAT LEVEL 10 screen, as before (the
   * server only accepts a level-11 score with a run ticket, issued only to the current #1).
   */
  private clearStage(): boolean {
    const cleared = this.runDifficulty;
    if (cleared < MAX_PUBLIC_DIFFICULTY) {
      this.showPromotion(`LEVEL ${cleared} COMPLETED`, "YOU'VE BEEN PROMOTED!", () => {
        this.runDifficulty = cleared + 1;
        this.freshStage();
      });
      return false;
    }
    if (this.elevenUnlocked && !this.climbDenied && this.climbTicket) {
      // Straight into clone mode: submitted as 11 with the ticket requested at run start.
      this.showPromotion('YOU BEAT LEVEL 10', "YOU'VE BEEN PROMOTED!", () => {
        this.runDifficulty = SECRET_DIFFICULTY;
        this.runTicket = this.climbTicket;
        this.level = FIRST_CLONE_LEVEL;
        this.ships = 1;
        this.formation.clear();
        this.setPackK(1);
        this.freshStage();
        this.bannerText = `LEVEL ${this.level}  ·  ${shipsLabel(this.ships)}`;
        this.bannerT = BANNER_SECONDS;
      });
      return false;
    }
    // Beat level 10: the run ends as a win and is submitted normally (difficulty 10).
    this.victory = true;
    this.bannerT = 0;
    this.renderer.bumpFlash(0.5);
    this.endRun();
    this.input.clearJustPressed();
    return true;
  }

  private showPromotion(title: string, sub: string, next: () => void): void {
    this.promoTitle = title;
    this.promoSub = sub;
    this.promoT = PROMO_SECONDS;
    this.promoNext = next;
    this.bannerT = 0;
    this.audio.playPromote();
  }

  /** A new stage starts fresh: hazards cleared, ramp back to the level's base, shades full. */
  private freshStage(): void {
    this.world.reset();
    this.stageDist = 0;
    this.levelTime = 0;
    this.charge = 1;
    this.player.invuln = Math.max(this.player.invuln, 1.2);
    while (this.floaters.length) {
      const f = this.floaters.pop();
      if (f) this.floaterPool.push(f);
    }
  }

  /** Pass the current clone level: next level, ship count reset to that level's number. */
  private levelUp(): void {
    this.level++;
    this.ships = shipsForLevel(this.level);
    this.formation.fill(Math.min(this.ships - 1, CLONE_SLOTS), this.player.x, this.player.y);
    this.bannerText = `LEVEL ${this.level}  ·  ${shipsLabel(this.ships)}`;
    this.bannerT = BANNER_SECONDS;
    this.audio.playCollect();
  }

  /** HUD icons: the player's dog first, then the pack dogs still running. */
  private packBreeds(): Breed[] {
    const out: Breed[] = [this.player.breed];
    for (const sl of this.formation.slots) if (sl.occupied) out.push(sl.breed);
    return out;
  }

  /** Reserve ships beyond the drawn formation. */
  private get reserve(): number {
    return Math.max(0, this.ships - 1 - this.formation.occupiedCount);
  }

  /** The player's ship is lost (hit or out of shade) while clones remain: a clone takes over. */
  private loseLeadShip(grace = 1.0): void {
    this.ships--;
    if (this.ships - 1 < this.formation.occupiedCount) this.formation.dropOutermost();
    this.player.invuln = grace;
    this.hitFx(this.player.x, this.player.y, true);
    if (this.level === 0) this.dogLost(grace);
  }

  /** Fresh pack: the player's Border Collie plus PACK_START - 1 dogs of a random breed mix. */
  private fillPack(): void {
    this.ships = PACK_START;
    this.formation.clear();
    this.formation.fill(PACK_START - 1, this.player.x, this.player.y);
    this.setPackK(packScale(PACK_START));
  }

  /** Apply per-dog scale k (x breed size) to the player's dog, the pack and their hitboxes. */
  private setPackK(k: number): void {
    this.packK = k;
    this.player.breed = PLAYER_BREED;
    this.player.scale = breedScale(PLAYER_BREED) * k;
    this.player.w = 52 * this.player.scale;
    this.player.h = 28 * this.player.scale;
    if (this.level === 0 && this.tutStep < 0) {
      for (const sl of this.formation.slots) if (sl.occupied) sl.scale = breedScale(sl.breed) * k;
      this.formation.setSpread(k / PACK_S0);
    } else {
      this.formation.setSpread(1);
    }
  }

  /** A pack dog was lost (hit or out of shade): the rest eat its sunglasses and grow. */
  private dogLost(grace: number): void {
    // The whole pack gets the hit grace, so one hazard can't eat several dogs at once.
    for (const sl of this.formation.slots) if (sl.occupied) sl.invuln = Math.max(sl.invuln, grace);
    this.player.invuln = Math.max(this.player.invuln, grace);
    this.spawnFloater(this.player.x, this.player.y - 30, 'SHADES EATEN! PACK GROWS', '#ffe66d');
    this.particles.burst(this.player.x, this.player.y, '#ffe66d', this.touchPrimary ? 6 : 12, 140);
  }

  /**
   * The last dog is gone. With a continue left (LAST_DOG_CONTINUES > 0), freeze on a 10 s
   * "CONTINUE?" countdown; otherwise game over. Returns true (the frame should stop).
   */
  private lastDogLost(): boolean {
    this.particles.burst(this.player.x, this.player.y, '#ffaa44', this.touchPrimary ? 12 : 28, 260);
    this.renderer.bumpShake(14);
    this.renderer.bumpFlash(0.7);
    this.audio.playHit();
    if (this.continuesLeft > 0) {
      this.continueT = CONTINUE_SECONDS;
      this.input.clearTouch();
    } else {
      this.endRun();
    }
    this.input.clearJustPressed();
    return true;
  }

  private collideClones(): void {
    const hb = this.cloneHb;
    const obs = this.world.obstacles;
    for (const s of this.formation.slots) {
      if (!s.occupied || s.invuln > 0) continue;
      hb.w = 52 * s.scale * 0.7;
      hb.h = 28 * s.scale * 0.7;
      hb.x = s.x - hb.w / 2;
      hb.y = s.y - hb.h / 2;
      for (const o of obs) {
        if (!o.alive) continue;
        if (this.hitsObstacle(o, hb)) {
          this.loseClone(s);
          break;
        }
      }
    }
  }

  private loseClone(s: CloneSlot): void {
    this.hitFx(s.x, s.y, false);
    const hadReserve = this.reserve > 0;
    this.ships--;
    if (hadReserve) {
      // A reserve ship fills the slot, easing in from the player's ship with a short grace.
      s.x = this.player.x;
      s.y = this.player.y;
      s.invuln = 0.6;
    } else {
      this.formation.empty(s);
    }
  }

  private hitFx(x: number, y: number, lead: boolean): void {
    this.particles.burst(x, y, '#ff6b35', this.touchPrimary ? (lead ? 10 : 4) : lead ? 20 : 8, lead ? 220 : 160);
    const now = performance.now();
    if (now - this.lastHitSfx > 90) {
      this.lastHitSfx = now;
      this.audio.playHit();
    }
    if (lead) {
      this.renderer.bumpShake(10);
      this.renderer.bumpFlash(0.35);
    } else {
      this.renderer.bumpShake(3);
    }
  }

  /**
   * Ring gates: when a ring's centre line passes the player's ship, a ship inside the hole
   * gets a GATE BOOST (+GATE_BOOST shade) with a gold ring flash, sparkle burst and chime.
   */
  private checkGates(): void {
    const px = this.player.x;
    const py = this.player.y;
    for (const o of this.world.obstacles) {
      if (o.kind !== 'ring' || !o.alive || o.passed) continue;
      const cx = o.x + o.w / 2;
      if (px < cx) continue;
      o.passed = true;
      const cy = o.y + o.h / 2;
      const ny = (py - cy) / (o.h / 2);
      if (ny * ny > 0.42) continue; // not through the hole (the rim / outside)
      this.charge = clamp(this.charge + GATE_BOOST, 0, 1);
      o.boostT = GATE_GLOW_SECONDS;
      this.audio.playGate();
      this.particles.burst(cx, cy, '#ffe66d', this.touchPrimary ? 10 : 18, 200);
      this.spawnFloater(cx, o.y - 6, 'GATE BOOST +SHADE', '#ffe66d');
    }
    if (this.level === 0) this.dogLost(0.85 * hazardLevers(this.runDifficulty).hitGraceMul);
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
      if ((this.level > 0 || this.formation.occupiedCount > 0) && (this.state === 'playing' || this.state === 'paused')) {
        this.renderer.drawClones(ctx, this.formation, this.ships, this.player.x, this.player.y);
      }
      this.renderer.drawPlayer(ctx, this.player, this.charge);
      this.renderer.drawFloaters(ctx, this.floaters);
    } else {
      this.renderer.drawPlayer(ctx, this.player, 1);
      this.particles.draw(ctx);
    }
    ctx.restore();

    this.renderer.applyPost(ctx, this.state === 'playing' || this.state === 'paused' ? this.charge : 1);

    if (this.state === 'playing' || this.state === 'paused') {
      this.renderer.drawHud(
        ctx,
        this.score,
        this.high,
        this.charge,
        this.distance,
        this.tutStep >= 0 ? null : this.level > 0 ? { level: this.level, ships: this.ships } : { level: this.runDifficulty, ships: 0, dogs: this.packBreeds(), dogIconScale: packScale(this.ships) / PACK_S0 },
      );
      if (this.tutStep >= 0) {
        const tt = this.tutorialText();
        this.renderer.drawTutorial(ctx, this.tutStep + 1, TUT_STEPS, tt.title, tt.lines);
      }
      if (this.bannerT > 0) this.renderer.drawLevelBanner(ctx, this.bannerText, this.bannerT, BANNER_SECONDS);
      if (this.continueT > 0) {
        this.renderer.drawPromotion(ctx, 'CONTINUE?', `${Math.ceil(this.continueT)}  ·  ${this.touchPrimary ? 'TAP BOOST' : 'PRESS ANY KEY'} TO KEEP GOING`, this.continueT, CONTINUE_SECONDS, this.score);
      }
      if (this.promoT > 0) {
        this.renderer.drawPromotion(ctx, this.promoTitle, this.promoSub, this.promoT, PROMO_SECONDS, this.score);
      }
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
      this.renderer.cardTopY = this.donateCardTop();
      this.renderer.drawGameOver(
        ctx,
        this.score,
        this.high,
        this.newBest,
        this.leaderboard,
        this.highlightIndex,
        this.boardIsRemote ? 'GLOBAL TOP 10' : 'TOP 10',
        this.victory ? 'YOU BEAT LEVEL 10' : 'TOO BRIGHT!',
      );
    }
  }
}
