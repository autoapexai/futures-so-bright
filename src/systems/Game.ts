import { AudioEngine } from '../audio/AudioEngine';
import { Player } from '../entities/Player';
import { WorldSpawner, aabb, circleRect, type Obstacle } from '../entities/Obstacles';
import { Input } from './Input';
import { ParticleSystem } from './Particles';
import { Renderer, GATE_GLOW_SECONDS } from './Renderer';
import { Formation, CLONE_SCALE, type CloneSlot } from '../entities/Formation';
import { FIRST_CLONE_LEVEL, LEVEL_SECONDS, shipHitCost, shipsForLevel } from '../utils/cloneLevels';
import { clamp } from '../utils/math';
import { PLAYER_BREED, breedScale, type Breed } from '../render/shipSprite';
import { DONATE_URL, VENMO_HANDLE, VENMO_APP_URL, VENMO_APP_WAIT_MS, V4V_MESSAGE } from '../config';
import { MODES, CALVIN_TRIPLETS, modeBreeds, type ModeDef } from '../utils/modes';
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
import { trackRunStart } from '../utils/track';
import { checkResume, sendResume, sendSuggestion, SUGGEST_MAX } from '../utils/v4v';
import { BOSS_BONUS, BOSS_HIT_GRACE, BOSS_MERCY_R, BossFight, bossForLevel, drawBoss, type BossDef } from './Boss';
import { mulberry32, newSeed, pick, subSeed, type Rng } from '../utils/rng';
import {
  BLENDER_SECONDS,
  MICROWAVE_SECONDS,
  TOASTER_POINTS,
  TOASTER_SECONDS,
  drawCatLoading,
  drawGroupPhoto,
  drawPizzaShield,
  drawPrizeReveal,
  historyJabs,
  speakTrailer,
  stopSpeech,
  type Appliance,
} from './silly';
import {
  MIN_DIFFICULTY,
  MAX_PUBLIC_DIFFICULTY,
  MAX_LEVEL,
  SCORE_CAP,
  SECRET_DIFFICULTY,
  pointMultiplier,
  difficultyLabel,
  hazardLevers,
} from '../utils/difficulty';

export type GameState = 'title' | 'playing' | 'paused' | 'initials' | 'gameover';

/** How to Play walkthrough step count. */
const TUT_STEPS = 4;
/** MODES menu: a tap on THE CALVIN TWINS starts it after this beat (ms); a 2nd tap = the egg. */
const CALVIN_PICK_MS = 550;
/** Level-up banner duration (s). */
/** Length of THE DUCHESS OF PASADENA prize reveal, s. */
const PRIZE_SECONDS = 5;
const BANNER_SECONDS = 2.4;
/**
 * Ring gates are pure boosts: touching any part of one (rim or hole) sets the shade charge to
 * this (a full bar), once per gate. Gates never cost a dog, shade or count as a hit.
 */
const GATE_CHARGE = 1.0;
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
  /** Difficulty-11 ticket for a run that climbed from below 11 (requested when level 10 is cleared). */
  private climbTicket: Promise<string | 'denied' | null> | null = null;
  /** This run's score stays on this device's board (level 11 without a server ticket). */
  private runLocalOnly = false;
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
  private readonly cloneFormation = new Formation();
  private formation = this.cloneFormation;
  private readonly cloneHb = { x: 0, y: 0, w: 52 * CLONE_SCALE * 0.7, h: 28 * CLONE_SCALE * 0.7 };
  /** Fan mode of the current run (MODES menu), or null for a normal run. */
  private mode: ModeDef | null = null;
  private modesOpen = false;
  /** performance.now() when the MODES menu opened: taps just after it are the opening tap's ghost click. */
  private modesOpenedAt = 0;
  /** In-run QUIT confirm (the run is paused under it); MODES can open over it (CHANGE MODE). */
  private quitOpen = false;
  private quitOpenedAt = 0;
  /** The view was re-laid out (rotation) since the last walkthrough frame: don't count it as movement. */
  private tutViewMoved = false;
  /** MODES menu Easter egg: THE CALVIN TWINS entry toggled to THE CALVIN TRIPLETS. */
  private calvinTriplets = false;
  /** MODES menu: the CALVIN entry is selected and starts after a short beat unless tapped again. */
  private calvinPickTimer = 0;
  private decoyFaked = false;
  private decoySlot: CloneSlot | null = null;
  private decoyHiddenT = 0;
  /** THE BOARD fight in progress (end of levels 10, 20 ... 110 and 111), else null. */
  private boss: BossFight | null = null;
  /** This level's boss has been fought (beaten or bored), so the level can now be cleared. */
  private bossDone = false;
  bossesBeaten = 0;
  /** Per-run seed (boss randomness + random mode swaps); logged at run start. */
  runSeed = 0;
  private runRng: Rng = Math.random;
  /** Test builds can pin the next run's seed (reproducible videos). */
  forcedSeed: number | null = null;
  /** Modes this run has used (the leaderboard stores the end mode plus this count). */
  private modesUsed = new Set<string>();
  /** The current mode's full pack size (for scaling the pack on a mid-run mode change). */
  private modeFullShips = 0;
  private pendingMode: string | null = null;
  private pendingModes = 1;
  /** Silliness pack timers: TOASTER burst, BLENDER spin, MICROWAVE pizza shield, cat freeze. */
  private toastT = 0;
  private spinT = 0;
  private shieldT = 0;
  catT = 0;
  nextCatAt = 0;
  private catRng: Rng = Math.random;
  /** Group photo after the level 111 boss (then VICTORY). */
  photoT = 0;
  /** THE DUCHESS OF PASADENA prize reveal after the photo (then the VICTORY screen). */
  prizeT = 0;
  private bossesFought: BossDef[] = [];
  private a11yT = 0;
  private tromboneAt = 0;
  /** The level this run began on (the board's START column). */
  private runStartLevel = 1;
  private pendingStart = 1;
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
    // Any button, key or tap stops the game-over sad trombone.
    const hush = (): void => {
      if (this.audio && this.audio.tromboneOn && performance.now() - this.tromboneAt > 350) this.audio.stopSadTrombone();
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, hush, { capture: true, passive: true });
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
    // The last button fired by a pointer tap. The browser's follow-up click is hit-tested after
    // that tap may have closed an overlay (e.g. MODES' BACK), so it can land on the button
    // underneath (the gold clone button started a level-11 run); such a click is a ghost.
    const lastPointerTap = { el: null as HTMLElement | null, t: 0 };
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
        lastPointerTap.el = el;
        lastPointerTap.t = performance.now();
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
        if (lastPointerTap.el !== el && performance.now() - lastPointerTap.t < 600) return;
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
    // Demo loop: hide the frame if the video can't load (it never blocks or delays play).
    const demoVideo = document.getElementById('demo-video') as HTMLVideoElement | null;
    const lastSource = demoVideo?.querySelector('source:last-of-type');
    lastSource?.addEventListener('error', () => document.getElementById('demo')?.remove());
    // Gold "I THINK I'M A CLONE NOW" (title screen): anyone can start level 11 (clone mode) directly.
    bindTap(document.getElementById('clone-btn'), () => {
      void this.audio.unlock();
      this.startCloneRun();
    });
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

    this.bindV4V();

    // MODES (title & game-over menus): fan modes list; Play (START / any key) stays primary.
    const list = document.getElementById('modes-list');
    if (list) {
      for (const m of MODES) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'hand-btn mode-pick';
        b.draggable = false;
        const name = document.createElement('span');
        name.className = 'mode-name';
        name.textContent = m.name;
        const ships = document.createElement('span');
        ships.className = 'mode-ships';
        ships.textContent = `${m.ships.toLocaleString('en-US')} DOGS`;
        ships.style.color = m.tint;
        b.append(name, ships);
        b.setAttribute('aria-label', `${m.name}, ${m.ships} dogs`);
        if (m.behavior === 'calvin') {
          b.id = 'calvin-pick';
          bindTap(b, () => this.tapCalvin(b));
        } else {
          bindTap(b, () => this.pickMode(m));
        }
        list.appendChild(b);
      }
    }
    bindTap(document.getElementById('modes-btn'), () => {
      void this.audio.unlock();
      this.openModes();
    });
    bindTap(document.getElementById('modes-back'), () => {
      if (!this.modesGhostTap()) this.closeModes();
    });
    // Title screen: the big MODES button (the small one sits with HOW TO PLAY on game-over).
    bindTap(document.getElementById('modes-big'), () => {
      void this.audio.unlock();
      this.openModes();
    });
    // SKIP on every How to Play step (first load and replays).
    bindTap(document.getElementById('tut-skip'), () => this.skipTutorial());
    // In-run QUIT: first tap pauses and asks; CHANGE MODE / QUIT RUN / KEEP PLAYING.
    bindTap(document.getElementById('quit-btn'), () => this.openQuitConfirm());
    bindTap(document.getElementById('quit-no'), () => {
      if (!this.quitGhostTap()) this.keepPlaying();
    });
    bindTap(document.getElementById('quit-yes'), () => {
      if (!this.quitGhostTap()) this.quitRun();
    });
    bindTap(document.getElementById('quit-change'), () => {
      if (!this.quitGhostTap()) this.openModes();
    });

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

  private openModes(): void {
    const overRun = this.quitOpen && this.state === 'paused';
    if (this.state !== 'title' && this.state !== 'gameover' && !overRun) return;
    if (this.ticketPending || this.cloneOpen || this.congratsOpen) return;
    this.modesOpen = true;
    this.modesOpenedAt = performance.now();
    const el = document.getElementById('modes-menu');
    const card = el?.querySelector<HTMLElement>('.cg-card');
    if (card) card.scrollTop = 0;
    el?.classList.add('open');
    el?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modes-open');
    this.input.clearTouch();
    this.input.clearJustPressed();
    this.audio.playUi();
  }

  /** A tap on the MODES menu within 400 ms of opening it is the opening tap's ghost click (touch). */
  private modesGhostTap(): boolean {
    return performance.now() - this.modesOpenedAt < 400;
  }

  private closeModes(): void {
    if (!this.modesOpen) return;
    this.modesOpen = false;
    if (this.calvinPickTimer) {
      window.clearTimeout(this.calvinPickTimer);
      this.calvinPickTimer = 0;
    }
    document.getElementById('calvin-pick')?.classList.remove('selected');
    const el = document.getElementById('modes-menu');
    el?.classList.remove('open');
    el?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modes-open');
    this.input.clearTouch();
    this.input.clearJustPressed();
  }

  /**
   * THE CALVIN TWINS entry: the first tap selects it (glow) and starts the run after a short
   * beat; tapping it again while it's selected (before the start) toggles the Easter egg,
   * TWINS <-> TRIPLETS, with a flourish, and leaves it selected. Works with touch or mouse.
   */
  private tapCalvin(b: HTMLElement): void {
    if (!this.modesOpen || this.modesGhostTap()) return;
    const variant = () => (this.calvinTriplets ? CALVIN_TRIPLETS : MODES.find((m) => m.behavior === 'calvin'));
    if (this.calvinPickTimer) {
      window.clearTimeout(this.calvinPickTimer);
      this.calvinPickTimer = 0;
      this.calvinTriplets = !this.calvinTriplets;
      this.syncCalvinEntry(b, true);
      this.audio.playCollect();
      window.setTimeout(() => this.audio.playUi(), 140);
      // Stays selected: the next single tap plays the variant now showing.
      b.classList.add('selected');
      return;
    }
    b.classList.add('selected');
    this.audio.playUi();
    this.calvinPickTimer = window.setTimeout(() => {
      this.calvinPickTimer = 0;
      b.classList.remove('selected');
      const m = variant();
      if (m) this.pickMode(m);
    }, CALVIN_PICK_MS);
  }

  /** Menu label for the Calvin entry (twins / triplets), with the reveal flourish if asked. */
  private syncCalvinEntry(b: HTMLElement, flourish = false): void {
    const m = this.calvinTriplets ? CALVIN_TRIPLETS : MODES.find((x) => x.behavior === 'calvin');
    if (!m) return;
    const name = b.querySelector('.mode-name');
    const ships = b.querySelector('.mode-ships');
    if (name) name.textContent = m.name;
    if (ships) ships.textContent = `${m.ships} DOGS`;
    b.setAttribute('aria-label', `${m.name}, ${m.ships} dogs`);
    if (flourish) {
      b.classList.remove('egg');
      void b.offsetWidth; // restart the CSS animation
      b.classList.add('egg');
      window.setTimeout(() => b.classList.remove('egg'), 1100);
    }
  }

  /** Start a fan-mode run at the selected level (11 is never a starting level for modes). */
  private pickMode(m: ModeDef): void {
    if (!this.modesOpen || this.modesGhostTap()) return;
    this.closeModes();
    void this.audio.unlock();
    if (this.quitOpen) {
      // CHANGE MODE mid-run: swap the mode in place. Score, level, level timer, shade and any
      // boss fight carry on; the pack keeps its health fraction in the new mode's dogs.
      this.closeQuitConfirm();
      this.switchMode(m, true);
      this.bannerText = `MODE  ·  ${m.name}`;
      this.bannerT = BANNER_SECONDS;
      if (this.state === 'paused') this.togglePause();
      this.input.clearTouch();
      this.input.clearJustPressed();
      return;
    }
    this.startRun(Math.min(this.difficulty, MAX_PUBLIC_DIFFICULTY), null, false, m);
  }

  /** QUIT (HUD, active play only): pause the run and show the QUIT RUN? confirm. */
  private openQuitConfirm(): void {
    if (this.state !== 'playing' || this.tutStep >= 0 || this.quitOpen || this.modesOpen) return;
    this.togglePause();
    if ((this.state as GameState) !== 'paused') return;
    this.quitOpen = true;
    this.quitOpenedAt = performance.now();
    const el = document.getElementById('quit-confirm');
    el?.classList.add('open');
    el?.setAttribute('aria-hidden', 'false');
    this.setBodyFlags();
    this.input.clearTouch();
    this.input.clearJustPressed();
  }

  /** A tap on the confirm within 400 ms of opening it is the opening tap's ghost click. */
  private quitGhostTap(): boolean {
    return performance.now() - this.quitOpenedAt < 400;
  }

  private closeQuitConfirm(): void {
    if (!this.quitOpen) return;
    this.quitOpen = false;
    const el = document.getElementById('quit-confirm');
    el?.classList.remove('open');
    el?.setAttribute('aria-hidden', 'true');
    this.setBodyFlags();
  }

  /** KEEP PLAYING (or Esc / P / the pause button): close the confirm and resume where it left off. */
  private keepPlaying(): void {
    if (!this.quitOpen || this.modesOpen) return;
    this.closeQuitConfirm();
    if (this.state === 'paused') this.togglePause();
    this.input.clearJustPressed();
  }

  /**
   * QUIT RUN: end the paused run with nothing recorded (no score, initials, game-over screen or
   * leaderboard / event write) and open the MODES menu on the title screen.
   */
  private quitRun(): void {
    if (!this.quitOpen || this.modesOpen || this.state !== 'paused') return;
    this.closeQuitConfirm();
    this.abandonRun();
    this.state = 'title';
    this.setBodyFlags();
    this.openModes();
  }

  /** Drop the current run's state; bumping runId makes any late async result for it a no-op. */
  private abandonRun(): void {
    this.runId++;
    this.runTicket = null;
    this.climbTicket = null;
    this.promoT = 0;
    this.promoNext = null;
    this.bannerT = 0;
    this.continueT = 0;
    this.score = 0;
    this.mode = null;
    this.boss = null;
    this.bossDone = false;
    this.world.spawnObstacles = true;
    this.level = 0;
    this.ships = 1;
    this.formation = this.cloneFormation;
    this.formation.clear();
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

  /**
   * The logical view changed size mid-run (phone rotated): keep the ship, pack, hazards and
   * circles in the same relative spots instead of stranding them at old coordinates, and give a
   * short grace so the re-layout can't cause a hit. Score, run, level and timers are untouched.
   */
  private relayoutPlayfield(oldW: number, oldH: number): void {
    const sx = this.viewW / oldW;
    const sy = this.viewH / oldH;
    const live = this.state === 'playing' || this.state === 'paused';
    this.player.x *= sx;
    this.player.y *= sy;
    for (const o of this.world.obstacles) {
      o.x = (o.x + o.w / 2) * sx - o.w / 2;
      o.y = (o.y + o.h / 2) * sy - o.h / 2;
    }
    for (const c of this.world.collectibles) {
      c.x *= sx;
      c.y *= sy;
    }
    for (const sl of this.formation.slots) {
      if (!sl.occupied) continue;
      sl.x *= sx;
      sl.y *= sy;
    }
    if (live) {
      this.player.invuln = Math.max(this.player.invuln, 1.0);
      for (const sl of this.formation.slots) if (sl.occupied) sl.invuln = Math.max(sl.invuln, 1.0);
    }
    this.tutViewMoved = true;
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
      const oldW = this.viewW;
      const oldH = this.viewH;
      this.viewW = nextW;
      this.viewH = nextH;
      this.renderer.resize(this.viewW, this.viewH);
      if (oldW > 0 && oldH > 0) this.relayoutPlayfield(oldW, oldH);
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
    if (this.modesOpen) return; // the MODES menu handles its own taps
    if (this.quitOpen) return; // so does the QUIT RUN? confirm
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
    if (t?.closest?.('#mute-btn, #pause-btn, #quit-btn, #quit-confirm, #hand-btn, #menu-btns, #modes-big, #tut-skip, #clone-btn, #demo, #diff-ctl, #donate')) return;
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
    document.body.classList.toggle('tutorial', this.tutStep >= 0 && (this.state === 'playing' || this.state === 'paused'));
    document.body.classList.toggle('quit-open', this.quitOpen);
    this.syncWakeLock();
    // Title-screen demo loop plays only while the title is up.
    const demo = document.getElementById('demo-video') as HTMLVideoElement | null;
    if (demo) {
      if (this.state === 'title') void demo.play().catch(() => {});
      else demo.pause();
    }
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
    if (this.modesOpen) return;
    if (this.state === 'paused' && this.quitOpen) this.closeQuitConfirm();
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
      // Difficulty 11 needs a server ticket (the #1's selector perk; shows the clone card).
      this.requestElevenRun();
      return;
    }
    this.startRun(this.difficulty, null);
  }

  /** Actually start play. The run timer (runTime) starts from 0 here. */
  /**
   * Gold clone button: level 11 for everyone, on the shared board. The server issues any player
   * a level-11 run ticket (and logs the 'start' event); the score is submitted with it. Offline,
   * or if no ticket comes back, the same level 11 is played and scored on this device's board.
   */
  private startCloneRun(): void {
    if (this.state !== 'title' && this.state !== 'gameover') return;
    if (this.ticketPending || this.cloneOpen || this.congratsOpen) return;
    if (!remoteEnabled) {
      this.startRun(SECRET_DIFFICULTY, null, true);
      return;
    }
    this.ticketPending = true;
    const seq = ++this.startSeq;
    this.audio.playUi();
    void startRemoteRun(loadClaimTokens()).then((t) => {
      if (seq !== this.startSeq) return;
      this.ticketPending = false;
      if (this.state !== 'title' && this.state !== 'gameover') return;
      if (t && t !== 'denied') this.startRun(SECRET_DIFFICULTY, Promise.resolve(t));
      else this.startRun(SECRET_DIFFICULTY, null, true);
    });
  }

  private startRun(difficulty: number, ticket: Promise<string | 'denied' | null> | null, localOnly = false, mode: ModeDef | null = null): void {
    this.awaitingTopAfterSubmit = false;
    this.runLocalOnly = localOnly;
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
    trackRunStart(mode ? mode.name : null, difficulty);
    this.victory = false;
    this.runStartLevel = difficulty;
    this.audio.stopSadTrombone();
    stopSpeech();
    this.toastT = 0;
    this.spinT = 0;
    this.shieldT = 0;
    this.catT = 0;
    this.photoT = 0;
    this.prizeT = 0;
    this.bossesFought = [];
    this.runSeed = this.forcedSeed ?? newSeed();
    this.forcedSeed = null;
    this.runRng = mulberry32(this.runSeed);
    this.catRng = mulberry32(subSeed(this.runSeed, 999));
    // The cat walks on the keyboard at most every few minutes, never in the first 30 s.
    this.nextCatAt = 90 + this.catRng() * 120;
    this.world.powerRand = mulberry32(subSeed(this.runSeed, 77));
    this.world.spawnPowers = true;
    console.info(`[fsb] run seed ${this.runSeed}`);
    this.boss = null;
    this.bossDone = false;
    this.bossesBeaten = 0;
    this.modesUsed = new Set(mode ? [mode.id] : []);
    this.modeFullShips = mode ? mode.ships : 0;
    this.world.spawnObstacles = true;
    this.runTicket = difficulty === SECRET_DIFFICULTY ? ticket : null;
    // Levels 1-10 are 30 s stages; clearing 10 carries on into 11 (any player). Its run ticket
    // is requested when 10 is cleared, dated back by the play time so far (see clearStage).
    this.climbTicket = null;
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
    this.mode = mode;
    this.decoyFaked = false;
    this.decoySlot = null;
    this.decoyHiddenT = 0;
    if (mode) {
      // Fan modes keep their own swarm (no dog pack).
      this.ships = mode.ships;
      this.setupSwarm(mode.scale);
      this.bannerText = mode.name;
      this.bannerT = BANNER_SECONDS;
    } else {
      this.formation = this.cloneFormation;
      this.formation.clear();
      if (this.level === 0) this.fillPack();
      else this.setPackK(1);
    }
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
    // The shared board's cap (SCORE_CAP, one constant; the SQL has the same single value).
    this.pendingScore = Math.min(SCORE_CAP, Math.floor(this.score));
    this.pendingRunMs = Math.round(this.runTime * 1000);
    this.pendingDifficulty = this.runDifficulty;
    this.pendingMode = this.mode ? this.mode.id : null;
    this.pendingModes = Math.max(1, this.modesUsed.size);
    this.pendingStart = this.runStartLevel;
    stopSpeech();
    this.announce(`${this.victory ? 'Victory' : 'Game over'}. Score ${this.pendingScore.toLocaleString('en-US')}, level ${this.pendingDifficulty}.`);
    if (!this.victory) {
      // Sad trombone, looping until any button, key or tap (respects mute).
      this.tromboneAt = performance.now();
      this.audio.startSadTrombone();
    }
    this.boss = null;
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
    this.boardIsRemote = this.remoteBoard !== null && !this.runLocalOnly;
    this.leaderboard = this.boardIsRemote && this.remoteBoard ? [...this.remoteBoard] : localBoard;
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
      if (this.runLocalOnly) return;
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
    const ticketReq = difficulty >= SECRET_DIFFICULTY ? this.runTicket : null;
    const endMode = this.pendingMode;
    const modeCount = this.pendingModes;
    const startLevel = this.pendingStart;
    const id = this.runId;
    // Always keep this device's board (offline fallback + personal best).
    const local = addEntry(score, initials, undefined, difficulty, this.pendingStart);
    if (remoteEnabled && this.remoteBoard && !this.runLocalOnly) {
      // Optimistic: show the entry on the shared board until the server replies.
      const optimistic = insertEntry(score, initials, this.remoteBoard, difficulty, this.pendingStart);
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

    if (!remoteEnabled || this.runLocalOnly) return;
    void (ticketReq ?? Promise.resolve(null))
      .then((t) => submitRemoteScore(initials, score, runMs, difficulty, t && t !== 'denied' ? t : null, undefined, endMode, modeCount, startLevel))
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
      if (this.modesOpen) {
        if (this.input.consume('escape')) this.closeModes();
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
      if (this.modesOpen) {
        if (this.input.consume('escape')) this.closeModes();
        this.input.clearJustPressed();
        return;
      }
      if (this.handleDifficultyKeys()) return;
      if (this.input.consumeAny()) this.beginRun();
      return;
    }

    if (this.quitOpen) {
      // QUIT RUN? confirm: Esc closes MODES back to it, else Esc / P keep playing.
      if (this.modesOpen) {
        if (this.input.consume('escape')) this.closeModes();
      } else if (this.input.consume('escape') || this.input.consume('p')) {
        this.keepPlaying();
      }
      this.input.clearJustPressed();
      return;
    }
    if (this.tutStep >= 0 && this.input.consume('escape')) {
      // Esc skips the How to Play walkthrough (P still pauses it).
      this.skipTutorial();
      this.input.clearJustPressed();
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

    if (this.photoT > 0) {
      this.photoT -= dt;
      this.particles.update(dt);
      if (this.photoT <= 0) {
        this.photoT = 0;
        this.prizeT = PRIZE_SECONDS;
        this.audio.playPromote();
      }
      this.input.clearJustPressed();
      return;
    }
    if (this.prizeT > 0) {
      this.prizeT -= dt;
      if (this.prizeT <= 0) {
        this.prizeT = 0;
        this.victory = true;
        this.endRun();
      }
      this.input.clearJustPressed();
      return;
    }
    if (this.catT > 0) {
      // "the cat is walking on the keyboard": everything (run clock, level timer) stands still.
      this.catT = Math.max(0, this.catT - dt);
      this.input.clearJustPressed();
      return;
    }
    if (this.tutStep < 0 && !this.boss && this.runTime >= 30 && this.runTime >= this.nextCatAt) {
      this.catT = 1.5 + this.catRng() * 1.5;
      this.nextCatAt = this.runTime + 150 + this.catRng() * 150;
      console.info(`[fsb] cat on keyboard ${this.catT.toFixed(1)}s`);
      this.input.clearJustPressed();
      return;
    }
    this.a11yT -= dt;
    if (this.a11yT <= 0) {
      this.a11yT = 3;
      this.announce(`Score ${Math.floor(this.score).toLocaleString('en-US')}, level ${this.runDifficulty}`);
    }

    this.runTime += dt;
    // Every level 1-111 is a 30 s stage: passing it promotes to the next level (score carries
    // over; gold levels 11+ also multiply the clone swarm). Exactly one level per pass.
    // Every tenth level (and 111) ends with THE BOARD: the level timer holds at the end while
    // the boss is up, and the level clears once it is beaten (or gets bored and leaves).
    this.levelTime += dt;
    if (this.boss) {
      this.levelTime = Math.min(this.levelTime, LEVEL_SECONDS);
    } else if (this.levelTime >= LEVEL_SECONDS) {
      const def = this.bossDone ? null : bossForLevel(this.runDifficulty);
      if (def) {
        this.levelTime = LEVEL_SECONDS;
        this.startBoss(def);
      } else {
        this.levelTime -= LEVEL_SECONDS;
        if (this.clearStage()) return;
      }
    }
    this.bannerT = Math.max(0, this.bannerT - dt);
    this.toastT = Math.max(0, this.toastT - dt);
    this.spinT = Math.max(0, this.spinT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);

    const boosting = this.input.boosting && this.charge > 0.05;
    const speedMul = boosting ? 1.35 : 1;
    if (boosting && this.input.consume(' ')) this.audio.playBoost();

    // Difficulty scales base speed + ramp (m) and points (pts). m is the eased hazard speed
    // (original level 1 eased for 1-10, original level 5 for 11; see utils/difficulty.ts).
    const d = this.runDifficulty;
    const hz = hazardLevers(d);
    const m = hz.speed;
    const pts = pointMultiplier(d);
    this.scrollSpeed = 240 * m + this.stageDist * 0.035 * m + (boosting ? 90 : 0) + (this.toastT > 0 ? 320 : 0);
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
    if (this.packRun) {
      // Pack growth eases in over ~0.3 s; sprites and hitboxes use the same scale.
      const want = packScale(this.ships);
      if (this.packK !== want) {
        const k = this.packK + (want - this.packK) * (1 - Math.exp(-12 * dt));
        this.setPackK(Math.abs(want - k) < 0.002 ? want : k);
      }
    }
    if (f.occupiedCount > 0) f.update(dt, this.player.x, this.player.y, this.pulse);
    if (this.mode?.behavior === 'mirror') this.placeMirror(pr.top, this.viewH - pr.bottom);
    if (this.decoyHiddenT > 0) this.decoyHiddenT = Math.max(0, this.decoyHiddenT - dt);
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
    if (this.boss) {
      this.boss.update({
        dt,
        W: this.viewW,
        top: pr.top,
        bottom: this.viewH - pr.bottom,
        px: this.player.x,
        py: this.player.y,
        packH: this.player.h + f.extUp + f.extDown,
        boosting,
      });
      this.bossEvents();
    }
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
    // The stage ramp holds while THE BOARD is up (a long fight must not run the scroll away).
    if (!this.boss) this.stageDist += this.scrollSpeed * dt * 0.35;
    this.score += (this.scrollSpeed * dt * 0.12 + (boosting ? 12 * dt : 0)) * pts;
    if (this.score > SCORE_CAP) this.score = SCORE_CAP;

    // shade drain
    const drain = ((boosting ? 0.14 : 0.048) + this.stageDist * 0.000003) * hz.drainMul;
    this.charge = clamp(this.charge - drain * dt, 0, 1);
    if (this.charge <= 0 && this.ships > 1) {
      // Out of shade with clones / pack dogs left: one is lost, the rest carry on.
      this.loseLeadShip(this.packRun ? 0.85 * hz.hitGraceMul : 1.0);
      this.charge = 0.75;
    }
    if (this.charge <= 0 && this.packRun && this.lastDogLost()) return;
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
        if (c.kind !== 'shade') {
          this.applyPower(c.kind, pts);
          continue;
        }
        this.charge = clamp(this.charge + 0.22, 0, 1);
        this.score += c.value * pts;
        if (this.score > SCORE_CAP) this.score = SCORE_CAP;
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
          if (this.shieldT > 0) {
            this.pizzaAbsorb();
            break;
          }
          if (this.ships > 1) {
            // With clones / pack dogs, a hit costs one ship (dog), not shade. No pause.
            this.loseLeadShip(this.packRun ? 0.85 * hz.hitGraceMul : 1.0);
            break;
          }
          if (this.packRun) {
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

    // THE BOARD: a shot (or its body) on the lead dog costs shade, not dogs (see bossHit).
    if (this.boss && this.player.invuln <= 0) {
      const bf = this.boss;
      let hit = bf.bodyHits(hb.x, hb.y, hb.w, hb.h);
      for (const s of bf.shots) {
        if (BossFight.harmful(s) && BossFight.shotHits(s, hb.x, hb.y, hb.w, hb.h)) {
          s.alive = false;
          hit = true;
        }
      }
      if (hit && this.shieldT > 0) this.pizzaAbsorb();
      else if (hit && this.bossHit(hz.hitDamageMul)) return;
    }

    // Clones: only the drawn ones collide; a hit clone is lost (the reserve refills its slot).
    if (f.occupiedCount > 0 && this.shieldT <= 0) this.collideClones();

    this.input.clearJustPressed();
  }

  /** Start the How to Play walkthrough (first load, or the How to Play button). Never scores. */
  private startTutorial(): void {
    this.world.spawnPowers = false;
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
    this.mode = null;
    this.formation = this.cloneFormation;
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
    this.tutViewMoved = false;
    while (this.floaters.length) {
      const f = this.floaters.pop();
      if (f) this.floaterPool.push(f);
    }
    this.player.reset(this.viewH);
    this.charge = 1;
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

  /** SKIP (button, or Esc on desktop): end the walkthrough on any step; saved as seen, nothing scored. */
  private skipTutorial(): void {
    if (this.tutStep < 0 || (this.state !== 'playing' && this.state !== 'paused')) return;
    void this.audio.unlock();
    this.finishTutorial();
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

    if (this.tutViewMoved) {
      // Rotation / resize re-laid the view out: that jump isn't the player flying.
      this.tutViewMoved = false;
      this.tutLastX = this.player.x;
      this.tutLastY = this.player.y;
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
        return { title: 'MOVE YOUR DOG', lines: [touch ? 'Drag the stick to fly' : 'WASD / Arrows to fly'] };
      case 1:
        return {
          title: 'DODGE THE GLARE',
          lines: ['Beams, flares and neon bars cost a dog', 'Fly into any ring gate: GATE BOOST, FULL POWER'],
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
            'Levels 1 to 111 get harder as you go',
            'You start with 4 dogs: lose them all = game over',
            `Circles refill shade, gates fill it; ${touch ? 'BOOST' : 'SPACE (boost)'} burns it`,
            touch ? 'Tap to ride' : 'ENTER or click to ride',
          ],
        };
    }
  }

  /**
   * Pass the current level. Returns true when the run ended (cleared 111 = victory).
   * 1-9: a ~2 s "LEVEL N COMPLETED / YOU'VE BEEN PROMOTED!" interstitial, then the next level
   * starts fresh (hazards cleared, ramp reset, shades full) with the score carried over.
   * 10: every player gets a "YOU BEAT LEVEL 10" interstitial, then the gold zone (level 11, clone
   * mode). On the shared board the run's ticket is requested now (the server logs the 'start'),
   * dated back by the play time so far so the whole run fits the ticket.
   * 11-110: the same interstitial, then the next gold level; its swarm is refilled to
   * shipsForLevel (lost clones come back). 111: victory screen, submitted as 111.
   */
  private clearStage(): boolean {
    const cleared = this.runDifficulty;
    if (cleared >= MAX_LEVEL) {
      // Group photo of every boss fought this run, then VICTORY.
      this.photoT = 6;
      this.bannerT = 0;
      this.audio.playPromote();
      this.input.clearJustPressed();
      return true;
    }
    if (cleared < MAX_PUBLIC_DIFFICULTY) {
      this.showPromotion(`LEVEL ${cleared} COMPLETED`, "YOU'VE BEEN PROMOTED!", () => {
        this.runDifficulty = cleared + 1;
        this.freshStage();
      });
      return false;
    }
    if (cleared === MAX_PUBLIC_DIFFICULTY) {
      // Beat level 10: straight into the gold zone (level 11) for everyone.
      this.climbTicket =
        remoteEnabled && !this.runLocalOnly ? startRemoteRun(loadClaimTokens(), this.runTime * 1000 + 1000) : null;
    }
    const title = cleared === MAX_PUBLIC_DIFFICULTY ? 'YOU BEAT LEVEL 10' : `LEVEL ${cleared} COMPLETED`;
    this.showPromotion(title, "YOU'VE BEEN PROMOTED!", () => {
      const next = cleared + 1;
      this.runDifficulty = next;
      if (cleared === MAX_PUBLIC_DIFFICULTY) this.runTicket = this.climbTicket;
      this.freshStage();
      // Every level change switches to a random mode (never the one just played; the Calvin
      // Triplets egg is not in the pool) with a fresh pack of its starting dogs.
      const m = this.randomMode();
      this.switchMode(m, false);
      this.bannerText = `LEVEL ${next}  ·  ${m.name}`;
      this.bannerT = BANNER_SECONDS;
    });
    return false;
  }

  /** VALUE FOR VALUE: TIME (suggestion) and TALENT (resume) panels; TREASURE is the Venmo link. */
  private bindV4V(): void {
    const modal = document.getElementById('v4v-modal');
    if (!modal) return;
    const stop = (e: Event): void => e.stopPropagation();
    for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup', 'touchstart', 'touchend']) modal.addEventListener(ev, stop);
    const title = document.getElementById('v4v-modal-title');
    const errs = (): NodeListOf<HTMLElement> => modal.querySelectorAll('.v4v-err');
    const open = (view: 'time' | 'talent'): void => {
      modal.dataset.view = view;
      if (title) title.textContent = view === 'time' ? 'TIME' : 'TALENT';
      errs().forEach((e) => (e.textContent = ''));
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      this.input.clearTouch();
      window.setTimeout(() => (modal.querySelector(view === 'time' ? '#v4v-msg-in' : '#v4v-rname') as HTMLElement | null)?.focus(), 60);
    };
    const close = (): void => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      this.input.clearTouch();
      this.input.clearJustPressed();
    };
    const done = (text: string): void => {
      const t = document.getElementById('v4v-done-text');
      if (t) t.textContent = text;
      if (title) title.textContent = modal.dataset.view === 'time' ? 'TIME' : 'TALENT';
      modal.dataset.view = 'done';
    };
    modal.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') close();
    });
    for (const [id, view] of [['v4v-time', 'time'], ['v4v-talent', 'talent']] as const) {
      const b = document.getElementById(id);
      b?.addEventListener('pointerdown', stop);
      b?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void this.audio.unlock();
        this.audio.stopSadTrombone();
        open(view);
      });
    }
    modal.querySelectorAll('.v4v-cancel').forEach((b) => b.addEventListener('click', close));
    const msg = document.getElementById('v4v-msg-in') as HTMLTextAreaElement | null;
    const count = document.getElementById('v4v-count');
    msg?.addEventListener('input', () => {
      if (count) count.textContent = `${msg.value.length} / ${SUGGEST_MAX}`;
    });
    const val = (sel: string): string => (modal.querySelector(sel) as HTMLInputElement | null)?.value ?? '';
    const submit = (formId: string, run: () => Promise<void>, thanks: string): void => {
      const form = document.getElementById(formId) as HTMLFormElement | null;
      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const err = form.querySelector('.v4v-err') as HTMLElement | null;
        const send = form.querySelector('.v4v-send') as HTMLButtonElement | null;
        if (send?.disabled) return;
        if (send) send.disabled = true;
        if (err) err.textContent = '';
        run()
          .then(() => {
            form.reset();
            if (count) count.textContent = `0 / ${SUGGEST_MAX}`;
            done(thanks);
          })
          .catch((x: unknown) => {
            const m = x instanceof Error ? x.message : String(x);
            if (err) err.textContent = /HTTP 429|too many/i.test(m) ? 'Easy there. Try again in an hour.' : m.replace(/^fsb_\w+ HTTP \d+ (fsb: )?/, '');
          })
          .finally(() => {
            if (send) send.disabled = false;
          });
      });
    };
    submit('v4v-time-form', () => sendSuggestion(val('#v4v-msg-in'), val('#v4v-name-in'), val('#v4v-email-in'), val('#v4v-time-form .v4v-hp')), 'THANK YOU FOR YOUR TIME');
    const file = document.getElementById('v4v-rfile') as HTMLInputElement | null;
    file?.addEventListener('change', () => {
      const r = checkResume(file.files?.[0]);
      const err = document.querySelector('#v4v-talent-form .v4v-err') as HTMLElement | null;
      if (err) err.textContent = typeof r === 'string' ? r : '';
    });
    submit(
      'v4v-talent-form',
      () => {
        const f = file?.files?.[0];
        const r = checkResume(f);
        if (typeof r === 'string' || !f) return Promise.reject(new Error(typeof r === 'string' ? r : 'Pick a file.'));
        return sendResume(val('#v4v-rname'), val('#v4v-remail'), val('#v4v-rnote'), f, val('#v4v-talent-form .v4v-hp'));
      },
      'TALENT RECEIVED',
    );
  }

  /** Kitchen-appliance power-ups (silliness pack). TOASTER points are inside the server's budget. */
  private applyPower(kind: Appliance, pts: number): void {
    const x = this.player.x;
    const y = this.player.y;
    this.audio.playGate();
    if (kind === 'toaster') {
      this.toastT = TOASTER_SECONDS;
      this.player.vx += 900;
      this.player.invuln = Math.max(this.player.invuln, 1.5);
      this.score += TOASTER_POINTS * pts;
      if (this.score > SCORE_CAP) this.score = SCORE_CAP;
      this.spawnFloater(x, y - 24, `TOASTED! +${Math.round(TOASTER_POINTS * pts)}`, '#ffb347');
      this.particles.burst(x, y, '#ffb347', this.touchPrimary ? 10 : 22, 260);
    } else if (kind === 'blender') {
      this.spinT = BLENDER_SECONDS;
      this.spawnFloater(x, y - 24, 'BLENDED!', '#7fffff');
    } else {
      this.shieldT = MICROWAVE_SECONDS;
      this.spawnFloater(x, y - 24, 'LEFTOVER PIZZA SHIELD!', '#f4c542');
    }
  }

  /** The pizza shield eats a hit: a slice flies off, no damage. */
  private pizzaAbsorb(): void {
    this.player.invuln = Math.max(this.player.invuln, 0.5);
    this.boss?.clearNear(this.player.x, this.player.y, BOSS_MERCY_R * 0.6);
    this.particles.burst(this.player.x, this.player.y, '#f4c542', this.touchPrimary ? 6 : 14, 200);
    this.audio.playCollect();
  }

  /** Mirror a short status line into the screen-reader live region (canvas text isn't readable). */
  private announce(text: string): void {
    const el = document.getElementById('score-a11y');
    if (el && el.textContent !== text) el.textContent = text;
  }

  /** A random mode from the 12 (not the current one, never the Calvin Triplets egg). */
  private randomMode(): ModeDef {
    const cur = this.mode?.id;
    const pool = MODES.filter((m) => m.id !== cur && m.id !== CALVIN_TRIPLETS.id);
    return pick(this.runRng, pool);
  }

  /**
   * Switch the run to mode m in place (score, level, level timer, shade and boss carry on).
   * scaled=false (a level change): a fresh pack of the mode's starting dogs. scaled=true (CHANGE
   * MODE mid-level): the pack keeps its current health fraction, rounded, at least 1 dog.
   */
  private switchMode(m: ModeDef, scaled: boolean): void {
    let n = m.ships;
    if (scaled) {
      const full = this.mode ? this.modeFullShips : this.level > 0 ? shipsForLevel(this.level) : PACK_START;
      const frac = Math.min(1, this.ships / Math.max(1, full));
      n = Math.max(1, Math.min(m.ships, Math.round(m.ships * frac)));
    }
    this.mode = m;
    this.level = 0;
    this.modeFullShips = m.ships;
    this.modesUsed.add(m.id);
    this.decoyFaked = false;
    this.decoySlot = null;
    this.decoyHiddenT = 0;
    this.ships = n;
    this.setupSwarm(m.scale);
    this.player.invuln = Math.max(this.player.invuln, 1.0);
  }

  /** THE BOARD arrives: hazards stop spawning (shades and rings keep coming). */
  private startBoss(def: BossDef): void {
    const local = loadLeaderboard();
    const bestLvl = local.reduce((a, e) => Math.max(a, e.difficulty ?? 0), 0);
    const pinned = Math.max(this.high, this.remoteBoard?.[0]?.score ?? 0);
    this.boss = new BossFight(def, this.runSeed, historyJabs(this.high, bestLvl, local.length), pinned);
    this.bossesFought.push(def);
    this.world.spawnObstacles = false;
    this.bannerText = `THE BOARD  ·  ${def.name}`;
    this.bannerT = BANNER_SECONDS;
    this.audio.playPromote();
    console.info(`[fsb] boss L${def.level} ${def.modeId} seed ${this.boss.seed}`);
  }

  /** Apply the boss's queued events (rings, hits, stun, bonus, exit). */
  private bossEvents(): void {
    const bf = this.boss;
    if (!bf) return;
    for (const e of bf.events) {
      switch (e.type) {
        case 'ring':
          this.world.addRing(e.x, e.y);
          break;
        case 'taunt':
          if (!this.audio.isMuted) speakTrailer(e.text);
          break;
        case 'hit':
          if (e.decoy) {
            if (Math.random() < 0.3) this.spawnFloater(e.x, e.y - 10, 'DECOY!', '#ffffff');
          } else {
            this.particles.burst(e.x, e.y, e.crit ? '#ffe66d' : bf.def.tint, this.touchPrimary ? 3 : 6, 140);
          }
          break;
        case 'stunned':
          this.audio.playGate();
          this.spawnFloater(bf.main.x, bf.main.y - bf.main.h / 2 - 10, 'BOARD STUNNED!', '#ffe66d');
          this.renderer.bumpShake(6);
          break;
        case 'phase':
          this.renderer.bumpShake(8);
          this.renderer.bumpFlash(0.25);
          break;
        case 'defeated':
          // Flat bonus, not multiplied, still capped.
          this.score = Math.min(SCORE_CAP, this.score + BOSS_BONUS);
          this.bossesBeaten++;
          this.audio.playPromote();
          this.renderer.bumpShake(16);
          this.renderer.bumpFlash(0.6);
          this.particles.burst(bf.main.x, bf.main.y, '#ffe66d', this.touchPrimary ? 24 : 60, 360);
          this.spawnFloater(bf.main.x - bf.main.w, bf.main.y, '+1,000,000', '#ffe66d');
          this.bannerText = `THE BOARD BEATEN  ·  +1,000,000`;
          this.bannerT = BANNER_SECONDS;
          break;
        case 'bored':
          this.bannerText = 'THE BOARD GOT BORED  ·  NO BONUS';
          this.bannerT = BANNER_SECONDS;
          break;
        case 'gone':
          this.boss = null;
          this.bossDone = true;
          this.world.spawnObstacles = true;
          break;
        default:
          break;
      }
    }
    bf.events.length = 0;
  }

  /**
   * A boss shot hits the lead dog: shade, not dogs (so every mode has the same margin). An empty
   * shade costs dogs as usual (and refills to 0.75); with no dogs left it's game over.
   * Returns true when the tick must stop (run over / continue prompt).
   */
  private bossHit(damageMul: number): boolean {
    this.boss?.clearNear(this.player.x, this.player.y, BOSS_MERCY_R);
    this.charge = clamp(this.charge - 0.2 * damageMul, 0, 1);
    this.player.invuln = BOSS_HIT_GRACE;
    this.hitFx(this.player.x, this.player.y, true);
    if (this.charge > 0) return false;
    if (this.ships > 1) {
      this.loseLeadShip(BOSS_HIT_GRACE);
      this.charge = 0.75;
      return false;
    }
    if (this.packRun) return this.lastDogLost();
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
    this.bossDone = false;
    this.boss = null;
    this.world.spawnObstacles = true;
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

  /** HUD icons: the player's dog first, then the pack dogs still running. */
  private packBreeds(): Breed[] {
    const out: Breed[] = [this.player.breed];
    for (const sl of this.formation.slots) if (sl.occupied) out.push(sl.breed);
    return out;
  }

  /** Dogs lost per hit: a quarter of the level's swarm on gold levels 15+ (see shipHitCost), else 1. */
  private get hitCost(): number {
    return this.level > 0 && !this.mode ? shipHitCost(this.level) : 1;
  }

  /** Reserve ships beyond the drawn formation. */
  private get reserve(): number {
    return Math.max(0, this.ships - 1 - this.formation.occupiedCount);
  }

  /** The player's ship is lost (hit or out of shade) while clones remain: a clone takes over. */
  private loseLeadShip(grace = 1.0): void {
    this.ships = Math.max(1, this.ships - this.hitCost);
    while (this.ships - 1 < this.formation.occupiedCount) this.formation.dropOutermost();
    this.player.invuln = grace;
    this.hitFx(this.player.x, this.player.y, true);
    if (this.packRun) this.dogLost(grace);
  }

  /** A normal levels 1-10 run (not clone mode, not a fan mode): the dog pack rules apply. */
  private get packRun(): boolean {
    return this.level === 0 && !this.mode;
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
    if (this.packRun && this.tutStep < 0) {
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
      if (s === this.decoySlot && this.decoyHiddenT > 0) continue;
      hb.w = 52 * s.scale * 0.7;
      hb.h = 28 * s.scale * 0.7;
      hb.x = s.x - hb.w / 2;
      hb.y = s.y - hb.h / 2;
      let lost = false;
      for (const o of obs) {
        if (!o.alive) continue;
        if (this.hitsObstacle(o, hb)) {
          this.loseClone(s);
          lost = true;
          break;
        }
      }
      if (lost || !this.boss) continue;
      for (const sh of this.boss.shots) {
        if (BossFight.harmful(sh) && BossFight.shotHits(sh, hb.x, hb.y, hb.w, hb.h)) {
          sh.alive = false;
          this.loseClone(s);
          break;
        }
      }
    }
  }

  private loseClone(s: CloneSlot): void {
    if (this.mode?.behavior === 'decoy' && !this.decoyFaked) {
      // OPERATION DOUBLE DECOY: the first hit on the decoy is faked. Full death effect, it
      // vanishes for 1.4 s, then slips back in (blinking) — no ship is lost.
      this.decoyFaked = true;
      this.decoySlot = s;
      this.decoyHiddenT = 1.4;
      s.invuln = 2.2;
      this.particles.burst(s.x, s.y, '#ffaa44', this.touchPrimary ? 12 : 28, 260);
      this.hitFx(s.x, s.y, true);
      this.spawnFloater(s.x, s.y - 20, 'DECOY!', '#ffe66d');
      return;
    }
    this.hitFx(s.x, s.y, false);
    this.ships = Math.max(1, this.ships - this.hitCost);
    if (this.reserve > 0) {
      // A reserve ship fills the slot, easing in from the player's ship with a short grace.
      s.x = this.player.x;
      s.y = this.player.y;
      s.invuln = 0.6;
    } else {
      this.formation.empty(s);
      while (this.ships - 1 < this.formation.occupiedCount) this.formation.dropOutermost();
    }
    if (this.packRun) this.dogLost(0.85 * hazardLevers(this.runDifficulty).hitGraceMul);
  }

  /**
   * Fan mode swarm: every ship (player + clones) gets a breed; each dog's linear scale is
   * k * breedScale, with k set so the whole swarm's area = ships * scale^2 standard ships
   * (10 for the area-10 rule; TOO FAT 16 * 2^2 = 64). Sprites and hitboxes use it.
   */
  private setupSwarm(scale: number): void {
    const m = this.mode;
    if (!m) return;
    const n = this.ships;
    const breeds = modeBreeds(m, n);
    const sumB2 = breeds.reduce((a, b) => a + breedScale(b) ** 2, 0);
    const k = Math.sqrt((n * scale * scale) / sumB2);
    this.player.breed = breeds[0];
    this.player.scale = k * breedScale(breeds[0]);
    this.player.w = 52 * this.player.scale;
    this.player.h = 28 * this.player.scale;
    const sp = m.spacing;
    this.formation = new Formation(Math.max(1, n - 1), 54 * scale * sp, 30 * scale * sp);
    this.formation.fill(n - 1, this.player.x, this.player.y);
    let i = 1;
    for (const s of this.formation.slots) {
      if (!s.occupied) continue;
      s.breed = breeds[i++] ?? breeds[0];
      s.scale = k * breedScale(s.breed);
    }
    this.decoySlot = null;
  }

  /** ADJACENT MANTZOUKAS: the 2nd ship mirrors you top-to-bottom, one ship-width "next door". */
  private placeMirror(top: number, bottom: number): void {
    for (const s of this.formation.slots) {
      if (!s.occupied) continue;
      s.x = this.player.x + 60 * this.player.scale;
      s.y = clamp(top + bottom - this.player.y, top, bottom);
      break;
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
   * Ring gates: the first touch on any part of a ring (rim or hole) by the player's dog or a
   * pack / swarm dog gives GATE BOOST · FULL POWER (shade to a full bar) with a gold ring flash,
   * sparkle burst and chime. Once per gate; gates are never hazards.
   */
  private checkGates(): void {
    const obs = this.world.obstacles;
    let rings = false;
    for (const o of obs) if (o.kind === 'ring' && o.alive && !o.passed) rings = true;
    if (!rings) return;
    const phb = this.player.hitbox;
    for (const o of obs) {
      if (o.kind !== 'ring' || !o.alive || o.passed) continue;
      let touched = this.touchesGate(o, phb.x, phb.y, phb.w, phb.h);
      if (!touched) {
        for (const sl of this.formation.slots) {
          if (!sl.occupied) continue;
          const w = 52 * sl.scale * 0.7;
          const h = 28 * sl.scale * 0.7;
          if (this.touchesGate(o, sl.x - w / 2, sl.y - h / 2, w, h)) {
            touched = true;
            break;
          }
        }
      }
      if (!touched) continue;
      o.passed = true;
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      this.charge = Math.max(this.charge, GATE_CHARGE);
      o.boostT = GATE_GLOW_SECONDS;
      this.audio.playGate();
      this.particles.burst(cx, cy, '#ffe66d', this.touchPrimary ? 10 : 18, 200);
      this.spawnFloater(cx, o.y - 6, 'GATE BOOST · FULL POWER', '#ffe66d');
      this.boss?.stunHit();
    }
  }

  /** Does this box touch any part of ring gate o (its outer ellipse, rim included)? */
  private touchesGate(o: Obstacle, x: number, y: number, w: number, h: number): boolean {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const qx = clamp(cx, x, x + w);
    const qy = clamp(cy, y, y + h);
    const nx = (qx - cx) / (o.w / 2);
    const ny = (qy - cy) / (o.h / 2);
    return nx * nx + ny * ny <= 1.05;
  }

  private hitsObstacle(o: Obstacle, hb: { x: number; y: number; w: number; h: number }): boolean {
    // Ring gates are never hazards (touching one is a GATE BOOST, see checkGates).
    if (o.kind === 'ring') return false;
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
    if (this.spinT > 0 && this.state === 'playing') {
      // BLENDER: one eased spin of the world (HUD and controls stay put), slightly zoomed out.
      const k = 1 - this.spinT / BLENDER_SECONDS;
      const e = k * k * (3 - 2 * k);
      const z = 1 - 0.14 * Math.sin(Math.PI * k);
      ctx.translate(this.viewW / 2, this.viewH / 2);
      ctx.rotate(e * Math.PI * 2);
      ctx.scale(z, z);
      ctx.translate(-this.viewW / 2, -this.viewH / 2);
    }
    this.renderer.drawBackground(ctx, this.charge);
    if (this.state !== 'title') {
      this.renderer.drawObstacles(ctx, this.world.obstacles);
      this.renderer.drawCollectibles(ctx, this.world.collectibles);
      if (this.boss) this.boss.hudBottom = this.renderer.hudBottom(this.viewW, this.viewH);
      if (this.boss) drawBoss(ctx, this.boss, this.viewW, (n) => this.renderer.u(n), this.renderer.lite, this.pulse);
      this.particles.draw(ctx);
      if ((this.level > 0 || (this.formation.occupiedCount > 0 && !this.mode)) && (this.state === 'playing' || this.state === 'paused')) {
        this.renderer.drawClones(ctx, this.formation, this.ships, this.player.x, this.player.y);
      } else if (this.mode && (this.state === 'playing' || this.state === 'paused')) {
        const m = this.mode;
        const hidden = this.decoyHiddenT > 0 ? this.decoySlot : null;
        this.renderer.drawSwarm(ctx, this.formation, m.tint, m.style, this.ships, this.player.x, this.player.y, hidden);
      }
      this.renderer.drawPlayer(ctx, this.player, this.charge);
      if (this.shieldT > 0) drawPizzaShield(ctx, this.player.x, this.player.y, Math.max(this.player.w, this.player.h) * 0.75 + 14, this.pulse, this.shieldT);
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
        this.tutStep >= 0
          ? null
          : this.level > 0
            ? { level: this.level, ships: this.ships }
            : this.mode
              ? { level: this.runDifficulty, ships: this.ships }
              : { level: this.runDifficulty, ships: 0, dogs: this.packBreeds(), dogIconScale: packScale(this.ships) / PACK_S0 },
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
    if (this.photoT > 0) drawGroupPhoto(ctx, this.bossesFought, this.viewW, this.viewH, (n) => this.renderer.u(n), this.pulse);
    if (this.prizeT > 0) drawPrizeReveal(ctx, this.viewW, this.viewH, (n) => this.renderer.u(n), this.pulse, PRIZE_SECONDS - this.prizeT);
    if (this.catT > 0) drawCatLoading(ctx, this.viewW, this.viewH, this.pulse, (n) => this.renderer.u(n));
    if (this.state === 'title') this.renderer.drawTitle(ctx, this.high, this.pulse);
    if (this.state === 'paused') {
      // The QUIT pill menu is its own (DOM) stall door: just dim the game behind it, no second door.
      if (this.quitOpen || this.modesOpen) {
        ctx.fillStyle = 'rgba(5, 0, 18, 0.65)';
        ctx.fillRect(0, 0, this.viewW, this.viewH);
      } else this.renderer.drawPause(ctx);
    }
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
        this.boardIsRemote ? 'GLOBAL TOP 11' : 'TOP 11',
        this.victory ? `YOU BEAT LEVEL ${MAX_LEVEL} · PRIZE: THE DUCHESS` : 'TOO BRIGHT!',
      );
    }
  }
}
