/**
 * Test-only hooks, bundled only when built with FSB_TEST=1 (see vite.config.ts).
 * Production builds compile the import out, so none of this ships to players.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { shipsForLevel } from '../utils/cloneLevels';
import { CLONE_SLOTS } from '../entities/Formation';
import { bossPilot, makeSkill, stickTo, type PilotSkill } from './bossAutopilot';
import { BOSSES, bossTuning } from './Boss';
import { mulberry32 } from '../utils/rng';
import { MODES, MISSION_MODE, GHOST_MODE } from '../utils/modes';
import { scalePoints } from '../utils/speed';
import { TAUNTS, pickTauntIndex, SEARCH_MS } from './desertSearch';
import { setBroadcastForTest, broadcastOn, TAUNT_BROADCAST } from '../utils/tauntFeed';
import { CAR_HALF, CAR_DOWN, CAR_UP, PARTS as MISSION_PART_LIST } from './missionCar';
import { campaignLevers } from '../utils/campaign';
import { loadCatSuit, loadAnimalsUnlocked, saveCatSuit, saveAnimalsUnlocked, saveCatTried } from '../utils/storage';
import { pet } from '../utils/pets';
import { setDailyClock, loadDaily, saveDaily, streakInfo, pacificDayKey, twistForDay, dailyNow, loadWins, saveWins, addWin, TWISTS, type WinKind } from '../utils/daily';
import { paintShip, BREEDS, CAT_BREEDS, PLATYPUS_BREEDS, MANATEE_BREEDS } from '../render/shipSprite';

const MISSION_PARTS_TOTAL = MISSION_PART_LIST.length;

let pilotOn = false;
let pilotKeep = false;
let dodgeOn = false;
let warp = 1;

export function installTestHooks(game: unknown): void {
  const g = game as any;
  let sk: PilotSkill = makeSkill(mulberry32(7));
  let skSeed = -1;
  const axis = { x: 0, y: 0 };
  const origTick = g.tick.bind(g);
  g.tick = (dt: number) => {
    if (pilotOn && g.state === 'playing') {
      const f = g.boss;
      if (f) {
        if (skSeed !== f.seed) {
          skSeed = f.seed;
          sk = makeSkill(mulberry32(f.seed ^ 0x51ed));
        }
        const pr = g.touchReserves();
        const rings = g.world.obstacles
          .filter((o: any) => o.kind === 'ring' && o.alive && !o.passed)
          .map((o: any) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 }));
        const act = bossPilot(f, { px: g.player.x, py: g.player.y, halfH: g.player.h / 2 + 4, top: pr.top, bottom: g.viewH - pr.bottom, charge: g.charge, rings, vy: g.player.vy }, sk, dt);
        axis.x = stickTo(g.viewW * 0.185 - g.player.x, g.player.vx) * 0.6;
        axis.y = act.ay;
        Object.defineProperty(g.input, 'axis', { configurable: true, get: () => axis });
        Object.defineProperty(g.input, 'boosting', { configurable: true, get: () => act.boost });
      } else if (dodgeOn) {
        // Simple 'decent player' bot: steer to the lane with the most room ahead, grab bowls,
        // hold FIRE when something is in the lane (always on Hold-Fire tuning).
        const pr = g.touchReserves();
        const top = pr.top + 30, bot = g.viewH - pr.bottom - 30;
        const px = g.player.x, py = g.player.y;
        let best = py, bestScore = -1e9;
        for (let y = top; y <= bot; y += 12) {
          let sc = -Math.abs(y - py) * 0.04 - Math.abs(y - (top + bot) / 2) * 0.01;
          for (const o of g.world.obstacles) {
            if (!o.alive || o.kind === 'ring') continue;
            const ahead = o.x - px;
            if (o.x + o.w < px - 30 || ahead > 380) continue;
            const pad = 34;
            if (y > o.y - pad && y < o.y + o.h + pad) sc -= 400 / (1 + Math.max(0, ahead) / 90);
          }
          for (const c of g.world.collectibles) {
            if (!c.alive) continue;
            const ahead = c.x - px;
            if (ahead < -10 || ahead > 300) continue;
            if (Math.abs(c.y - y) < 26) sc += (c.kind === 'shade' ? 30 : 8) * (g.charge < 0.6 ? 2 : 1);
          }
          if (sc > bestScore) { bestScore = sc; best = y; }
        }
        axis.y = Math.max(-1, Math.min(1, (best - py) / 50));
        axis.x = stickTo(g.viewW * 0.22 - px, g.player.vx) * 0.6;
        const inLane = g.world.obstacles.some((o: any) => o.alive && o.kind !== 'ring' && o.x > px && o.x - px < 320 && py > o.y - 30 && py < o.y + o.h + 30);
        const fire = g.easyFire() || (inLane && g.charge > 0.35);
        Object.defineProperty(g.input, 'axis', { configurable: true, get: () => axis });
        Object.defineProperty(g.input, 'boosting', { configurable: true, get: () => fire });
      } else {
        axis.x = 0;
        axis.y = 0;
        Object.defineProperty(g.input, 'axis', { configurable: true, get: () => axis });
        Object.defineProperty(g.input, 'boosting', { configurable: true, get: () => false });
      }
      if (pilotKeep && g.charge < 0.35) g.charge = 0.35;
    }
    for (let i = 0; i < warp; i++) origTick(dt);
  };
  (window as any).__fsbTest = {
    state: () => ({
      state: g.state,
      level: g.level,
      ships: g.ships,
      drawn: 1 + g.formation.occupiedCount,
      levelTime: g.levelTime,
      hazardsPopped: g.hazardsPopped,
      pvx: g.player.vx,
      pvy: g.player.vy,
      runTime: g.runTime,
      score: g.score,
      runDifficulty: g.runDifficulty,
      cloneOpen: g.cloneOpen,
      ticketPending: g.ticketPending,
      mode: g.mode ? g.mode.id : null,
      campaign: g.campaign,
      pendingStory: g.pendingStory,
      promoTitle: g.promoT > 0 ? g.promoTitle : null,
      promoSub: g.promoT > 0 ? g.promoSub : null,
      species: pet(),
      playerSpecies: g.player.breed.species,
      packSpecies: g.formation.slots.filter((s: any) => s.occupied).map((s: any) => s.breed.species),
      suit: loadCatSuit(),
      animals: loadAnimalsUnlocked(),
      missionRun: g.missionRun,
      ghostRun: g.ghostRun,
      missionUnlocked: g.missionUnlocked,
      car: g.missionRun
        ? { partsLeft: g.car.partsLeft, lost: g.car.lost, hits: g.car.hits, debris: g.car.debris.length, pops: g.car.pops.map((p: any) => p.text),
            popRects: g.car.popRects.map((r: any) => ({ ...r })),
            carScale: g.carScale,
            carRect: { x: g.player.x - CAR_HALF * g.carScale, y: g.player.y - CAR_UP * g.carScale, w: 2 * CAR_HALF * g.carScale, h: (CAR_UP + CAR_DOWN) * g.carScale },
            partsTotal: MISSION_PARTS_TOTAL,
            hitbox: { ...g.player.hitbox },
            hudBottom: g.renderer.hudBottom(g.viewW, g.viewH),
            controls: g.touchPrimary ? g.touchControlRects() : [],
            view: { w: g.viewW, h: g.viewH } }
        : null,
      devOpen: g.devOpen,
      boardIsRemote: g.boardIsRemote,
      pendingMission: g.pendingMission,
      modeName: g.mode ? g.mode.name : null,
      modesUsed: [...g.modesUsed],
      runSeed: g.runSeed,
      bossesBeaten: g.bossesBeaten,
      minisBeaten: g.minisBeaten,
      charge: g.charge,
      speedTenths: g.speedTenths,
      runSpeedMax: g.runSpeedMax,
      runLocalOnly: g.runLocalOnly,
      speedPanelOpen: g.speedPanelOpen,
      distance: g.distance,
      banner: g.bannerT > 0 ? g.bannerText : null,
      promo: g.promoT > 0 ? g.promoTitle : null,
      boss: g.boss
        ? {
            level: g.boss.def.level,
            id: g.boss.def.modeId,
            state: g.boss.state,
            hp: g.boss.hp,
            maxHp: g.boss.maxHp,
            t: g.boss.t,
            endT: g.boss.endT,
            phase: g.boss.phase,
            stunned: g.boss.stunned,
            seed: g.boss.seed,
            shots: g.boss.shots.length,
            spots: g.boss.boards.map((b: any) => b.spot),
            taunt: g.boss.taunt,
            mini: !!g.boss.def.mini,
            name: g.boss.def.name,
            bored: g.boss.tune.bored,
            fireEvery: g.boss.tune.fireEvery,
            volley: g.boss.tune.volley,
            shotSpeed: g.boss.tune.shotSpeed,
          }
        : null,
    }),
    /** CHANGE MODE in place (same path as the in-run picker). */
    swapMode: (id: string) => {
      const m = MODES.find((x) => x.id === id);
      if (m) g.switchMode(m, true);
      return g.mode ? g.mode.id : null;
    },
    /** STORY MODES: set unlocks like the dev ?unlock= param ('suit' | 'all' | 'none' | 'fresh'). */
    unlock: (k: 'suit' | 'all' | 'none' | 'fresh') => {
      if (k === 'suit' || k === 'all') saveCatSuit(true);
      if (k === 'all') saveAnimalsUnlocked(true);
      if (k === 'none' || k === 'fresh') {
        saveCatSuit(false);
        saveAnimalsUnlocked(false);
      }
      if (k === 'fresh') saveCatTried(false);
      g.syncStoryCards();
    },
    /** STORY MODES: start a story run directly (same path as its MODES card). */
    startStory: (id: 'part2' | 'platypus' | 'manatee') => {
      g.pendingCampaign = id;
      g.startRun(1, null, false);
    },
    /** Hazard levers in effect for this run's campaign at its level. */
    levers: () => campaignLevers(g.runDifficulty, g.campaign),
    /** Art check: paint any animal onto a test canvas (dogs, suited cats, platypus, manatee). */
    art: { paintShip, BREEDS, CAT_BREEDS, PLATYPUS_BREEDS, MANATEE_BREEDS },
    /** Skip the current promotion / title card. */
    skipPromo: () => {
      g.promoT = 0.001;
    },
    /** Silliness pack helpers. */
    addPower: (kind: 'toaster' | 'blender' | 'microwave') => g.world.addPower(kind, g.player.x + 60, g.player.y),
    forceCat: () => {
      g.catShown = false;
      g.nextCatAt = 0;
      if (g.runDifficulty < 100) g.runDifficulty = 100;
    },
    allBossesFought: () => {
      g.bossesFought = [...BOSSES];
    },
    killBoss: () => {
      if (g.boss) {
        g.boss.hp = 0.1;
        g.boss.stunT = 2;
        g.boss.barks.push({ x: g.boss.main.x, y: g.boss.main.y, alive: true });
      }
    },
    /** ON A MISSION: start a run directly (same path as the MODES entry). */
    startMission: () => {
      g.missionUnlocked = true;
      g.startRun(1, null, false, MISSION_MODE);
    },
    /** GHOST DUSTERS: start a run directly. */
    startGhost: () => {
      g.startRun(1, null, false, GHOST_MODE);
    },
    ghostHit: () => {
      if (g.ghostRun) g.ghostHit(1, 0.85, 0.12);
    },
    /** ON A MISSION: one hit on the car, exactly as an obstacle would. */
    missionHit: () => {
      if (g.missionRun) g.missionHit(1, 0.85, 0.12);
    },
    /** GAME SPEED layout (view units): HUD tag, HUD bottom, touch controls, view size, CSS px per unit. */
    speedLayout: () => {
      const cr = g.canvas.getBoundingClientRect();
      return {
        tag: g.renderer.speedTagRect ? { ...g.renderer.speedTagRect } : null,
        hudBottom: g.renderer.hudBottom(g.viewW, g.viewH),
        controls: g.touchPrimary ? g.touchControlRects() : [],
        view: { w: g.viewW, h: g.viewH },
        canvas: { x: cr.left, y: cr.top, w: cr.width, h: cr.height },
        k: cr.width / g.viewW,
        door: g.renderer.pauseDoorRect(),
        panelTopView: g.speedPanelTopView,
      };
    },
    /** GAME SPEED in tenths (same path as the pause slider). */
    setSpeed: (t: number) => g.setSpeed(t),
    /** The GAME SPEED points rule (utils/speed.ts), for exact checks. */
    scalePoints,
    /** Pin the next run's seed. */
    seed: (n: number) => {
      g.forcedSeed = n >>> 0;
    },
    /** End the current level now (the boss arrives on boss levels). */
    endLevel: () => {
      g.levelTime = 30;
    },
    /**
     * Autopilot (skilled-bot handicap: re-plans every 0.2 s, aims off by up to a row). keepAlive
     * holds shade at >= 0.35 so a recorded fight always runs to its end (damage still applies).
     */
    pilot: (on: boolean, keepAlive = false) => {
      pilotOn = on;
      pilotKeep = keepAlive;
      if (!on) {
        delete g.input.axis;
        delete g.input.boosting;
      }
    },
    /** Bot for the DAILY completability check: pilot + lane dodger (keepAlive off = honest run). */
    bot: (on: boolean, speedUp = 1) => {
      pilotOn = on;
      pilotKeep = false;
      dodgeOn = on;
      warp = Math.max(1, Math.min(6, Math.floor(speedUp)));
      if (!on) {
        delete g.input.axis;
        delete g.input.boosting;
      }
    },
    /** DAILY CHALLENGE / STREAK hooks (dev builds only). */
    daily: {
      /** Move the daily clock to ms (keeps ticking from there); null = real time. */
      setNow: (ms: number | null) => {
        if (ms == null) return setDailyClock(null);
        const off = ms - Date.now();
        setDailyClock(() => Date.now() + off);
        g.syncDailyUi?.();
      },
      /** Set beaten days (YYYY-MM-DD) and best streak. */
      setWon: (won: string[], best?: number) => {
        const s = loadDaily();
        saveDaily({ ...s, won: [...won].sort(), best: best ?? Math.max(s.best, 0) });
        g.syncDailyUi?.();
      },
      info: () => {
        const day = pacificDayKey(dailyNow());
        return { day, twist: twistForDay(day), ...streakInfo(loadDaily(), day), stored: loadDaily() };
      },
      twists: () => TWISTS.map((t) => ({ ...t })),
      start: (id?: string) => g.startDaily(id),
      open: () => g.openDaily(),
      /** Fast-forward the current daily run to just short of its goal. */
      nearGoal: (m = 30) => {
        if (g.dailyRun) g.distance = g.dailyRun.target - m;
      },
      run: () => ({ twist: g.dailyRun?.id ?? null, won: g.dailyWon, distance: g.distance, target: g.dailyRun?.target ?? 0, state: g.state, runTime: g.runTime, charge: g.charge, ships: g.ships }),
      addWin: (kind: WinKind, v?: string, agoMs = 0) => {
        const now = dailyNow();
        saveWins(addWin(loadWins(now), { t: now - agoMs, kind, ...(v != null ? { v } : {}) }, now));
        g.tickerIdx = -1;
        g.syncDailyUi?.();
      },
      clearWins: () => saveWins([]),
      /** End the current run now (game over). */
      finish: () => g.endRun(),
    },
    BOSSES: BOSSES.map((b) => ({ level: b.level, id: b.modeId, name: b.name, signature: b.signature, ...bossTuning(b.rank) })),
    /** Jump the current run to level n (as if every earlier level was passed); gold levels get their swarm. */
    setLevel: (n: number) => {
      g.runDifficulty = n;
      if (!g.mode && n >= 11) {
        g.level = n;
        g.ships = shipsForLevel(n);
        g.formation.fill(Math.min(g.ships - 1, CLONE_SLOTS), g.player.x, g.player.y);
      }
      g.levelTime = 0;
    },
    /** Put the run 1 s short of passing the current level. */
    nearPass: () => {
      g.levelTime = 29;
    },
    /** Freeze shade drain so a long idle test run doesn't end. */
    fullCharge: () => {
      g.charge = 1;
    },
    shipsForLevel,
    CLONE_SLOTS,
    /** COMBING THE DESERT: card state, the taunt list and the broadcast. */
    desert: () => (g.desert ? g.desert.state : null),
    TAUNTS: [...TAUNTS],
    SEARCH_MS,
    pickTauntIndex,
    TAUNT_BROADCAST,
    broadcastOn: () => broadcastOn(),
    /** Mocked-network tests only: switch the broadcast on in this test build and poll once. */
    setBroadcast: (on: boolean) => {
      setBroadcastForTest(on);
      if (on) g.desert?.startFeedForTest();
    },
    pollFeed: () => g.desert?.pollOnce() ?? null,
    game: g,
  };
}
