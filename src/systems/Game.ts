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
import { MODES, CALVIN_TRIPLETS, MISSION_MODE, isMission, modeBreeds, type ModeDef } from '../utils/modes';
import { MissionCar, PARTS as MISSION_PART_LIST, CAR_UP, CAR_DOWN, CAR_HALF, type MissionSfx } from './missionCar';
import { fetchDevBoard, submitDevScore } from '../utils/devBoard';
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
  saveDifficulty,
  loadClaimTokens,
  addClaimToken,
  loadElevenUnlocked,
  saveElevenUnlocked,
  loadElevenRevealSeen,
  saveElevenRevealSeen,
  loadTutorialDone,
  saveTutorialDone,
  loadMissionBoard,
  loadMissionHigh,
  saveMissionHigh,
  addMissionEntry,
  type HandPreference,
  type LeaderboardEntry,
} from '../utils/storage';
import { remoteEnabled, fetchRemoteBoard, submitRemoteScore, amITop, startRemoteRun } from '../utils/remoteBoard';
import { DesertSearch, DESERT_SEARCH_ON_MISSION } from './desertSearch';
import { trackRunStart } from '../utils/track';
import { SPEED_DEFAULT, SPEED_MAX, SPEED_MIN, SPEED_ON_PUBLIC_BOARD, clampSpeed, fmtSpeed, loadSpeed, saveSpeed, scalePoints, speedSubsteps } from '../utils/speed';
import { checkResume, sendResume, sendSuggestion, SUGGEST_MAX } from '../utils/v4v';
import { boardTaunt } from './boardTaunt';
import { firstChar, isRude, maskInitials, nextChar, rudePrompt } from '../utils/initials';
import { LANGS, applyDomStrings, fmtNum, lang, loadLangFonts, onLang, setLang, t as tr, type Lang } from '../i18n';
import { BARK_EVERY, BARK_SPEED, BOSS_BONUS, BOSS_HIT_GRACE, BOSS_MERCY_R, BossFight, bossForLevel, drawBoss, type BossDef } from './Boss';
import { APP_VERSION } from '../version';
import { MINI_TOTAL, miniBanner, miniBeatenText, miniBonus, miniBossForLevel, miniGateText, miniLiveCount, missionFirstMiniForLevel } from './miniBoss';
import { createLevelSelect, type LevelSelect } from './levelSelect';
import { mulberry32, newSeed, pick, subSeed, type Rng } from '../utils/rng';
import {
  BLENDER_SECONDS,
  MICROWAVE_SECONDS,
  TOASTER_POINTS,
  TOASTER_SECONDS,
  catShouldFire,
  catStageDelay,
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
  clampLevel,
} from '../utils/difficulty';

export type GameState = 'title' | 'playing' | 'paused' | 'initials' | 'gameover';

/** How to Play walkthrough step count. */
const TUT_STEPS = 4;
/** MODES menu: a tap on THE CALVIN TWINS starts it after this beat (ms); a 2nd tap = the egg. */
const CALVIN_PICK_MS = 550;
/** Ignore restart input this long after submitting initials (a quick double Enter / tap keeps the board up). */
const RESTART_LOCK_MS = 800;
/** Level-up banner duration (s). */
/** Length of THE DUCHESS OF PASADENA prize reveal, s. */
const PRIZE_SECONDS = 5;
const BANNER_SECONDS = 2.4;
/** FIGHT THE BOSS start: seconds of level left before the boss / mini-boss arrives. */
const FIGHT_LEAD_S = 1.5;
/**
 * Ring gates are pure boosts: touching any part of one (rim or hole) sets the shade charge to
 * this (a full bar), once per gate. Gates never cost a dog, shade or count as a hit.
 */
const GATE_CHARGE = 1.0;
/** FIRE vs hazards (v2.1): hit flash (s, same as a boss's hurt flash), points per hp popped. */
const HAZARD_HIT_FLASH = 0.35;
const HAZARD_POP_POINTS = 25;
const HAZARD_HIT_POPS: [string, 'honk' | 'boing'][] = [['BONK!', 'honk'], ['BOING!', 'boing'], ['PLINK!', 'boing'], ['HONK!', 'honk']];
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

/**
 * ON A MISSION car. Art: MISSION_CAR_LEN view units long (64 car units; body + bumpers ~1.1x
 * that). Hitbox: a standard ship's at MISSION_HIT_SCALE (52 x 28 * scale, 70 % of it), so the
 * hitbox grows about half as much as the art did (art 1.4 -> 1.8, hitbox 1.4 -> 1.6) and stays
 * inside the body: obstacles have to touch the car itself, not its glow, light bar or loudspeaker.
 */
const MISSION_CAR_LEN = 52 * 1.8;
const MISSION_HIT_SCALE = 1.6;
/** The car's top above its centre (roof loudspeaker), and below it (wheels + hover glow), car units. */
const MISSION_CAR_UP = CAR_UP;
const MISSION_CAR_DOWN = CAR_DOWN;
/** ON A MISSION: shade a hit costs (x the level's hit damage). A hit never takes shade below the floor. */
const MISSION_HIT_SHADE = 0.12;
const MISSION_SHADE_FLOOR = 0.05;
const MISSION_PARTS = MISSION_PART_LIST.length;

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
  /** Seconds left on the friendly "pick different initials" nudge (rude initials blocked). */
  private initialsWarn = 0;
  /** After an initials submit, restart input (keys, taps, BOOST) is ignored until this time (ms) so a quick double Enter / tap can't skip the board. */
  private restartLockUntil = 0;
  /** Stick held on up / down: consecutive steps (the scroll speeds up through long sets like Chinese). */
  private initialsHold = 0;
  /** Which leaderboard-screen taunt line this game over shows (systems/boardTaunt.ts). */
  private boardTauntPick = 0;
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
  /** GAME SPEED in integer tenths (10 = 1.0 ... 111 = 11.1), saved per device (utils/speed.ts). */
  private speedTenths = loadSpeed();
  /** The highest speed this run has used (a run that ever ran above 1.0 is a speed run). */
  private runSpeedMax = SPEED_DEFAULT;
  /** The ended run's top speed (sent as p_speed once the server supports it). */
  private pendingSpeed = SPEED_DEFAULT;
  private speedPanelOpen = false;
  private speedPanelKey = '';
  /** Top of the GAME SPEED panel in view units (the stall door's writing stays above it). */
  private speedPanelTopView = Infinity;
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
  /** Boss fight in progress (end of levels 10, 20 ... 110 and 111), else null. */
  private boss: BossFight | null = null;
  /** This level's boss has been fought (beaten or bored), so the level can now be cleared. */
  private bossDone = false;
  bossesBeaten = 0;
  /** MINI-BOSSES beaten this run (every level without a big boss ends in one; see miniBoss.ts). */
  minisBeaten = 0;
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
  /** Cat gag already fired this run (at most once). */
  catShown = false;
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
  /** LEVEL SELECT FIGHT THE BOSS: this run began at its start level's boss / mini-boss. */
  private runFight = false;
  private pendingFight = false;
  private levelSelect!: LevelSelect;
  private lastHitSfx = 0;
  /** An accepted submit is waiting for its #1 check (survives superseded checks). */
  private awaitingTopAfterSubmit = false;
  /** ON A MISSION is a regular mode: listed in MODES for every player (no unlock needed). */
  private missionUnlocked = true;
  /** The current / last run is ON A MISSION: DEV BOARD only, never the public board. */
  private missionRun = false;
  /** The run that just ended (initials / game over) was ON A MISSION. */
  private pendingMission = false;
  private readonly car = new MissionCar();
  /** Last DEV BOARD fetched (null = never / unavailable). */
  private devBoard: LeaderboardEntry[] | null = null;
  /** COMBING THE DESERT: the missed-the-TOP-11 taunt card (systems/desertSearch.ts). */
  private desert: DesertSearch | null = null;
  private devOpen = false;
  private devSeq = 0;
  private dpr = 1;
  private viewW = LANDSCAPE_W;
  private viewH = LANDSCAPE_H;
  private lastBufW = 0;
  private lastBufH = 0;
  private floaters: { x: number; y: number; text: string; life: number; color: string }[] = [];
  /** FIRE outside boss fights: the dogs' barks (WOOF), the same shot a boss takes (Boss.ts barks). */
  private barks: { x: number; y: number; alive: boolean }[] = [];
  private barkT = 0;
  /** Slapstick word throttle for hazard hits (like the boss's comic pops). */
  private hazardPopCd = 0;
  /** Hazards popped by FIRE this run (tests / stats). */
  hazardsPopped = 0;
  /** The lead's hitbox swept along this step's move (see sweepPlayer); sweepN boxes are live. */
  private sweepBoxes: { x: number; y: number; w: number; h: number }[] = [];
  private sweepN = 0;
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
    this.desert = new DesertSearch(
      () => this.audio.isMuted,
      () => (this.state === 'title' || this.state === 'gameover') && !this.modesOpen && !this.congratsOpen && !this.cloneOpen,
    );
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
        if (this.restartLocked()) return;
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
        handBtn.textContent = tr('hand_btn_left');
        handBtn.setAttribute('aria-label', tr('hand_aria_left'));
      } else {
        handBtn.textContent = tr('hand_btn_right');
        handBtn.setAttribute('aria-label', tr('hand_aria_right'));
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
      // TREASURE never opens Venmo directly: it opens the ask-a-grown-up card (bindGrownUp), whose
      // "Continue to Venmo" link carries DONATE_URL and runs openVenmo().
      donate.href = '#';
      const msg = document.getElementById('v4v-msg');
      const note = document.getElementById('donate-note');
      const syncDonate = (): void => {
        if (msg) msg.textContent = lang() === 'en' ? V4V_MESSAGE : tr('v4v_message');
        if (note) note.textContent = tr('donate_note', { h: VENMO_HANDLE });
      };
      syncDonate();
      onLang(syncDonate);
      document.body.classList.add('has-donate');
      document.getElementById('donate')?.setAttribute('aria-hidden', 'false');
      donate.addEventListener('pointerdown', (e) => e.stopPropagation());
      donate.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void this.audio.unlock();
        this.audio.stopSadTrombone();
        this.askGrownUp('venmo');
      });
    } else {
      document.getElementById('donate')?.remove();
    }

    // Keyboard on the VALUE FOR VALUE card's own buttons (Enter / Space) activates them instead of
    // reaching the game's "ride again" keys.
    const card = document.getElementById('donate');
    for (const ev of ['keydown', 'keyup']) card?.addEventListener(ev, (e) => e.stopPropagation());
    this.bindGrownUp();
    this.bindV4V();
    // Privacy / Terms footer (title screen): taps there never start a run.
    const legal = document.getElementById('legal-links');
    for (const ev of ['pointerdown', 'pointerup', 'keydown', 'keyup', 'touchstart']) legal?.addEventListener(ev, (e) => e.stopPropagation());

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
        ships.textContent = tr('mode_dogs', { n: fmtNum(m.ships) });
        ships.style.color = m.tint;
        b.append(name, ships);
        b.setAttribute('aria-label', tr('mode_aria', { m: m.name, n: m.ships }));
        if (m.behavior === 'calvin') {
          b.id = 'calvin-pick';
          bindTap(b, () => this.tapCalvin(b));
        } else {
          bindTap(b, () => this.pickMode(m));
        }
        list.appendChild(b);
        if (m.behavior !== 'calvin') {
          onLang(() => {
            ships.textContent = tr('mode_dogs', { n: fmtNum(m.ships) });
            b.setAttribute('aria-label', tr('mode_aria', { m: m.name, n: m.ships }));
          });
        } else onLang(() => this.syncCalvinEntry(b));
      }
    }
    // ON A MISSION: a regular mode for every player. Its entry and the DEV BOARD button sit at the
    // top of the list (never offered by CHANGE MODE); its scores go only to the DEV BOARD.
    if (list) {
      const row = document.createElement('div');
      row.id = 'mission-row';
      row.hidden = !this.missionUnlocked;
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'mission-pick';
      b.className = 'hand-btn mode-pick mission-pick';
      b.draggable = false;
      const name = document.createElement('span');
      name.className = 'mode-name';
      name.textContent = MISSION_MODE.name;
      const sub = document.createElement('span');
      sub.className = 'mode-ships';
      // Featured card: a TRY IT badge and the same invite line as the title's TRY DEV MODE button.
      const tryBadge = document.createElement('span');
      tryBadge.className = 'try-badge';
      const invite = document.createElement('span');
      invite.className = 'mode-invite';
      b.append(tryBadge, name, sub, invite);
      bindTap(b, () => this.pickMode(MISSION_MODE));
      const dev = document.createElement('button');
      dev.type = 'button';
      dev.id = 'devboard-btn';
      dev.className = 'hand-btn mode-pick devboard-btn';
      dev.draggable = false;
      const badge = document.createElement('span');
      badge.className = 'dev-badge';
      const devName = document.createElement('span');
      devName.className = 'mode-name';
      dev.append(badge, devName);
      bindTap(dev, () => {
        if (!this.modesGhostTap()) this.openDevBoard();
      });
      const syncMissionText = (): void => {
        sub.textContent = tr('mis_sub');
        tryBadge.textContent = tr('dm_tryit');
        invite.textContent = tr('dm_tag');
        b.setAttribute('aria-label', `${tr('dm_tryit')}: ${tr('mis_aria')}`);
        badge.textContent = tr('dev_badge');
        devName.textContent = tr('dev_btn');
        dev.setAttribute('aria-label', tr('dev_btn_aria'));
        if (this.devOpen) this.renderDevRows();
      };
      syncMissionText();
      onLang(syncMissionText);
      row.append(b, dev);
      list.prepend(row);
    }
    // TRY DEV MODE (title screen): the featured call to action. The big button starts an
    // ON A MISSION run right away (same as its MODES entry); the small DEV BOARD button opens
    // MODES with the DEV BOARD on top. Game-over: a small 'Try DEV MODE next?' nudge.
    {
      const big = document.getElementById('devmode-big');
      const link = document.getElementById('devboard-link');
      const nudge = document.getElementById('mission-nudge');
      // Enter / Space on these buttons activates them instead of reaching the start / ride-again keys.
      for (const el of [document.getElementById('devmode'), nudge])
        for (const ev of ['keydown', 'keyup']) el?.addEventListener(ev, (e) => e.stopPropagation());
      const syncDevMode = (): void => {
        const set = (sel: string, k: Parameters<typeof tr>[0]): void => {
          const el = big?.querySelector(sel);
          if (el) el.textContent = tr(k);
        };
        set('.dm-try', 'dm_try');
        set('.dm-tag', 'dm_tag');
        const mode = big?.querySelector('.dm-mode');
        if (mode) mode.textContent = MISSION_MODE.name;
        big?.setAttribute('aria-label', tr('dm_aria'));
        const badge = link?.querySelector('.dev-badge');
        if (badge) badge.textContent = tr('dev_badge');
        const ln = link?.querySelector('.dm-board-name');
        if (ln) ln.textContent = tr('dev_btn');
        link?.setAttribute('aria-label', tr('dm_board_aria'));
        if (nudge) {
          nudge.textContent = tr('dm_nudge');
          nudge.setAttribute('aria-label', tr('dm_aria'));
        }
      };
      // Long translations (e.g. PRUEBA EL MODO DEV) shrink to fit the button on one line.
      const fitTry = (): void => {
        const el = big?.querySelector<HTMLElement>('.dm-try');
        if (!el || !el.clientWidth) return;
        el.style.fontSize = '';
        let fs = parseFloat(getComputedStyle(el).fontSize) || 14;
        while (el.scrollWidth > el.clientWidth + 1 && fs > 8) {
          fs -= 0.5;
          el.style.fontSize = `${fs}px`;
        }
      };
      if (big && 'ResizeObserver' in window) new ResizeObserver(() => fitTry()).observe(big);
      syncDevMode();
      fitTry();
      // Refit once the webfont (Orbitron, wider than the fallback) has loaded.
      void document.fonts?.ready.then(() => fitTry());
      document.fonts?.addEventListener?.('loadingdone', () => fitTry());
      onLang(() => {
        syncDevMode();
        fitTry();
      });
      this.syncChips();
      onLang(() => this.syncChips());
      document.querySelectorAll<HTMLElement>('.ver-label').forEach((el) => {
        el.textContent = `v${APP_VERSION}`;
      });
      bindTap(big, () => this.tryDevMode());
      bindTap(nudge, () => this.tryDevMode());
      bindTap(link, () => {
        void this.audio.unlock();
        this.openModes();
        if (this.modesOpen) this.openDevBoard();
      });
    }
    const modesTitle = document.getElementById('modes-title');
    if (modesTitle) {
      // A plain text title (not a button): pointerup is reliable on iOS where click on a <p> isn't.
      modesTitle.addEventListener('pointerdown', (e) => e.stopPropagation());
      // A click listener also marks the title as a tap target, so Android Chrome's touch
      // adjustment doesn't retarget a title tap onto the mode button just below it.
      modesTitle.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
      modesTitle.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        if (e.button !== undefined && e.button !== 0) return;
        this.tapModesTitle();
      });
    }
    bindTap(document.getElementById('dev-back'), () => this.closeDevBoard());
    // LANGUAGE row (top of MODES): English / Español / Tiếng Việt / 简体中文, remembered on this device.
    document.querySelectorAll<HTMLElement>('#lang-row .lang-opt').forEach((b) => {
      bindTap(b, () => {
        if (this.modesGhostTap()) return;
        const id = b.dataset.lang as Lang;
        if (LANGS.some((l) => l.id === id)) setLang(id);
        this.audio.playUi();
      });
    });
    onLang(() => {
      applyDomStrings();
      loadLangFonts();
      syncHandBtn(loadHandPreference());
      this.syncDifficultyUi();
      this.setBodyFlags();
    });
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
    // LEVEL SELECT: the LEVELS tab on the difficulty control (or its label, L, or typing a number).
    this.levelSelect = createLevelSelect({
      touch: this.touchPrimary,
      start: (n, fight) => this.startPicked(n, fight),
      onToggle: (open) => {
        document.body.classList.toggle('lvl-open', open);
        this.input.clearTouch();
        this.input.clearJustPressed();
      },
      sfx: () => this.audio.playUi(),
    });
    bindTap(document.getElementById('lvl-open'), () => this.openLevelSelect());
    bindTap(document.getElementById('diff-label'), () => this.openLevelSelect());
    // GAME SPEED (pause menu): slider + -/+ (0.1 per press), 1.0-11.1.
    {
      const range = document.getElementById('speed-range') as HTMLInputElement | null;
      if (range) {
        range.min = String(SPEED_MIN);
        range.max = String(SPEED_MAX);
        range.step = '1';
        range.value = String(this.speedTenths);
        range.addEventListener('input', () => this.setSpeed(Number(range.value)));
      }
      const panel = document.getElementById('speed-ctl');
      for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'] as const) {
        panel?.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
      }
      bindTap(document.getElementById('speed-minus'), () => this.setSpeed(this.speedTenths - 1));
      bindTap(document.getElementById('speed-plus'), () => this.setSpeed(this.speedTenths + 1));
      const syncSpeedStrings = (): void => {
        const title = document.getElementById('speed-title');
        if (title) title.textContent = tr('speed_title');
        document.getElementById('speed-minus')?.setAttribute('aria-label', tr('speed_slower'));
        document.getElementById('speed-plus')?.setAttribute('aria-label', tr('speed_faster'));
        range?.setAttribute('aria-label', tr('speed_aria'));
        this.speedPanelKey = '';
        this.syncSpeedUi();
      };
      syncSpeedStrings();
      onLang(syncSpeedStrings);
    }
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
    // ON A MISSION runs stay ON A MISSION (no CHANGE MODE: the run's score belongs to the DEV BOARD).
    if (overRun && this.missionRun) return;
    const row = document.getElementById('mission-row');
    if (row) row.hidden = !this.missionUnlocked;
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
    this.closeDevBoard();
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

  /** Esc on the MODES menu: closes the DEV BOARD first if it's up, else the menu. */
  private escapeModes(): void {
    if (this.devOpen) this.closeDevBoard();
    else this.closeModes();
  }

  /**
   * Taps on the MODES title. ON A MISSION used to unlock after 5 quick taps here; it is now a
   * regular mode for every player, so a title tap does nothing (the handler stays harmless).
   */
  private tapModesTitle(): void {
    /* no-op */
  }

  /** DEV BOARD (over the MODES menu): ON A MISSION's own top 11. */
  private devStatus: 'ok' | 'loading' | 'local' = 'loading';
  private devRows: LeaderboardEntry[] = [];
  private openDevBoard(): void {
    if (!this.modesOpen || !this.missionUnlocked || this.devOpen) return;
    this.devOpen = true;
    const el = document.getElementById('dev-board');
    el?.classList.add('open');
    el?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('dev-open');
    this.audio.playUi();
    this.devRows = this.devBoard ?? [];
    this.devStatus = this.devBoard ? 'ok' : 'loading';
    this.renderDevRows();
    const seq = ++this.devSeq;
    void fetchDevBoard().then((b) => {
      if (seq !== this.devSeq || !this.devOpen) return;
      if (b) {
        this.devBoard = b;
        this.devRows = b;
        this.devStatus = 'ok';
      } else {
        this.devRows = loadMissionBoard();
        this.devStatus = 'local';
      }
      this.renderDevRows();
    });
  }

  private closeDevBoard(): void {
    if (!this.devOpen) return;
    this.devOpen = false;
    this.devSeq++;
    const el = document.getElementById('dev-board');
    el?.classList.remove('open');
    el?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('dev-open');
    this.input.clearTouch();
    this.input.clearJustPressed();
  }

  private renderDevRows(): void {
    const ol = document.getElementById('dev-rows');
    const st = document.getElementById('dev-status');
    if (!ol || !st) return;
    ol.textContent = '';
    this.devRows.forEach((e, i) => {
      const li = document.createElement('li');
      const cells: [string, string][] = [
        ['dev-rank', String(i + 1)],
        ['dev-ini', maskInitials(e.initials)],
        ['dev-score', fmtNum(e.score)],
        ['dev-lvl', e.difficulty ? `${tr('lb_lvl')} ${e.start && e.start !== e.difficulty ? `${e.start}→${e.difficulty}` : e.difficulty}` : ''],
      ];
      for (const [c, v] of cells) {
        const sp = document.createElement('span');
        sp.className = c;
        sp.textContent = v;
        li.appendChild(sp);
      }
      ol.appendChild(li);
    });
    const empty = this.devRows.length === 0;
    st.textContent =
      this.devStatus === 'loading'
        ? tr('dev_loading')
        : this.devStatus === 'local'
          ? empty
            ? `${tr('dev_local')} · ${tr('dev_empty')}`
            : tr('dev_local')
          : empty
            ? tr('dev_empty')
            : '';
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
    if (ships) ships.textContent = tr('mode_dogs', { n: m.ships });
    b.setAttribute('aria-label', tr('mode_aria', { m: m.name, n: m.ships }));
    if (flourish) {
      b.classList.remove('egg');
      void b.offsetWidth; // restart the CSS animation
      b.classList.add('egg');
      window.setTimeout(() => b.classList.remove('egg'), 1100);
    }
  }

  /**
   * Title / MODES chips: the mini-boss countdown toward v2.2 (counted from MINI_LIVE_MAX, so it
   * updates with each batch) and the live #1 from the shared board (masked like the board;
   * hidden when the board is unavailable). Never hardcoded.
   */
  private syncChips(): void {
    const n = miniLiveCount();
    const txt = n >= MINI_TOTAL ? tr('mb_all', { t: MINI_TOTAL }) : tr('mb_count', { n, t: MINI_TOTAL });
    const board = this.remoteBoard;
    const top = board && board.length ? board.reduce((a, e) => (e.score > a.score ? e : a), board[0]) : null;
    const wr = top && top.score > 0 ? tr('wr_line', { i: maskInitials(top.initials), s: fmtNum(top.score) }) : '';
    document.querySelectorAll<HTMLElement>('.chips').forEach((c) => {
      const t = c.querySelector('.mb-chip .chip-text');
      if (t) t.textContent = txt;
      const bar = c.querySelector<HTMLElement>('.mb-chip .chip-bar i');
      if (bar) bar.style.width = `${Math.round((100 * n) / MINI_TOTAL)}%`;
      const w = c.querySelector<HTMLElement>('.wr-chip');
      if (w) {
        w.textContent = wr;
        w.hidden = !wr;
      }
    });
  }

  /** TRY DEV MODE (title button / game-over nudge): start an ON A MISSION run, as its MODES entry does. */
  private tryDevMode(): void {
    if (this.state !== 'title' && this.state !== 'gameover') return;
    if (this.ticketPending || this.cloneOpen || this.congratsOpen || this.modesOpen || !this.missionUnlocked) return;
    void this.audio.unlock();
    this.startRun(Math.min(this.difficulty, MAX_PUBLIC_DIFFICULTY), null, false, MISSION_MODE);
  }

  /** Start a fan-mode run at the selected level (11 is never a starting level for modes). */
  private pickMode(m: ModeDef): void {
    if (!this.modesOpen || this.modesGhostTap() || this.devOpen) return;
    // CHANGE MODE never switches into or out of ON A MISSION (its score is DEV BOARD only).
    if (this.quitOpen && (isMission(m) || this.missionRun)) return;
    this.closeModes();
    void this.audio.unlock();
    if (this.quitOpen) {
      // CHANGE MODE mid-run: swap the mode in place. Score, level, level timer, shade and any
      // boss fight carry on; the pack keeps its health fraction in the new mode's dogs.
      this.closeQuitConfirm();
      this.switchMode(m, true);
      this.bannerText = tr('banner_mode', { m: m.name });
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
    if (this.missionRun) {
      // Back to the normal title: the Border Collie and the normal best.
      this.missionRun = false;
      this.car.reset();
      this.player.breed = PLAYER_BREED;
      this.player.scale = breedScale(PLAYER_BREED);
      this.player.w = 52 * this.player.scale;
      this.player.h = 28 * this.player.scale;
      this.high = loadHighScore();
    }
    this.boss = null;
    this.bossDone = false;
    this.world.spawnObstacles = true;
    this.level = 0;
    this.ships = 1;
    this.formation = this.cloneFormation;
    this.formation.clear();
    this.world.reset();
    this.barks.length = 0;
    this.barkT = 0;
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
    ctl?.setAttribute('aria-label', tr('diff_aria', { d, m: pointMultiplier(d).toFixed(1) }));
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
      this.syncSpeedPanel();
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
    const rv = this.missionRun ? this.missionReserves(r) : r;
    this.player.x = clamp(this.player.x, r.left, this.viewW * 0.55);
    this.player.y = clamp(this.player.y, rv.top, this.viewH - rv.bottom);
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
    if (t?.closest?.('#mute-btn, #pause-btn, #quit-btn, #quit-confirm, #hand-btn, #menu-btns, #modes-big, #devmode, #mission-nudge, #tut-skip, #clone-btn, #demo, #diff-ctl, #donate, #speed-ctl, #legal-links, #grownup, #lvl-select')) return;
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
    if (this.state === 'title' || this.state === 'gameover') {
      if (!this.restartLocked()) this.beginRun();
    } else if (this.state === 'paused') this.togglePause();
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
    document.body.classList.toggle('mission-run', this.missionRun && (this.state === 'playing' || this.state === 'paused'));
    // The game-over 'Try DEV MODE next?' nudge is for normal runs only.
    document.body.classList.toggle('mission-over', this.state === 'gameover' && this.pendingMission);
    // The desert-search card belongs to one game-over screen only.
    if (this.state !== 'gameover') this.desert?.hide();
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
      pauseBtn.setAttribute('aria-label', this.state === 'paused' ? tr('aria_resume') : tr('aria_pause'));
    }
    const boost = document.querySelector<HTMLButtonElement>('[data-action="boost"]');
    if (boost) {
      if (this.state === 'title') {
        boost.textContent = tr('btn_start');
        boost.setAttribute('aria-label', tr('aria_start'));
      } else if (this.state === 'initials') {
        boost.textContent = tr('btn_ok');
        boost.setAttribute('aria-label', tr('aria_ok'));
      } else if (this.state === 'gameover') {
        boost.textContent = tr('btn_ride');
        boost.setAttribute('aria-label', tr('aria_ride'));
      } else {
        boost.textContent = tr('btn_boost');
        boost.setAttribute('aria-label', tr('aria_boost'));
      }
    }
    const hint = document.getElementById('touch-hint');
    if (hint) {
      const hand = loadHandPreference() === 'left' ? tr('hand_left') : tr('hand_right');
      if (this.state === 'title') hint.textContent = tr('hint_title', { hand });
      else if (this.state === 'initials') hint.textContent = tr('hint_initials');
      else if (this.state === 'gameover') hint.textContent = tr('hint_gameover');
      else hint.textContent = tr('hint_play');
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

  /** SPEED_ON_PUBLIC_BOARD = false only (pre-migration rule): above 1.0 a public-board run stays on this device. */
  private speedKeepsLocal(): boolean {
    return !SPEED_ON_PUBLIC_BOARD && this.speedTenths !== SPEED_DEFAULT;
  }

  /** A run that ever ran above 1.0 is kept off the public board (ON A MISSION: DEV BOARD as ever). */
  private applySpeedBoardRule(): void {
    if (!this.missionRun && !SPEED_ON_PUBLIC_BOARD && this.runSpeedMax !== SPEED_DEFAULT) this.runLocalOnly = true;
  }

  /** GAME SPEED change (pause menu slider / - + / keys). Clamped to 1.0-11.1, saved on this device. */
  private setSpeed(tenths: number): void {
    const t = clampSpeed(tenths);
    if (t !== this.speedTenths) {
      this.speedTenths = t;
      saveSpeed(t);
      this.audio.playUi();
    }
    if (this.state === 'playing' || this.state === 'paused') {
      this.runSpeedMax = Math.max(this.runSpeedMax, t);
      this.applySpeedBoardRule();
    }
    this.pauseDrawn = false;
    this.syncSpeedUi();
  }

  /** Readout, slider and -/+ state for the current speed and language. */
  private syncSpeedUi(): void {
    const t = this.speedTenths;
    const s = fmtSpeed(t);
    const range = document.getElementById('speed-range') as HTMLInputElement | null;
    if (range && range.value !== String(t)) range.value = String(t);
    range?.setAttribute('aria-valuetext', tr('speed_readout', { s }));
    range?.style.setProperty('--fill', `${((t - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100}%`);
    const out = document.getElementById('speed-readout');
    if (out) out.textContent = tr('speed_readout', { s });
    const minus = document.getElementById('speed-minus') as HTMLButtonElement | null;
    const plus = document.getElementById('speed-plus') as HTMLButtonElement | null;
    if (minus) minus.disabled = t <= SPEED_MIN;
    if (plus) plus.disabled = t >= SPEED_MAX;
    document.getElementById('speed-ctl')?.classList.toggle('fast', t !== SPEED_DEFAULT);
  }

  /** The GAME SPEED panel shows on the pause (stall door) screen only, placed under the door. */
  private syncSpeedPanel(): void {
    const open = this.state === 'paused' && !this.quitOpen && !this.modesOpen && this.tutStep < 0;
    if (open !== this.speedPanelOpen) {
      this.speedPanelOpen = open;
      document.body.classList.toggle('speed-open', open);
      const el = document.getElementById('speed-ctl');
      el?.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) this.syncSpeedUi();
      this.speedPanelKey = '';
    }
    if (open) this.placeSpeedPanel();
  }

  private placeSpeedPanel(): void {
    const el = document.getElementById('speed-ctl');
    const app = document.getElementById('app');
    if (!el || !app) return;
    const cr = this.canvas.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    const key = `${cr.left},${cr.top},${cr.width},${cr.height},${this.viewW},${this.viewH},${lang()},${this.speedTenths},${this.runSpeedMax}`;
    if (key === this.speedPanelKey) return;
    this.speedPanelKey = key;
    const k = cr.width / this.viewW;
    const door = this.renderer.pauseDoorRect();
    const gap = 10;
    const centre = ar.left + ar.width / 2;
    const controls = this.touchPrimary
      ? this.touchControlRects().map((r) => ({ left: cr.left + r.x * k, right: cr.left + (r.x + r.w) * k, top: cr.top + r.y * k, bottom: cr.top + (r.y + r.h) * k }))
      : [];
    // Lay the panel out at a width (centred): under the door when it fits, otherwise over the
    // door's lower half (a sign stuck on it), never lower than the stick / BOOST it would cover.
    const fit = (half: number): { top: number; ph: number } => {
      el.style.width = `${Math.floor(half * 2)}px`;
      this.fitSpeedReadout();
      const ph = el.offsetHeight;
      let floor = cr.top + cr.height - 10;
      for (const c of controls) if (c.right > centre - half && c.left < centre + half) floor = Math.min(floor, c.top - gap);
      const below = cr.top + (door.y + door.h) * k + gap;
      const top = below + ph <= floor ? below : Math.max(cr.top + (door.y + door.h * 0.5) * k, floor - ph);
      return { top, ph };
    };
    let half = Math.min(170, (ar.width - 24) / 2);
    let at = fit(half);
    // A stick / BOOST zone beside the panel's band (landscape phones): narrow it to fit between.
    let narrow = half;
    for (const c of controls) {
      if (c.bottom <= at.top || c.top >= at.top + at.ph) continue;
      if (c.right <= centre) narrow = Math.min(narrow, centre - c.right - gap);
      else if (c.left >= centre) narrow = Math.min(narrow, c.left - centre - gap);
    }
    narrow = Math.max(130, narrow);
    if (narrow < half) {
      half = narrow;
      at = fit(half);
    }
    el.style.top = `${Math.round(at.top - ar.top)}px`;
    this.speedPanelTopView = (at.top - cr.top) / k;
    this.pauseDrawn = false;
  }

  /** Shrink the readout's font a little if a long translation would overflow the panel. */
  private fitSpeedReadout(): void {
    const out = document.getElementById('speed-readout');
    if (!out) return;
    out.style.fontSize = '';
    let size = parseFloat(getComputedStyle(out).fontSize) || 13;
    while (out.scrollWidth > out.clientWidth + 1 && size > 9) {
      size -= 0.5;
      out.style.fontSize = `${size}px`;
    }
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
    if (this.difficulty === SECRET_DIFFICULTY && this.speedKeepsLocal()) {
      // (SPEED_ON_PUBLIC_BOARD = false only) a speed run stays on this device: no ticket request at all.
      this.startRun(SECRET_DIFFICULTY, null, true);
      return;
    }
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
    if (!remoteEnabled || this.speedKeepsLocal()) {
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

  /**
   * at = the level the run starts on (LEVEL SELECT; defaults to difficulty). 12-111 start in the
   * gold zone like a difficulty-11 run (ticket, scoring) on level at, with a random mode exactly
   * as a climb arrives there. fight = begin right at that level's boss / mini-boss.
   */
  private startRun(
    difficulty: number,
    ticket: Promise<string | 'denied' | null> | null,
    localOnly = false,
    mode: ModeDef | null = null,
    at = difficulty,
    fight = false,
  ): void {
    this.awaitingTopAfterSubmit = false;
    // ON A MISSION: DEV BOARD only (never a public submit / ticket); its own best on the HUD.
    this.missionRun = isMission(mode);
    this.pendingMission = false;
    this.high = this.missionRun ? loadMissionHigh() : loadHighScore();
    if (this.missionRun) {
      ticket = null;
      localOnly = true;
      this.car.reset();
      void this.refreshDevBoard();
    }
    this.runLocalOnly = localOnly;
    this.runSpeedMax = this.speedTenths;
    this.applySpeedBoardRule();
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
    this.runDifficulty = at;
    trackRunStart(mode ? mode.name : null, difficulty);
    this.victory = false;
    this.runStartLevel = at;
    // A boss-fight start only where that level has a live boss / mini-boss.
    this.runFight = fight && !mode && !!(bossForLevel(at) ?? miniBossForLevel(at));
    this.audio.stopSadTrombone();
    stopSpeech();
    this.toastT = 0;
    this.spinT = 0;
    this.shieldT = 0;
    this.catT = 0;
    this.catShown = false;
    this.photoT = 0;
    this.prizeT = 0;
    this.bossesFought = [];
    this.runSeed = this.forcedSeed ?? newSeed();
    this.forcedSeed = null;
    this.runRng = mulberry32(this.runSeed);
    this.catRng = mulberry32(subSeed(this.runSeed, 999));
    // Cat gag: once per run, a few seconds into a level 100-111 stage (levelTime).
    this.nextCatAt = catStageDelay(this.catRng);
    this.world.powerRand = mulberry32(subSeed(this.runSeed, 77));
    this.world.spawnPowers = true;
    console.info(`[fsb] run seed ${this.runSeed}`);
    this.boss = null;
    this.bossDone = false;
    this.bossesBeaten = 0;
    this.minisBeaten = 0;
    this.hazardsPopped = 0;
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
      if (at > FIRST_CLONE_LEVEL) {
        // Arriving on 12-111 (as a climb does): a random mode with a fresh pack of its dogs.
        const m = this.randomMode();
        this.switchMode(m, false);
        this.bannerText = tr('banner_level', { n: at, m: m.name });
        this.bannerT = BANNER_SECONDS;
      }
    }
    // FIGHT THE BOSS: the level clock starts just short of its end, so the usual entry brings the
    // boss / mini-boss in after a breath (same fight, rules, rewards and scoring).
    if (this.runFight) this.levelTime = LEVEL_SECONDS - FIGHT_LEAD_S;
    this.world.reset();
    this.barks.length = 0;
    this.barkT = 0;
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
      this.syncChips();
      return board;
    });
    this.remoteFetch = p;
    void p.finally(() => {
      if (this.remoteFetch === p) this.remoteFetch = null;
    });
    return p;
  }

  /** Fetch the DEV BOARD in the background (ON A MISSION runs). Resolves null on failure. */
  private refreshDevBoard(): Promise<LeaderboardEntry[] | null> {
    return fetchDevBoard().then((b) => {
      if (b) this.devBoard = b;
      return b;
    });
  }

  private enterInitials(): void {
    // Only the current game language's characters (en / es / vi start on A, zh on its first character).
    const c0 = firstChar(lang());
    this.initialsChars = [c0, c0, c0];
    this.initialsSlot = 0;
    this.initialsCooldown = 0.25;
    this.initialsWarn = 0;
    this.initialsHold = 0;
    this.highlightIndex = -1;
    this.state = 'initials';
    this.setBodyFlags();
    this.input.clearJustPressed();
  }

  private endRun(): void {
    this.input.clearTouch();
    this.boardTauntPick = Math.floor(Math.random() * 1e6);
    this.audio.playGameOver();
    // The shared board's cap (SCORE_CAP, one constant; the SQL has the same single value).
    this.pendingScore = Math.min(SCORE_CAP, Math.floor(this.score));
    this.pendingRunMs = Math.round(this.runTime * 1000);
    this.pendingDifficulty = this.runDifficulty;
    this.pendingMode = this.mode ? this.mode.id : null;
    this.pendingModes = Math.max(1, this.modesUsed.size);
    this.pendingStart = this.runStartLevel;
    this.pendingFight = this.runFight;
    this.pendingSpeed = this.runSpeedMax;
    stopSpeech();
    this.announce(tr('sr_end', { v: this.victory ? tr('sr_victory') : tr('sr_gameover'), s: fmtNum(this.pendingScore), d: this.pendingDifficulty }));
    if (!this.victory) {
      // Sad trombone, looping until any button, key or tap (respects mute).
      this.tromboneAt = performance.now();
      this.audio.startSadTrombone();
    }
    this.boss = null;
    this.pendingMission = this.missionRun;
    if (this.pendingMission) {
      this.endMissionRun();
      return;
    }
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
      // The freshly fetched public board confirms the run missed the TOP 11: comb the desert.
      // (No board = no taunt: an offline / failed read never shows one.)
      else if (!qualifiesForBoard(this.pendingScore, board)) this.missedBoard();
    }).then(() => this.checkTop());
  }

  /**
   * ON A MISSION game over: only the mission best and the DEV BOARD (or this device's mission
   * board) are touched. The public board, the normal TOP 11 and the normal best never see it.
   */
  private endMissionRun(): void {
    const best = loadMissionHigh();
    this.newBest = this.pendingScore > best;
    saveMissionHigh(this.pendingScore);
    this.high = loadMissionHigh();
    const localBoard = loadMissionBoard();
    this.boardIsRemote = this.devBoard !== null;
    this.leaderboard = this.devBoard ? [...this.devBoard] : localBoard;
    this.highlightIndex = -1;
    if (qualifiesForBoard(this.pendingScore, this.leaderboard)) this.enterInitials();
    else {
      this.state = 'gameover';
      this.setBodyFlags();
    }
    const id = this.runId;
    const hadRemote = this.boardIsRemote;
    void this.refreshDevBoard().then((board) => {
      if (!board || id !== this.runId || this.state !== 'gameover' || this.highlightIndex !== -1) return;
      this.leaderboard = [...board];
      this.boardIsRemote = true;
      if (!hadRemote && qualifiesForBoard(this.pendingScore, board)) this.enterInitials();
      else if (!qualifiesForBoard(this.pendingScore, board)) this.missedBoard();
    });
  }

  /**
   * A finished run missed the board it was played for: show the desert-search taunt.
   * Public-board runs only by default; ON A MISSION (DEV BOARD) runs only if DESERT_SEARCH_ON_MISSION.
   */
  private missedBoard(): void {
    if (this.state !== 'gameover' || this.highlightIndex !== -1) return;
    if (this.pendingMission ? !DESERT_SEARCH_ON_MISSION : this.runLocalOnly || !this.boardIsRemote) return;
    this.desert?.show();
  }

  /** ON A MISSION initials: this device's mission board + the DEV BOARD (fsb_dev_submit). */
  private confirmMissionInitials(initials: string): void {
    const score = this.pendingScore;
    const runMs = this.pendingRunMs;
    const level = this.pendingDifficulty;
    const start = this.pendingStart;
    const id = this.runId;
    const local = addMissionEntry(score, initials, level, start);
    if (this.devBoard) {
      const optimistic = insertEntry(score, initials, this.devBoard, level, start);
      this.leaderboard = optimistic.board;
      this.highlightIndex = optimistic.index;
      this.boardIsRemote = true;
    } else {
      this.leaderboard = local.board;
      this.highlightIndex = local.index;
      this.boardIsRemote = false;
    }
    this.high = loadMissionHigh();
    this.audio.playUi();
    this.state = 'gameover';
    this.lockRestart();
    this.setBodyFlags();
    this.input.clearTouch();
    this.input.clearJustPressed();
    void submitDevScore(initials, score, runMs, level, start, undefined, this.pendingSpeed).then((res) => {
      if (res) this.devBoard = res.board;
      if (id !== this.runId || this.state !== 'gameover') return;
      if (res) {
        this.leaderboard = res.board;
        this.highlightIndex = res.index;
        this.boardIsRemote = true;
      } else {
        this.leaderboard = local.board;
        this.highlightIndex = local.index;
        this.boardIsRemote = false;
      }
    });
  }

  /** RESTART_LOCK_MS after an initials submit, game-over restart input is ignored (the board stays up). */
  private lockRestart(): void {
    this.restartLockUntil = performance.now() + RESTART_LOCK_MS;
  }

  private restartLocked(): boolean {
    return this.state === 'gameover' && performance.now() < this.restartLockUntil;
  }

  private confirmInitials(): void {
    if (this.state !== 'initials') return;
    // G-rated board: rude combos (en / es / vi / zh) get a friendly nudge instead of a submit.
    if (isRude(this.initialsChars.join(''))) {
      this.initialsWarn = 3;
      this.audio.playUi();
      return;
    }
    if (this.pendingMission) {
      this.confirmMissionInitials(this.initialsChars.join(''));
      return;
    }
    const initials = this.initialsChars.join('');
    const score = this.pendingScore;
    const runMs = this.pendingRunMs;
    const difficulty = this.pendingDifficulty;
    const ticketReq = difficulty >= SECRET_DIFFICULTY ? this.runTicket : null;
    const endMode = this.pendingMode;
    const modeCount = this.pendingModes;
    const startLevel = this.pendingStart;
    const speed = this.pendingSpeed;
    const fight = this.pendingFight;
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
    this.lockRestart();
    this.setBodyFlags();
    this.input.clearTouch();
    this.input.clearJustPressed();

    if (!remoteEnabled || this.runLocalOnly) return;
    void (ticketReq ?? Promise.resolve(null))
      .then((t) => submitRemoteScore(initials, score, runMs, difficulty, t && t !== 'denied' ? t : null, undefined, endMode, modeCount, startLevel, speed, fight))
      .then((res) => {
      if (res?.claimToken) addClaimToken(res.claimToken);
      if (res) {
        this.remoteBoard = res.board;
        this.syncChips();
      }
      if (id !== this.runId || this.state !== 'gameover') return;
      if (res) {
        this.leaderboard = res.board;
        this.highlightIndex = res.index;
        this.boardIsRemote = true;
        // Accepted, but bumped out of the TOP 11 while typing initials: that's a miss too.
        if (res.index === -1) this.missedBoard();
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
    this.initialsWarn = Math.max(0, this.initialsWarn - dt);

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
      this.initialsChars[this.initialsSlot] = nextChar(this.initialsChars[this.initialsSlot], 1, lang());
      moved = true;
    } else if (this.input.consume('arrowdown') || this.input.consume('s')) {
      this.initialsChars[this.initialsSlot] = nextChar(this.initialsChars[this.initialsSlot], -1, lang());
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
        this.initialsChars[this.initialsSlot] = nextChar(this.initialsChars[this.initialsSlot], 1, lang());
        this.initialsCooldown = Math.max(0.05, 0.18 * Math.pow(0.88, this.initialsHold++));
        moved = true;
      } else if (axis.y >= thresh) {
        this.initialsChars[this.initialsSlot] = nextChar(this.initialsChars[this.initialsSlot], -1, lang());
        this.initialsCooldown = Math.max(0.05, 0.18 * Math.pow(0.88, this.initialsHold++));
        moved = true;
      }
    }

    if (Math.abs(axis.y) < thresh) this.initialsHold = 0;
    if (moved) {
      this.audio.playUi();
      this.initialsWarn = Math.min(this.initialsWarn, 0.8);
    }
    this.input.clearJustPressed();
  }

  /** Open LEVEL SELECT (title / game-over, nothing else up); firstDigit pre-types the number box. */
  private openLevelSelect(firstDigit?: string): void {
    if (this.state !== 'title' && this.state !== 'gameover') return;
    if (this.ticketPending || this.cloneOpen || this.congratsOpen || this.modesOpen) return;
    void this.audio.unlock();
    this.audio.playUi();
    this.levelSelect.open(firstDigit);
  }

  /** Title / game-over: L or a digit opens LEVEL SELECT (a digit starts typing the level). */
  private handleLevelKeys(): boolean {
    let digit: string | undefined;
    for (const d of '0123456789') if (this.input.consume(d)) digit = d;
    if (digit === undefined && !this.input.consume('l')) return false;
    this.input.clearJustPressed();
    this.openLevelSelect(digit === '0' ? undefined : digit);
    return true;
  }

  /**
   * LEVEL SELECT start: level n exactly as if the run had climbed there (its hazard / points
   * curve, gold zone, mode, boss). 1-10 = the difficulty stepper's start; 11-111 get a server run
   * ticket first, like the gold clone button (offline / refused: played on this device's board).
   * fight = start right at the level's boss / mini-boss encounter (the normal fight entry).
   */
  private startPicked(n: number, fight: boolean): void {
    if (this.state !== 'title' && this.state !== 'gameover') return;
    if (this.ticketPending || this.cloneOpen || this.congratsOpen) return;
    const at = clampLevel(n);
    void this.audio.unlock();
    if (at <= MAX_PUBLIC_DIFFICULTY) {
      this.difficulty = at;
      saveDifficulty(at);
      this.syncDifficultyUi();
      this.startRun(at, null, false, null, at, fight);
      return;
    }
    if (!remoteEnabled || this.speedKeepsLocal()) {
      this.startRun(SECRET_DIFFICULTY, null, true, null, at, fight);
      return;
    }
    this.ticketPending = true;
    const seq = ++this.startSeq;
    this.audio.playUi();
    void startRemoteRun(loadClaimTokens()).then((t) => {
      if (seq !== this.startSeq) return;
      this.ticketPending = false;
      if (this.state !== 'title' && this.state !== 'gameover') return;
      if (t && t !== 'denied') this.startRun(SECRET_DIFFICULTY, Promise.resolve(t), false, null, at, fight);
      else this.startRun(SECRET_DIFFICULTY, null, true, null, at, fight);
    });
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
    this.sweepPlayer();
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
        if (this.input.consume('escape')) this.escapeModes();
        this.input.clearJustPressed();
        return;
      }
      if (this.levelSelect.isOpen()) {
        this.input.clearJustPressed();
        return;
      }
      if (this.handleDifficultyKeys()) return;
      if (this.handleLevelKeys()) return;
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
        if (this.input.consume('escape')) this.escapeModes();
        this.input.clearJustPressed();
        return;
      }
      if (this.levelSelect.isOpen()) {
        this.input.clearJustPressed();
        return;
      }
      if (this.handleDifficultyKeys()) return;
      if (!this.restartLocked() && this.handleLevelKeys()) return;
      // consumeAny also swallows keys pressed during the post-submit lock (no queued restart).
      if (this.input.consumeAny() && !this.restartLocked()) this.beginRun();
      return;
    }

    if (this.quitOpen) {
      // QUIT RUN? confirm: Esc closes MODES back to it, else Esc / P keep playing.
      if (this.modesOpen) {
        if (this.input.consume('escape')) this.escapeModes();
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
      // GAME SPEED keys on the pause screen: [ / - slower, ] / = / + faster (0.1 each).
      if (this.speedPanelOpen) {
        if (this.input.consume('[') || this.input.consume('-') || this.input.consume('_')) this.setSpeed(this.speedTenths - 1);
        else if (this.input.consume(']') || this.input.consume('=') || this.input.consume('+')) this.setSpeed(this.speedTenths + 1);
      }
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
    if (
      catShouldFire(this.tutStep, !!this.boss, this.catShown, this.runDifficulty, this.levelTime, this.nextCatAt)
    ) {
      this.catT = 1.5 + this.catRng() * 1.5;
      this.catShown = true;
      console.info(`[fsb] cat on keyboard ${this.catT.toFixed(1)}s @ L${this.runDifficulty}`);
      this.input.clearJustPressed();
      return;
    }
    this.a11yT -= dt;
    if (this.a11yT <= 0) {
      this.a11yT = 3;
      this.announce(tr('sr_score', { s: fmtNum(this.score), d: this.runDifficulty }));
    }
    this.stepPlayFrame(dt);
  }

  /**
   * One frame of play at the GAME SPEED: speed x the frame's game time, split into substeps that
   * are never longer than a 1.0 frame (see utils/speed.ts). At 1.0 it is exactly one step of dt.
   * Menus, interstitials (promotion, continue, cat, photo) and the walkthrough stay real time.
   */
  private stepPlayFrame(dt: number): void {
    const t = this.speedTenths;
    if (t === SPEED_DEFAULT) {
      this.stepPlay(dt, dt);
      return;
    }
    const n = speedSubsteps(t);
    const sub = (dt * t) / 10 / n;
    const real = dt / n;
    for (let i = 0; i < n; i++) {
      this.stepPlay(sub, real);
      if (!this.playStepLive()) break;
    }
  }

  /** The run is still in plain play after a substep (no game over, level-clear card, pause ...). */
  private playStepLive(): boolean {
    return (
      this.state === 'playing' &&
      !this.quitOpen &&
      this.tutStep < 0 &&
      this.continueT <= 0 &&
      this.promoT <= 0 &&
      this.photoT <= 0 &&
      this.prizeT <= 0 &&
      this.catT <= 0
    );
  }

  /** One play substep: dt = game time, realDt = the wall-clock share (on-screen text timers). */
  private stepPlay(dt: number, realDt: number): void {
    this.runTime += dt;
    // Every level 1-111 is a 30 s stage: passing it promotes to the next level (score carries
    // over; gold levels 11+ also multiply the clone swarm). Exactly one level per pass.
    // Every tenth level (and 111) ends with a boss: the level timer holds at the end while
    // the boss is up, and the level clears once it is beaten (or gets bored and leaves).
    // Every other level ends with a MINI-BOSS, the level's gate: it never leaves, so the level
    // is only passed once it is beaten (miniBoss.ts).
    this.levelTime += dt;
    if (this.boss) {
      this.levelTime = Math.min(this.levelTime, LEVEL_SECONDS);
    } else if (this.levelTime >= LEVEL_SECONDS) {
      // ON A MISSION only: the run's first mini-boss is BRIDGE TROLLS (same slot, tuning and bonus).
      const firstMissionMini = this.missionRun && this.minisBeaten === 0;
      const def = this.bossDone
        ? null
        : bossForLevel(this.runDifficulty) ?? (firstMissionMini ? missionFirstMiniForLevel(this.runDifficulty) : miniBossForLevel(this.runDifficulty));
      if (def) {
        this.levelTime = LEVEL_SECONDS;
        this.startBoss(def);
      } else {
        this.levelTime -= LEVEL_SECONDS;
        if (this.clearStage()) return;
      }
    }
    this.bannerT = Math.max(0, this.bannerT - realDt);
    this.toastT = Math.max(0, this.toastT - dt);
    this.spinT = Math.max(0, this.spinT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);

    const boosting = this.input.boosting && this.charge > 0.05;
    // FIRE adds push through the player's ramp (Player.ts FIRE; no speed cap); fresh presses escalate it.
    const speedMul = 1;
    this.player.boostTaps += this.input.takeBoostPresses();
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
    // ON A MISSION: the (bigger) car stays fully under the HUD.
    const mr = this.missionRun ? this.missionReserves(pr) : pr;
    this.player.update(
      dt,
      this.input.axis,
      boosting,
      this.viewW,
      this.viewH,
      speedMul,
      mr.top + f.extUp,
      mr.bottom + f.extDown,
      pr.left + f.extLeft,
    );
    if (this.missionRun && this.touchPrimary) this.keepCarClearOfControls(dt);
    this.sweepPlayer();
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
    // FIRE pops hazards with the boss's own barks; in a boss fight the boss handles barks as tuned.
    if (!this.boss) this.updateBarks(dt, boosting, pts);
    else if (this.barks.length) this.barks.length = 0;
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
        right: this.bossRightLimit(),
        speed: this.speedTenths / SPEED_DEFAULT,
      });
      this.bossEvents();
    }
    this.particles.update(dt);
    if (this.missionRun) this.car.update(dt, this.scrollSpeed, this.viewH);
    this.renderer.update(dt, this.scrollSpeed);
    {
      const fs = this.floaters;
      let w = 0;
      for (let i = 0; i < fs.length; i++) {
        const f = fs[i];
        f.y -= 40 * realDt;
        f.life -= realDt;
        if (f.life > 0) fs[w++] = f;
        else this.floaterPool.push(f);
      }
      fs.length = w;
    }

    this.distance += this.scrollSpeed * dt * 0.35;
    // The stage ramp holds while a boss is up (a long fight must not run the scroll away).
    if (!this.boss) this.stageDist += this.scrollSpeed * dt * 0.35;
    this.score += scalePoints((this.scrollSpeed * dt * 0.12 + (boosting ? 12 * dt : 0)) * pts, this.speedTenths);
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

    // collect (swept: see sweepPlayer)
    for (const c of this.world.collectibles) {
      if (!c.alive) continue;
      if (this.sweptAny((b) => circleRect(c.x, c.y, c.r, b.x, b.y, b.w, b.h))) {
        c.alive = false;
        if (c.kind !== 'shade') {
          this.applyPower(c.kind, pts);
          continue;
        }
        this.charge = clamp(this.charge + 0.22, 0, 1);
        this.score += scalePoints(c.value * pts, this.speedTenths);
        if (this.score > SCORE_CAP) this.score = SCORE_CAP;
        this.audio.playCollect();
        this.particles.burst(c.x, c.y, '#00f0ff', this.touchPrimary ? 8 : 12, 160);
        this.spawnFloater(c.x, c.y, tr('fl_shade'), '#00f0ff');
      }
    }

    this.checkGates();

    // obstacles
    if (this.player.invuln <= 0) {
      for (const o of this.world.obstacles) {
        if (!o.alive) continue;
        if (this.sweptAny((b) => this.hitsObstacle(o, b))) {
          if (this.shieldT > 0) {
            this.pizzaAbsorb();
            break;
          }
          if (this.missionRun) {
            // ON A MISSION: a part flies off; the car is never destroyed (see missionHit).
            this.missionHit(hz.hitDamageMul, 0.85 * hz.hitGraceMul, MISSION_HIT_SHADE);
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

    // Boss: a shot (or its body) on the lead dog costs shade, not dogs (see bossHit).
    if (this.boss && this.player.invuln <= 0) {
      const bf = this.boss;
      let hit = this.sweptAny((b) => bf.bodyHits(b.x, b.y, b.w, b.h));
      for (const s of bf.shots) {
        if (BossFight.harmful(s) && this.sweptAny((b) => BossFight.shotHits(s, b.x, b.y, b.w, b.h))) {
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
    this.barks.length = 0;
    this.barkT = 0;
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
    this.barks.length = 0;
    this.barkT = 0;
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
    // FIRE works from the dodge step on (step 2 teaches it: hold FIRE to pop hazards).
    const boosting = (this.tutStep === 1 || this.tutStep === 3) && this.input.boosting && this.charge > 0.05;
    const hz = hazardLevers(MIN_DIFFICULTY);
    this.scrollSpeed = 240 * hz.speed + (boosting ? 90 : 0);
    const pr = this.touchReserves();
    this.player.boostTaps += this.input.takeBoostPresses();
    this.player.update(dt, this.input.axis, boosting, this.viewW, this.viewH, 1, pr.top, pr.bottom, pr.left);
    this.sweepPlayer();
    // A steady trickle of hazards so step 2 has something to dodge within a few seconds.
    this.world.update(dt, this.scrollSpeed, this.viewW, this.viewH, 0, pr.top, this.viewH - pr.bottom, 1.2, 1);
    this.updateBarks(dt, boosting, 0); // never scores in the walkthrough
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
        this.spawnFloater(c.x, c.y, tr('fl_shade'), '#00f0ff');
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
        return { title: tr('tut0_title'), lines: [touch ? tr('tut0_touch') : tr('tut0_keys')] };
      case 1:
        return {
          title: tr('tut1_title'),
          lines: [tr('tut1_a'), tr('tut1_c'), tr('tut1_b')],
        };
      case 2:
        return {
          title: tr('tut2_title'),
          lines: [tr('tut2_a'), tr('tut2_b')],
        };
      default:
        return {
          title: tr('tut3_title'),
          lines: [
            tr('tut3_a'),
            tr('tut3_b'),
            tr('tut3_c'),
            tr('tut3_d', { b: touch ? tr('tut3_boost_touch') : tr('tut3_boost_keys') }),
            touch ? tr('tut3_touch') : tr('tut3_keys'),
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
      this.showPromotion(tr('promo_done', { n: cleared }), tr('promo_promoted'), () => {
        this.runDifficulty = cleared + 1;
        this.freshStage();
      });
      return false;
    }
    if (cleared === MAX_PUBLIC_DIFFICULTY) {
      // Beat level 10: straight into the gold zone (level 11) for everyone.
      this.climbTicket =
        remoteEnabled && !this.runLocalOnly && !this.missionRun ? startRemoteRun(loadClaimTokens(), this.runTime * 1000 + 1000) : null;
    }
    const title = cleared === MAX_PUBLIC_DIFFICULTY ? tr('promo_beat10') : tr('promo_done', { n: cleared });
    this.showPromotion(title, tr('promo_promoted'), () => {
      const next = cleared + 1;
      this.runDifficulty = next;
      if (cleared === MAX_PUBLIC_DIFFICULTY) this.runTicket = this.climbTicket;
      this.freshStage();
      if (this.missionRun) {
        // ON A MISSION stays the car all the way to 111 (no random mode swap).
        this.bannerText = tr('banner_level', { n: next, m: MISSION_MODE.name });
        this.bannerT = BANNER_SECONDS;
        return;
      }
      // Every level change switches to a random mode (never the one just played; the Calvin
      // Triplets egg is not in the pool) with a fresh pack of its starting dogs.
      const m = this.randomMode();
      this.switchMode(m, false);
      this.bannerText = tr('banner_level', { n: next, m: m.name });
      this.bannerT = BANNER_SECONDS;
    });
    return false;
  }

  /** Opens the ask-a-grown-up card (set by bindGrownUp). */
  private askGrownUp: (kind: 'venmo' | 'talent' | 'time', onPass?: () => void) => void = () => {};

  /**
   * ASK A GROWN-UP: the card in front of TREASURE (Venmo), the TALENT form and the TIME form's
   * optional name / email. A random two-digit x one-digit sum (the answer is never shown); right
   * reveals Continue, wrong asks a new one. Cancel / Escape close it. Nothing is stored or sent.
   */
  private bindGrownUp(): void {
    const el = document.getElementById('grownup');
    const form = document.getElementById('gu-form') as HTMLFormElement | null;
    const input = document.getElementById('gu-answer') as HTMLInputElement | null;
    const q = document.getElementById('gu-q');
    const err = document.getElementById('gu-err');
    const passBox = document.getElementById('gu-pass');
    const venmo = document.getElementById('gu-venmo') as HTMLAnchorElement | null;
    const go = document.getElementById('gu-go') as HTMLButtonElement | null;
    if (!el || !form || !input || !q || !err || !passBox || !venmo || !go) return;
    const stop = (e: Event): void => e.stopPropagation();
    for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup', 'touchstart', 'touchend']) el.addEventListener(ev, stop);
    if (DONATE_URL) venmo.href = DONATE_URL;
    let kind: 'venmo' | 'talent' | 'time' = 'venmo';
    let onPass: (() => void) | undefined;
    let answer = -1;
    let a = 0;
    let b = 0;
    let opener: HTMLElement | null = null;
    const sync = (): void => {
      const set = (sel: string, k: Parameters<typeof tr>[0]): void => {
        el.querySelectorAll<HTMLElement>(sel).forEach((n) => {
          const v = tr(k);
          if (n.textContent !== v) n.textContent = v;
        });
      };
      set('#gu-title', 'gu_title');
      set('#gu-msg', kind === 'venmo' ? 'gu_venmo' : kind === 'talent' ? 'gu_talent' : 'gu_time');
      set('#gu-v4v', 'gu_v4v');
      const v4v = el.querySelector<HTMLElement>('#gu-v4v');
      if (v4v) v4v.hidden = kind !== 'venmo';
      set('.gu-cancel', 'gu_cancel');
      set('#gu-check', 'gu_check');
      set('#gu-ok', 'gu_ok');
      set('#gu-venmo', 'gu_go_venmo');
      set('#gu-go', 'gu_go');
      q.textContent = tr('gu_q', { a, b });
    };
    const ask = (): void => {
      a = 12 + Math.floor(Math.random() * 88); // 12-99
      b = 3 + Math.floor(Math.random() * 7); // 3-9
      answer = a * b;
      input.value = '';
      sync();
    };
    const focusables = (): HTMLElement[] =>
      [...el.querySelectorAll<HTMLElement>('input, button, a[href]')].filter((n) => n.offsetParent !== null && !n.hidden);
    const close = (): void => {
      if (!el.classList.contains('open')) return;
      el.classList.remove('open');
      el.setAttribute('aria-hidden', 'true');
      answer = -1;
      input.value = '';
      this.input.clearTouch();
      this.input.clearJustPressed();
      const back = opener;
      opener = null;
      if (back && back.isConnected && back.offsetParent !== null) back.focus();
    };
    this.askGrownUp = (k, cb) => {
      kind = k;
      onPass = cb;
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      el.dataset.kind = k;
      form.hidden = false;
      passBox.hidden = true;
      err.textContent = '';
      ask();
      el.classList.add('open');
      el.setAttribute('aria-hidden', 'false');
      this.input.clearTouch();
      window.setTimeout(() => input.focus(), 60);
    };
    onLang(() => sync());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!/^\d{1,4}$/.test(v)) {
        err.textContent = tr('gu_empty');
        input.focus();
        return;
      }
      if (answer > 0 && Number(v) === answer) {
        err.textContent = '';
        form.hidden = true;
        passBox.hidden = false;
        venmo.hidden = kind !== 'venmo';
        go.hidden = kind === 'venmo';
        (kind === 'venmo' ? venmo : go).focus();
      } else {
        ask();
        err.textContent = tr('gu_wrong');
        input.focus();
      }
    });
    el.querySelectorAll('.gu-cancel').forEach((n) => n.addEventListener('click', close));
    el.addEventListener('keydown', (e) => {
      const k = e as KeyboardEvent;
      if (k.key === 'Escape') {
        k.preventDefault();
        close();
      } else if (k.key === 'Tab') {
        // Keep keyboard focus inside the card.
        const f = focusables();
        if (f.length === 0) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (k.shiftKey && i <= 0) {
          k.preventDefault();
          f[f.length - 1].focus();
        } else if (!k.shiftKey && i === f.length - 1) {
          k.preventDefault();
          f[0].focus();
        }
      }
    });
    venmo.addEventListener('click', (e) => {
      if (kind !== 'venmo' || passBox.hidden || !DONATE_URL) {
        e.preventDefault();
        return;
      }
      this.openVenmo(e); // phones: app deep link, then the web profile; desktop: this link's new tab
      window.setTimeout(close, 0);
    });
    go.addEventListener('click', (e) => {
      e.preventDefault();
      if (kind === 'venmo' || passBox.hidden) return;
      const cb = onPass;
      opener = null;
      close();
      cb?.();
    });
  }

  /** VALUE FOR VALUE: TIME (suggestion) and TALENT (resume) panels; TREASURE goes through the grown-up card. */
  private bindV4V(): void {
    const modal = document.getElementById('v4v-modal');
    if (!modal) return;
    const stop = (e: Event): void => e.stopPropagation();
    for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup', 'touchstart', 'touchend']) modal.addEventListener(ev, stop);
    const title = document.getElementById('v4v-modal-title');
    const errs = (): NodeListOf<HTMLElement> => modal.querySelectorAll('.v4v-err');
    const open = (view: 'time' | 'talent'): void => {
      modal.dataset.view = view;
      if (title) title.textContent = view === 'time' ? tr('v4v_time') : tr('v4v_talent');
      errs().forEach((e) => (e.textContent = ''));
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      this.input.clearTouch();
      window.setTimeout(() => (modal.querySelector(view === 'time' ? '#v4v-msg-in' : '#v4v-rname') as HTMLElement | null)?.focus(), 60);
    };
    // TIME: a plain message needs no check; the optional name / email stay hidden until a grown-up passes.
    const personal = document.getElementById('v4v-time-personal');
    const grownBtn = document.getElementById('v4v-time-grownup');
    let timeUnlocked = false;
    const lockPersonal = (): void => {
      timeUnlocked = false;
      if (personal) personal.hidden = true;
      if (grownBtn) grownBtn.hidden = false;
      for (const id of ['v4v-name-in', 'v4v-email-in']) {
        const f = document.getElementById(id) as HTMLInputElement | null;
        if (f) f.value = '';
      }
    };
    grownBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.askGrownUp('time', () => {
        timeUnlocked = true;
        if (personal) personal.hidden = false;
        grownBtn.hidden = true;
        window.setTimeout(() => document.getElementById('v4v-name-in')?.focus(), 30);
      });
    });
    const close = (): void => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      lockPersonal();
      this.input.clearTouch();
      this.input.clearJustPressed();
    };
    const done = (text: string): void => {
      const t = document.getElementById('v4v-done-text');
      if (t) t.textContent = text;
      if (title) title.textContent = modal.dataset.view === 'time' ? tr('v4v_time') : tr('v4v_talent');
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
        if (view === 'talent') this.askGrownUp('talent', () => open('talent'));
        else {
          lockPersonal();
          open('time');
        }
      });
    }
    modal.querySelectorAll('.v4v-cancel').forEach((b) => b.addEventListener('click', close));
    const msg = document.getElementById('v4v-msg-in') as HTMLTextAreaElement | null;
    const count = document.getElementById('v4v-count');
    msg?.addEventListener('input', () => {
      if (count) count.textContent = `${msg.value.length} / ${SUGGEST_MAX}`;
    });
    const val = (sel: string): string => (modal.querySelector(sel) as HTMLInputElement | null)?.value ?? '';
    const submit = (formId: string, run: () => Promise<void>, thanks: () => string): void => {
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
            done(thanks());
          })
          .catch((x: unknown) => {
            const m = x instanceof Error ? x.message : String(x);
            if (err) err.textContent = /HTTP 429|too many/i.test(m) ? tr('v4v_slow') : m.replace(/^fsb_\w+ HTTP \d+ (fsb: )?/, '');
          })
          .finally(() => {
            if (send) send.disabled = false;
          });
      });
    };
    submit(
      'v4v-time-form',
      () => sendSuggestion(val('#v4v-msg-in'), timeUnlocked ? val('#v4v-name-in') : '', timeUnlocked ? val('#v4v-email-in') : '', val('#v4v-time-form .v4v-hp')),
      () => tr('v4v_thanks_time'),
    );
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
        if (typeof r === 'string' || !f) return Promise.reject(new Error(typeof r === 'string' ? r : tr('v4v_pick')));
        return sendResume(val('#v4v-rname'), val('#v4v-remail'), val('#v4v-rnote'), f, val('#v4v-talent-form .v4v-hp'));
      },
      () => tr('v4v_thanks_talent'),
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
      const toast = scalePoints(TOASTER_POINTS * pts, this.speedTenths);
      this.score += toast;
      if (this.score > SCORE_CAP) this.score = SCORE_CAP;
      this.spawnFloater(x, y - 24, tr('fl_toasted', { n: fmtNum(Math.round(toast)) }), '#ffb347');
      this.particles.burst(x, y, '#ffb347', this.touchPrimary ? 10 : 22, 260);
    } else if (kind === 'blender') {
      this.spinT = BLENDER_SECONDS;
      this.spawnFloater(x, y - 24, tr('fl_blended'), '#7fffff');
    } else {
      this.shieldT = MICROWAVE_SECONDS;
      this.spawnFloater(x, y - 24, tr('fl_pizza'), '#f4c542');
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

  /** A boss arrives: hazards stop spawning (shades and rings keep coming). */
  private startBoss(def: BossDef): void {
    const local = loadLeaderboard();
    const bestLvl = local.reduce((a, e) => Math.max(a, e.difficulty ?? 0), 0);
    this.boss = new BossFight(def, this.runSeed, historyJabs(this.high, bestLvl, local.length));
    this.bossRightT = -1e9;
    // (The group photo is of the big bosses only.)
    if (!def.mini) this.bossesFought.push(def);
    this.world.spawnObstacles = false;
    this.bannerText = def.mini ? miniBanner(def) : def.name;
    this.bannerT = BANNER_SECONDS;
    this.audio.playPromote();
    if (def.mini) this.spawnFloater(this.player.x + 40, this.player.y - 40, miniGateText(def.level), '#ffe66d');
    console.info(`[fsb] boss L${def.level} ${def.modeId} seed ${this.boss.seed}`);
  }

  /**
   * Logical x the boss keeps left of, so the touch controls never cover it on a sideways screen
   * (the stick / BOOST button sit over the right of the lane there). Measured from the DOM
   * (re-checked twice a second); portrait keeps its controls in the bottom reserve, so no shift.
   */
  private bossRightT = -1e9;
  /** Centre y of the boss banner this frame (0 = not stacked under the boss header). */
  private bossBannerY = 0;
  private bossRightV = 0;
  private bossRightLimit(): number {
    const W = this.viewW;
    const now = performance.now();
    if (now - this.bossRightT < 500 && this.bossRightV > 0) return this.bossRightV;
    this.bossRightT = now;
    let right = W;
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    const c = this.canvas.getBoundingClientRect();
    if (this.touchPrimary && c.width > 0 && c.height > 0) {
      const sx = W / c.width;
      const sy = this.viewH / c.height;
      const box = (sel: string): { x: number; y: number; w: number; h: number } | null => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return null;
        return { x: (r.left - c.left) * sx, y: (r.top - c.top) * sy, w: r.width * sx, h: r.height * sy };
      };
      const boost = box('.touch-action[data-action="boost"]');
      const stick = box('#joy-base');
      for (const r of [boost, stick]) if (r) rects.push(r);
      if (this.viewH < W) {
        // Sideways: keep the boss left of whatever control sits on the right of the lane (the
        // whole stick zone, since the stick recentres under the thumb anywhere in it).
        for (const r of [box('#joy-zone'), boost]) {
          if (!r || r.x < W * 0.45 || r.y > this.viewH - 8) continue;
          right = Math.min(right, r.x - 6);
        }
      }
    }
    if (this.boss) this.boss.controls = rects;
    this.bossRightV = Math.max(W * 0.6, right);
    return this.bossRightV;
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
        case 'pop':
          this.audio.playComic(e.sfx);
          break;
        case 'hit':
          if (e.decoy) {
            if (Math.random() < 0.3) this.spawnFloater(e.x, e.y - 10, tr('fl_decoy'), '#ffffff');
          } else {
            this.particles.burst(e.x, e.y, e.crit ? '#ffe66d' : bf.def.tint, this.touchPrimary ? 3 : 6, 140);
          }
          break;
        case 'stunned':
          this.audio.playGate();
          this.spawnFloater(bf.main.x, bf.main.y - bf.main.h / 2 - 10, tr('fl_stunned'), '#ffe66d');
          this.renderer.bumpShake(6);
          break;
        case 'phase':
          this.renderer.bumpShake(8);
          this.renderer.bumpFlash(0.25);
          break;
        case 'defeated':
          if (bf.def.mini) {
            // MINI-BOSS: 1,000 x level, times the GAME SPEED, still capped. Then the level clears.
            const pts = scalePoints(miniBonus(bf.def.level), this.speedTenths);
            this.score = Math.min(SCORE_CAP, this.score + pts);
            this.minisBeaten++;
            this.audio.playPromote();
            this.renderer.bumpShake(8);
            this.renderer.bumpFlash(0.3);
            this.particles.burst(bf.main.x, bf.main.y, '#ffe66d', this.touchPrimary ? 12 : 30, 260);
            this.spawnFloater(bf.main.x - bf.main.w, bf.main.y, `+${fmtNum(pts)}`, '#ffe66d');
            this.bannerText = miniBeatenText(pts);
            this.bannerT = BANNER_SECONDS;
            break;
          }
          // Flat bonus (no level multiplier) times the GAME SPEED, still capped.
          this.score = Math.min(SCORE_CAP, this.score + scalePoints(BOSS_BONUS, this.speedTenths));
          this.bossesBeaten++;
          this.audio.playPromote();
          this.renderer.bumpShake(16);
          this.renderer.bumpFlash(0.6);
          this.particles.burst(bf.main.x, bf.main.y, '#ffe66d', this.touchPrimary ? 24 : 60, 360);
          this.spawnFloater(
            bf.main.x - bf.main.w,
            bf.main.y,
            this.speedTenths === SPEED_DEFAULT ? tr('fl_million') : `+${fmtNum(scalePoints(BOSS_BONUS, this.speedTenths))}`,
            '#ffe66d',
          );
          this.bannerText = tr('banner_beaten', { b: bf.def.name });
          this.bannerT = BANNER_SECONDS;
          break;
        case 'bored':
          this.bannerText = tr('banner_bored', { b: bf.def.name });
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
    if (this.missionRun) {
      this.missionHit(damageMul, BOSS_HIT_GRACE, 0.2);
      return false;
    }
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
    this.barks.length = 0;
    this.barkT = 0;
    this.stageDist = 0;
    this.levelTime = 0;
    this.charge = 1;
    this.player.invuln = Math.max(this.player.invuln, 1.2);
    while (this.floaters.length) {
      const f = this.floaters.pop();
      if (f) this.floaterPool.push(f);
    }
    // ON A MISSION: a new level, a duct-tape pit stop (every part back on).
    if (this.missionRun && this.car.repair(this.player.x, this.player.y, this.carScale)) this.audio.playMission('pop');
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
    this.spawnFloater(this.player.x, this.player.y - 30, tr('fl_eaten'), '#ffe66d');
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
      this.spawnFloater(s.x, s.y - 20, tr('fl_decoy'), '#ffe66d');
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
    this.player.scale = isMission(m) ? MISSION_HIT_SCALE : k * breedScale(breeds[0]);
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

  /** Car length in px / 64 car units (the car painter's scale). */
  private get carScale(): number {
    return MISSION_CAR_LEN / 64;
  }

  /**
   * ON A MISSION on touch layouts: when the (bigger) car drops onto the BOOST button or the stick
   * (landscape phones: they sit over the lower lane corners), it slides sideways off the control
   * so it's never drawn under one. Only x moves; the lane height is unchanged.
   */
  private keepCarClearOfControls(dt: number): void {
    const p = this.player;
    const s = this.carScale;
    const half = CAR_HALF * s;
    const top = p.y - MISSION_CAR_UP * s;
    const bottom = p.y + MISSION_CAR_DOWN * s;
    const maxX = this.viewW * 0.55;
    for (const r of this.controlRectsCached()) {
      if (bottom <= r.y || top >= r.y + r.h || p.x + half <= r.x || p.x - half >= r.x + r.w) continue;
      const leftSide = r.x + r.w / 2 < this.viewW / 2;
      const want = leftSide ? r.x + r.w + half + 4 : r.x - half - 4;
      if (leftSide ? want > maxX : want < 20) continue;
      const step = 1400 * dt;
      p.x = leftSide ? Math.min(want, p.x + step) : Math.max(want, p.x - step);
      // Like a lane edge: no velocity builds up into the control (uncapped movement).
      if (leftSide ? p.vx < 0 : p.vx > 0) p.vx = 0;
    }
  }

  private ctlRects: { x: number; y: number; w: number; h: number }[] = [];
  private ctlRectsAt = -1;
  /** touchControlRects(), re-measured at most every 250 ms (layout reads, not every frame). */
  private controlRectsCached(): { x: number; y: number; w: number; h: number }[] {
    const now = performance.now();
    if (this.ctlRectsAt < 0 || now - this.ctlRectsAt > 250) {
      this.ctlRects = this.touchControlRects();
      this.ctlRectsAt = now;
    }
    return this.ctlRects;
  }

  /** The stick and BOOST button in view units (touch layouts), for keeping comic bursts clear. */
  private touchControlRects(): { x: number; y: number; w: number; h: number }[] {
    const cv = this.canvas.getBoundingClientRect();
    if (cv.width < 1 || cv.height < 1) return [];
    const kx = this.viewW / cv.width;
    const ky = this.viewH / cv.height;
    const out: { x: number; y: number; w: number; h: number }[] = [];
    for (const el of [document.getElementById('joy-base'), document.querySelector<HTMLElement>('[data-action="boost"]')]) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      out.push({ x: (r.left - cv.left) * kx, y: (r.top - cv.top) * ky, w: r.width * kx, h: r.height * ky });
    }
    return out;
  }

  /**
   * ON A MISSION: the car's centre limits so the whole car (roof loudspeaker to wheels) stays under the
   * HUD and inside the lane on every layout; touch layouts keep their stick / BOOST reserve.
   */
  private missionReserves(pr: { top: number; bottom: number }): { top: number; bottom: number } {
    const s = this.carScale;
    return {
      top: Math.max(pr.top, Math.ceil(this.renderer.hudBottom(this.viewW, this.viewH) + MISSION_CAR_UP * s + 4)),
      bottom: Math.max(pr.bottom, Math.ceil(MISSION_CAR_DOWN * s + 6)),
    };
  }

  /**
   * ON A MISSION hit: one part flies off (or, with none left, a sputter / honk / smoke gag), a
   * little shade is lost, never below MISSION_SHADE_FLOOR: a hit can't end the run or wreck the car.
   */
  private missionHit(damageMul: number, grace: number, shade: number): void {
    if (this.charge > MISSION_SHADE_FLOOR) this.charge = Math.max(MISSION_SHADE_FLOOR, this.charge - shade * damageMul);
    this.player.invuln = grace;
    const sfx: MissionSfx = this.car.hit(this.player.x, this.player.y, this.carScale, this.scrollSpeed);
    if (sfx === 'honk' || sfx === 'boing' || sfx === 'whistleUp' || sfx === 'whistleDown') this.audio.playComic(sfx);
    else this.audio.playMission(sfx);
    this.particles.burst(this.player.x, this.player.y, '#ffffff', this.touchPrimary ? 6 : 12, 200);
    this.renderer.bumpShake(8);
    this.renderer.bumpFlash(0.2);
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
    for (const o of obs) {
      if (o.kind !== 'ring' || !o.alive || o.passed) continue;
      let touched = this.sweptAny((b) => this.touchesGate(o, b.x, b.y, b.w, b.h));
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
      this.spawnFloater(cx, o.y - 6, tr('fl_gate'), '#ffe66d');
      this.boss?.stunHit();
    }
  }

  /**
   * Swept collision for the lead (v2.1: no speed cap). This step's move from (prevX, prevY) to
   * (x, y) is covered by hitboxes at most half a hitbox apart, so at any speed nothing (hazard,
   * gate, circle, boss body or shot) can be jumped over between two frames.
   */
  private sweepPlayer(): void {
    const p = this.player;
    const hb = p.hitbox;
    const dx = p.x - p.prevX;
    const dy = p.y - p.prevY;
    const step = Math.max(3, Math.min(hb.w, hb.h) * 0.5);
    const dist = Math.hypot(dx, dy);
    const n = Number.isFinite(dist) ? Math.min(512, Math.max(1, Math.ceil(dist / step))) : 1;
    while (this.sweepBoxes.length < n) this.sweepBoxes.push({ x: 0, y: 0, w: 0, h: 0 });
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / n;
      const b = this.sweepBoxes[i];
      b.x = hb.x - dx * (1 - k);
      b.y = hb.y - dy * (1 - k);
      b.w = hb.w;
      b.h = hb.h;
    }
    this.sweepN = n;
  }

  /** Does any box of this step's sweep pass the test? (One box at normal speeds.) */
  private sweptAny(test: (b: { x: number; y: number; w: number; h: number }) => boolean): boolean {
    if (this.sweepN <= 0) return test(this.player.hitbox);
    for (let i = 0; i < this.sweepN; i++) if (test(this.sweepBoxes[i])) return true;
    return false;
  }

  /**
   * FIRE outside boss fights: holding FIRE barks WOOF straight ahead every BARK_EVERY s at
   * BARK_SPEED, exactly like a boss fight (Boss.ts). A bark that reaches a hazard hits it (point in
   * its box, swept so a bark never skips a thin beam): a hit flash + wobble, a cartoon word and
   * sound; at 0 hp the hazard pops apart in a puff (small score bonus, x level points x GAME
   * SPEED, capped). Ring gates are never hit (barks fly through).
   */
  private updateBarks(dt: number, boosting: boolean, pts: number): void {
    this.hazardPopCd = Math.max(0, this.hazardPopCd - dt);
    this.barkT -= dt;
    const p = this.player;
    if (boosting && this.barkT <= 0) {
      this.barkT = BARK_EVERY;
      this.barks.push({ x: p.x + 30, y: p.y, alive: true });
    }
    if (!this.barks.length) return;
    const back = this.scrollSpeed * dt; // hazards moved left by this much this step
    for (const k of this.barks) {
      if (!k.alive) continue;
      const x0 = k.x;
      k.x += BARK_SPEED * dt;
      if (k.x > this.viewW + 40) k.alive = false;
      for (const o of this.world.obstacles) {
        if (!o.alive || o.hp <= 0 || o.kind === 'ring') continue;
        let left: number;
        let right: number;
        let hitY: boolean;
        if (o.kind === 'flare') {
          const r = o.w * 0.38;
          const cx = o.x + o.w / 2;
          left = cx - r;
          right = cx + r;
          hitY = Math.abs(k.y - (o.y + o.h / 2)) <= r;
        } else {
          left = o.x;
          right = o.x + o.w;
          hitY = k.y >= o.y && k.y <= o.y + o.h;
        }
        if (!hitY || k.x < left || x0 > right + back) continue;
        k.alive = false;
        this.hazardHit(o, Math.max(left, Math.min(k.x, right)), k.y, pts);
        break;
      }
    }
    let w = 0;
    for (const k of this.barks) if (k.alive) this.barks[w++] = k;
    this.barks.length = w;
  }

  private hazardHit(o: Obstacle, x: number, y: number, pts: number): void {
    const col = o.kind === 'neon' ? '#7fffff' : o.kind === 'flare' ? '#ffb347' : '#ffe66d';
    o.hp -= 1;
    o.hitT = HAZARD_HIT_FLASH;
    // Same hit burst as a bark on a boss board.
    this.particles.burst(x, y, col, this.touchPrimary ? 3 : 6, 140);
    if (o.hp > 0) {
      if (this.hazardPopCd <= 0) {
        this.hazardPopCd = 0.7;
        const [word, sfx] = HAZARD_HIT_POPS[Math.floor(Math.random() * HAZARD_HIT_POPS.length)];
        this.spawnFloater(x, y - 18, word, '#ffe14d');
        this.audio.playComic(sfx);
      }
      return;
    }
    // Popped: it breaks apart into a cartoon puff (confetti-like bits, no debris that hurts).
    o.alive = false;
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    this.particles.burst(cx, cy, col, this.touchPrimary ? 10 : 22, 240);
    this.particles.burst(cx, cy, '#ffffff', this.touchPrimary ? 4 : 10, 160);
    const bonus = pts > 0 ? scalePoints(HAZARD_POP_POINTS * o.maxHp * pts, this.speedTenths) : 0;
    this.score = Math.min(SCORE_CAP, this.score + bonus);
    this.spawnFloater(cx, cy - 10, Math.random() < 0.5 ? 'POOF!' : 'POP!', '#ffffff');
    if (bonus > 0) this.spawnFloater(cx, cy + 14, `+${fmtNum(Math.round(bonus))}`, '#ffe66d');
    this.audio.playComic('boing');
    this.hazardsPopped++;
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
      if (this.barks.length) this.renderer.drawBarks(ctx, this.barks);
      if (this.boss) {
        const bf = this.boss;
        bf.hudBottom = this.renderer.hudBottom(this.viewW, this.viewH);
        // Boss banners stack under the boss name + HP bar, and the taunt card under the banner.
        bf.bannerBottom = 0;
        this.bossBannerY = 0;
        if (this.bannerT > 0 && bf.headerBottom > 0) {
          const bh = this.renderer.levelBannerHeight(ctx, this.bannerText, bf.headerW);
          this.bossBannerY = bf.headerBottom + this.renderer.u(8) + bh / 2;
          bf.bannerBottom = this.bossBannerY + bh / 2;
        }
      }
      if (this.boss) drawBoss(ctx, this.boss, this.viewW, (n) => this.renderer.u(n), this.renderer.lite, this.pulse);
      this.particles.draw(ctx);
      if ((this.level > 0 || (this.formation.occupiedCount > 0 && !this.mode)) && (this.state === 'playing' || this.state === 'paused')) {
        this.renderer.drawClones(ctx, this.formation, this.ships, this.player.x, this.player.y);
      } else if (this.mode && !this.missionRun && (this.state === 'playing' || this.state === 'paused')) {
        const m = this.mode;
        const hidden = this.decoyHiddenT > 0 ? this.decoySlot : null;
        this.renderer.drawSwarm(ctx, this.formation, m.tint, m.style, this.ships, this.player.x, this.player.y, hidden);
      }
      if (this.missionRun) {
        const p = this.player;
        const blink = p.invuln > 0 && Math.floor(this.pulse * 20) % 2 === 0;
        const lens = this.charge > 0.3 ? 'rgba(0, 255, 220, 0.95)' : 'rgba(255, 200, 50, 0.95)';
        this.car.draw(ctx, p.x, p.y, clamp(p.vy / 500, -0.3, 0.3), this.carScale, this.pulse, this.renderer.lite, lens, blink ? 0.7 : 1);
        // Comic bursts: under the HUD, above the stick / BOOST (touch) or the lane edge.
        const popTop = this.renderer.hudBottom(this.viewW, this.viewH) + this.renderer.u(4);
        const popBottom = this.viewH - (this.touchPrimary ? this.touchReserves().bottom : 24);
        const avoid = this.touchPrimary && this.car.pops.length > 0 ? this.controlRectsCached() : [];
        this.car.drawFx(ctx, this.carScale, this.viewW, (n) => this.renderer.u(n), this.pulse, this.renderer.lite, { top: popTop, bottom: popBottom, avoid });
      } else this.renderer.drawPlayer(ctx, this.player, this.charge);
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
            : this.missionRun
              ? { level: this.runDifficulty, ships: 0, label: tr('hud_parts', { n: this.car.partsLeft, t: MISSION_PARTS }) }
              : this.mode
              ? { level: this.runDifficulty, ships: this.ships }
              : { level: this.runDifficulty, ships: 0, dogs: this.packBreeds(), dogIconScale: packScale(this.ships) / PACK_S0 },
        this.tutStep < 0 && this.speedTenths !== SPEED_DEFAULT ? tr('hud_speed', { s: fmtSpeed(this.speedTenths) }) : null,
      );
      if (this.tutStep >= 0) {
        const tt = this.tutorialText();
        this.renderer.drawTutorial(ctx, this.tutStep + 1, TUT_STEPS, tt.title, tt.lines);
      }
      if (this.bannerT > 0 && this.boss && this.bossBannerY > 0) {
        this.renderer.drawLevelBanner(ctx, this.bannerText, this.bannerT, BANNER_SECONDS, this.bossBannerY, this.boss.headerX, this.boss.headerW);
      } else if (this.bannerT > 0) this.renderer.drawLevelBanner(ctx, this.bannerText, this.bannerT, BANNER_SECONDS);
      if (this.continueT > 0) {
        this.renderer.drawPromotion(ctx, tr('cont_title'), tr(this.touchPrimary ? 'cont_touch' : 'cont_keys', { n: Math.ceil(this.continueT) }), this.continueT, CONTINUE_SECONDS, this.score);
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
      } else this.renderer.drawPause(ctx, this.speedPanelOpen ? this.speedPanelTopView : Infinity);
    }
    if (this.state === 'initials') {
      this.renderer.drawInitialsEntry(
        ctx,
        this.pendingScore,
        this.initialsChars,
        this.initialsSlot,
        this.pulse,
        this.initialsWarn > 0 ? rudePrompt(lang()) : '',
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
        this.pendingMission ? (this.boardIsRemote ? tr('lb_dev') : tr('lb_dev_local')) : this.boardIsRemote ? tr('lb_global') : tr('lb_top'),
        this.victory ? tr('go_victory', { n: MAX_LEVEL }) : this.pendingMission ? tr('go_mission') : tr('go_headline'),
        boardTaunt(lang(), this.highlightIndex, this.boardTauntPick, this.leaderboard.length),
      );
    }
  }
}
