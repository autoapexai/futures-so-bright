/** DAILY CHALLENGE / STREAK / RECENT WINS copy: English + Spanish; every other language falls back to English. */
import type { TwistId, WinKind } from '../utils/daily';

interface DailyCopy {
  btn: string;
  title: string;
  twist: Record<TwistId, [string, string]>;
  goal: string; // {m}
  start: string;
  back: string;
  newIn: string; // {t}
  streak: string; // {n}
  bestStreak: string; // {n}
  newStreak: string;
  todayBest: string; // {s}
  doneToday: string;
  replay: string;
  done: string;
  banner: string; // {t} {m}
  overDone: string;
  overTry: string; // {d} {m}
  win: Record<WinKind, string>; // {v}
  ago: { now: string; min: string; mins: string; hour: string; hours: string };
}

const en: DailyCopy = {
  btn: 'DAILY CHALLENGE',
  title: 'DAILY CHALLENGE',
  twist: {
    double: ['Double Treats', 'Every treat bowl counts twice.'],
    bowls: ['Bowls Only', 'Just treat bowls today. No kitchen gadgets.'],
    bossrush: ['Boss Rush', 'Mini-bosses show up much sooner.'],
    slowmo: ['Slow-Mo Day', 'Everything drifts by at half speed.'],
    holdfire: ['Hold-Fire Day', 'Hold FIRE to blast a clear lane all run long.'],
    tiny: ['Tiny Pets', 'Your pets are extra small and slip through gaps.'],
    storm: ['Treat Storm', 'Twice as many treats in the sky.'],
  },
  goal: 'Goal: fly {m} m',
  start: 'PLAY TODAY\'S CHALLENGE',
  back: 'BACK',
  newIn: 'New challenge in {t}',
  streak: 'Streak {n}',
  bestStreak: 'Best streak: {n}',
  newStreak: 'New streak starts today!',
  todayBest: 'Today\'s best: {s}',
  doneToday: 'Done today! Replays are just for fun.',
  replay: 'PLAY AGAIN',
  done: 'Daily challenge done!',
  banner: 'DAILY: {t} · fly {m} m',
  overDone: 'Daily challenge done!',
  overTry: 'Daily goal {m} m. You flew {d} m. Try again!',
  win: {
    boss: 'You did it! Beat {v}',
    high: 'New high score: {v}',
    daily: 'Daily challenge done!',
    streak: 'Streak {v}! Nice going',
  },
  ago: { now: 'just now', min: '1 minute ago', mins: '{n} minutes ago', hour: '1 hour ago', hours: '{n} hours ago' },
};

const es: DailyCopy = {
  btn: 'RETO DIARIO',
  title: 'RETO DIARIO',
  twist: {
    double: ['Premios dobles', 'Cada plato de premios cuenta doble.'],
    bowls: ['Solo platos', 'Hoy solo platos de premios. Sin aparatos de cocina.'],
    bossrush: ['Jefes en fila', 'Los mini jefes llegan mucho antes.'],
    slowmo: ['Día en cámara lenta', 'Todo pasa a la mitad de velocidad.'],
    holdfire: ['Día de mantener FUEGO', 'Mantén FUEGO para abrir camino toda la partida.'],
    tiny: ['Mascotas mini', 'Tus mascotas son pequeñitas y pasan por huecos.'],
    storm: ['Tormenta de premios', 'El doble de premios en el cielo.'],
  },
  goal: 'Meta: vuela {m} m',
  start: 'JUGAR EL RETO DE HOY',
  back: 'VOLVER',
  newIn: 'Nuevo reto en {t}',
  streak: 'Racha {n}',
  bestStreak: 'Mejor racha: {n}',
  newStreak: '¡Hoy empieza una racha nueva!',
  todayBest: 'Mejor de hoy: {s}',
  doneToday: '¡Hecho hoy! Repetir es solo por diversión.',
  replay: 'JUGAR OTRA VEZ',
  done: '¡Reto diario hecho!',
  banner: 'RETO: {t} · vuela {m} m',
  overDone: '¡Reto diario hecho!',
  overTry: 'Meta {m} m. Volaste {d} m. ¡Inténtalo otra vez!',
  win: {
    boss: '¡Lo lograste! Venciste a {v}',
    high: 'Nuevo récord: {v}',
    daily: '¡Reto diario hecho!',
    streak: '¡Racha de {v}! Muy bien',
  },
  ago: { now: 'ahora mismo', min: 'hace 1 minuto', mins: 'hace {n} minutos', hour: 'hace 1 hora', hours: 'hace {n} horas' },
};

const COPY: Partial<Record<string, DailyCopy>> = { en, es };

export function dailyCopy(lang: string): DailyCopy {
  return COPY[lang] ?? en;
}

export function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function relTime(lang: string, ms: number): string {
  const a = dailyCopy(lang).ago;
  const min = Math.floor(ms / 60000);
  if (min < 1) return a.now;
  if (min < 60) return min === 1 ? a.min : fill(a.mins, { n: min });
  const h = Math.floor(min / 60);
  return h === 1 ? a.hour : fill(a.hours, { n: h });
}
