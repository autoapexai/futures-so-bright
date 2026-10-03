/**
 * Test-only hooks, bundled only when built with FSB_TEST=1 (see vite.config.ts).
 * Production builds compile the import out, so none of this ships to players.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { shipsForLevel } from '../utils/cloneLevels';
import { CLONE_SLOTS } from '../entities/Formation';
import { bossPilot, makeSkill, type PilotSkill } from './bossAutopilot';
import { BOSSES, bossTuning } from './Boss';
import { mulberry32 } from '../utils/rng';
import { MODES, MISSION_MODE } from '../utils/modes';
import { scalePoints } from '../utils/speed';
import { TAUNTS, pickTauntIndex, SEARCH_MS } from './desertSearch';
import { setBroadcastForTest, broadcastOn, TAUNT_BROADCAST } from '../utils/tauntFeed';

let pilotOn = false;
let pilotKeep = false;

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
        const act = bossPilot(f, { px: g.player.x, py: g.player.y, halfH: g.player.h / 2 + 4, top: pr.top, bottom: g.viewH - pr.bottom, charge: g.charge, rings }, sk, dt);
        axis.x = g.player.x > g.viewW * 0.22 ? -0.4 : g.player.x < g.viewW * 0.15 ? 0.4 : 0;
        axis.y = act.ay;
        Object.defineProperty(g.input, 'axis', { configurable: true, get: () => axis });
        Object.defineProperty(g.input, 'boosting', { configurable: true, get: () => act.boost });
      } else {
        axis.x = 0;
        axis.y = 0;
        Object.defineProperty(g.input, 'axis', { configurable: true, get: () => axis });
        Object.defineProperty(g.input, 'boosting', { configurable: true, get: () => false });
      }
      if (pilotKeep && g.charge < 0.35) g.charge = 0.35;
    }
    origTick(dt);
  };
  (window as any).__fsbTest = {
    state: () => ({
      state: g.state,
      level: g.level,
      ships: g.ships,
      drawn: 1 + g.formation.occupiedCount,
      levelTime: g.levelTime,
      runTime: g.runTime,
      score: g.score,
      runDifficulty: g.runDifficulty,
      cloneOpen: g.cloneOpen,
      ticketPending: g.ticketPending,
      mode: g.mode ? g.mode.id : null,
      missionRun: g.missionRun,
      missionUnlocked: g.missionUnlocked,
      car: g.missionRun
        ? { partsLeft: g.car.partsLeft, lost: g.car.lost, hits: g.car.hits, debris: g.car.debris.length, pops: g.car.pops.map((p: any) => p.text),
            popRects: g.car.popRects.map((r: any) => ({ ...r })),
            carScale: g.carScale,
            carRect: { x: g.player.x - 36 * g.carScale, y: g.player.y - 25 * g.carScale, w: 72 * g.carScale, h: 44 * g.carScale },
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
          }
        : null,
    }),
    /** CHANGE MODE in place (same path as the in-run picker). */
    swapMode: (id: string) => {
      const m = MODES.find((x) => x.id === id);
      if (m) g.switchMode(m, true);
      return g.mode ? g.mode.id : null;
    },
    /** Silliness pack helpers. */
    addPower: (kind: 'toaster' | 'blender' | 'microwave') => g.world.addPower(kind, g.player.x + 60, g.player.y),
    forceCat: () => {
      g.nextCatAt = 0;
      if (g.runTime < 30) g.runTime = 30;
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
    /** COMBING THE DESERT: card state, the taunt list and the (switched-off) broadcast. */
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
