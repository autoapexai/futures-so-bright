/**
 * LEVEL SELECT: every level 1-111 as a tile with a preview of the boss at its end (the big boss on
 * 10, 20 ... 110 and 111, the level's mini-boss on the others), drawn with that boss's own renderer
 * into a small cached canvas, lazily as tiles scroll in. Selecting a tile fills the preview card
 * (name, one-line blurb, BOSS / MINI-BOSS tag). GO TO LEVEL box (numeric keypad on phones; on a
 * keyboard just type the digits), quick-jump chips, PLAY LEVEL (start of the level) and FIGHT THE
 * BOSS (start right at the level's boss / mini-boss encounter; the game runs the real fight).
 * Mini-bosses past MINI_LIVE_MAX show a COMING SOON silhouette; the level itself stays playable.
 * Names come from the live defs (bossForLevel / miniBossForLevel), never a real person's name.
 */
import { BOSS_LEVELS, BossFight, bossForLevel, type Board, type BossDef } from './Boss';
import { drawMimeMini } from './bossMime';
import { drawToonMini } from './bossToons';
import { drawMini, miniBossForLevel, miniDesignForLevel } from './miniBoss';
import { lang, onLang, t as tr, type Lang } from '../i18n';
import { MAX_LEVEL } from '../utils/difficulty';

export interface LevelSelectHost {
  /** Touch-first device (no auto-focus of the number box, so no keypad pops up uninvited). */
  touch: boolean;
  start(level: number, fight: boolean): void;
  onToggle(open: boolean): void;
  sfx(): void;
}

export interface LevelSelect {
  open(firstDigit?: string): void;
  close(): void;
  isOpen(): boolean;
}

type Kind = 'boss' | 'mini' | 'soon';

interface Info {
  n: number;
  kind: Kind;
  def: BossDef | null;
  name: string;
  /** Cache key for the drawing (same character = same picture). */
  key: string;
  design: string;
}

const PICK_KEY = 'fsb-level-pick-v1';
const CHIPS = [1, ...BOSS_LEVELS];

/** Display-name safety net: mini-boss ids from before the pun-name rewrite map to the pun names. */
const PUN_ALIAS: Record<string, string> = {
  reiner: 'reindeer', seinfeld: 'sneezefeld', larry: 'divot', norm: 'macdoodle', letterman: 'lettuceman', brody: 'rowdy',
  pryor: 'fryer', foxx: 'socks', rogan: 'yogan', gaffigan: 'gigglegan', brooks: 'brooms', carl: 'elder',
};
const PUN_NAME: Record<string, string> = {
  reindeer: 'ROB REINDEER', sneezefeld: 'JERRY SNEEZEFELD', divot: 'LARRY DIVOT', macdoodle: 'NORM MACDOODLE', lettuceman: 'DAVID LETTUCEMAN',
  rowdy: 'ROWDY STEVENS', fryer: 'RICHARD FRYER', socks: 'RED SOCKS', yogan: 'JOE YOGAN', gigglegan: 'JIM GIGGLEGAN', brooms: 'MEL BROOMS',
  elder: 'CARL REINDEER',
};

/** One-line G-rated blurbs (preview card), by boss id / mini-boss character. */
const BLURB: Record<Lang, Record<string, string>> = {
  en: {
    mime: 'A mime on a tiny tricycle who copies your moves upside down.',
    calvin: 'Two stretchy-necked pantomime horses on parachutes, tossing horseshoes and carrots.',
    decoy: 'A shell-game magician and his cardboard double who swap places with a POOF.',
    buckle: 'Bursts out of a cake with popping buckles and disco-ball moves.',
    daly: 'An auditioning cowboy who swings in on a lasso, with tumbleweeds and a rubber chicken.',
    toosuccessful: 'A gold trophy robot on rocket boots that rains coins and gold bars.',
    alw: 'An opera-diva chandelier with a chorus of masks and a very high note.',
    slackerman: 'A bedsheet ghost in a recliner at the midnight movie, tossing popcorn.',
    cbb: 'A clown on a cannon whose confetti bombs burst into rubber ducks.',
    curry: 'An 80s VJ with a TV for a head, zapping static walls and cassette tapes.',
    dvorak: 'A grumpy cherub on a cloud who sends feathers from behind you.',
    itm: 'A giant googly-eyed brain in a propeller cap: the final boss of level 111.',
    reindeer: 'A movie-directing reindeer who yells CUT! and throws clapperboards.',
    sneezefeld: 'Notices everything, sneezes at everything, and throws tissues.',
    divot: 'A fussy golfer who chips golf balls and spills his coffee.',
    macdoodle: 'Doodles moths that flutter straight at your pack.',
    lettuceman: 'A late-night salad host who tosses cue cards and pencils.',
    rowdy: 'The loudest cheerleader in baseball: fastballs and flying caps.',
    fryer: 'A short-order cook flipping eggs and pancakes your way.',
    socks: 'Ruler of the laundry pile, raining socks and old boots.',
    yogan: 'A super-stretchy yoga podcaster with flying mics and dumbbells.',
    gigglegan: 'A sleepy snacker who rains pocket snacks and bacon.',
    brooms: 'A silly king with a broom who tosses crowns and top hats.',
    elder: 'The original reindeer, 2,000 years young, rolling wheels and hourglasses.',
  },
  es: {
    mime: 'Un mimo en un triciclo diminuto que copia tus movimientos al revés.',
    calvin: 'Dos caballos de pantomima de cuello elástico en paracaídas que lanzan herraduras y zanahorias.',
    decoy: 'Un mago del trile y su doble de cartón que cambian de lugar con un ¡PUF!',
    buckle: 'Sale de un pastel con hebillas que saltan y pasos de bola de disco.',
    daly: 'Un vaquero de audición que llega colgado de un lazo, con plantas rodadoras y un pollo de goma.',
    toosuccessful: 'Un robot trofeo dorado con botas cohete que hace llover monedas y lingotes.',
    alw: 'Una lámpara de araña, diva de la ópera, con un coro de máscaras y una nota altísima.',
    slackerman: 'Un fantasma de sábana en un sillón reclinable en la función de medianoche, lanzando palomitas.',
    cbb: 'Un payaso sobre un cañón cuyas bombas de confeti se convierten en patitos de goma.',
    curry: 'Un VJ de los 80 con una tele por cabeza que lanza muros de estática y casetes.',
    dvorak: 'Un querubín gruñón en una nube que te lanza plumas por la espalda.',
    itm: 'Un cerebro gigante de ojos saltones con gorra de hélice: el jefe final del nivel 111.',
    reindeer: 'Un reno director de cine que grita ¡CORTEN! y lanza claquetas.',
    sneezefeld: 'Se fija en todo, estornuda por todo y lanza pañuelos.',
    divot: 'Un golfista quisquilloso que lanza pelotas de golf y derrama su café.',
    macdoodle: 'Dibuja polillas que vuelan directo hacia tu manada.',
    lettuceman: 'Un presentador nocturno de ensaladas que lanza tarjetas y lápices.',
    rowdy: 'El animador más ruidoso del béisbol: bolas rápidas y gorras voladoras.',
    fryer: 'Un cocinero rápido que te lanza huevos y panqueques.',
    socks: 'El rey del montón de ropa sucia: llueven calcetines y botas viejas.',
    yogan: 'Un podcaster de yoga superflexible con micrófonos y pesas voladoras.',
    gigglegan: 'Un comelón dormilón que hace llover botanas y tocino.',
    brooms: 'Un rey bromista con una escoba que lanza coronas y sombreros de copa.',
    elder: 'El reno original, con 2000 años de juventud, que hace rodar ruedas y relojes de arena.',
  },
  vi: {
    mime: 'Chú hề kịch câm trên chiếc xe ba bánh tí hon, bắt chước bạn theo kiểu lộn ngược.',
    calvin: 'Hai chú ngựa hóa trang cổ dài đu dù, ném móng ngựa và cà rốt.',
    decoy: 'Ảo thuật gia tráo cốc và bản sao bằng bìa cứng, đổi chỗ trong một tiếng BỤP.',
    buckle: 'Nhảy ra từ chiếc bánh kem với khóa thắt lưng bật tung và điệu nhảy disco.',
    daly: 'Chàng cao bồi đi thử vai, đu dây thòng lọng vào sân, kèm bụi cỏ lăn và gà cao su.',
    toosuccessful: 'Rô-bốt cúp vàng đi giày tên lửa, thả mưa xu và thỏi vàng.',
    alw: 'Chiếc đèn chùm diva opera cùng dàn hợp xướng mặt nạ và nốt cao chót vót.',
    slackerman: 'Con ma trùm khăn trải giường ngồi ghế tựa xem phim nửa đêm, ném bắp rang.',
    cbb: 'Chú hề cưỡi đại bác, bom hoa giấy nổ ra toàn vịt cao su.',
    curry: 'VJ thập niên 80 có cái đầu là tivi, bắn tường nhiễu sóng và băng cát-xét.',
    dvorak: 'Thiên thần nhỏ khó tính ngồi trên mây, phóng lông vũ từ phía sau bạn.',
    itm: 'Bộ não khổng lồ mắt lồi đội mũ chong chóng: trùm cuối của cấp 111.',
    reindeer: 'Chú tuần lộc đạo diễn hô CẮT! và ném bảng phân cảnh.',
    sneezefeld: 'Để ý mọi thứ, hắt xì vì mọi thứ, và ném khăn giấy.',
    divot: 'Tay golf khó tính đánh bóng golf tứ tung và làm đổ cà phê.',
    macdoodle: 'Vẽ nguệch ngoạc những con bướm đêm bay thẳng vào đàn chó của bạn.',
    lettuceman: 'MC đêm khuya mê rau xà lách, ném thẻ nhắc lời và bút chì.',
    rowdy: 'Người cổ vũ ồn ào nhất làng bóng chày: bóng ném nhanh và mũ bay.',
    fryer: 'Đầu bếp nhanh tay lật trứng và bánh kếp về phía bạn.',
    socks: 'Vua của đống đồ giặt, thả mưa tất và ủng cũ.',
    yogan: 'Podcaster yoga siêu dẻo với micro và tạ bay tứ tung.',
    gigglegan: 'Anh chàng ham ăn buồn ngủ, thả mưa bánh kẹp và thịt xông khói.',
    brooms: 'Ông vua ngộ nghĩnh cầm chổi, ném vương miện và mũ chóp cao.',
    elder: 'Tuần lộc đời đầu, 2.000 tuổi xuân, lăn bánh xe và đồng hồ cát.',
  },
  zh: {
    mime: '骑着迷你三轮车的哑剧演员，会倒过来模仿你的动作。',
    calvin: '两匹长脖子的哑剧马挂着降落伞，扔马蹄铁和胡萝卜。',
    decoy: '玩猜杯戏法的魔术师和他的纸板替身，“噗”的一声就换位置。',
    buckle: '从蛋糕里蹦出来，皮带扣乱飞，还跳迪斯科。',
    daly: '来试镜的牛仔甩着套索荡进来，带着风滚草和橡皮鸡。',
    toosuccessful: '穿火箭靴的金奖杯机器人，下起金币和金条雨。',
    alw: '歌剧女高音吊灯，带着一群面具合唱团和超高音。',
    slackerman: '披着床单的幽灵躺在躺椅上看午夜电影，扔爆米花。',
    cbb: '坐在大炮上的小丑，彩纸炸弹一炸就变成橡皮鸭。',
    curry: '八十年代的电视头 VJ，发射雪花屏墙和磁带。',
    dvorak: '坐在云上爱唱反调的小天使，从你背后射来羽毛。',
    itm: '戴螺旋桨帽的大眼睛巨型大脑：第111关的最终头目。',
    reindeer: '当电影导演的驯鹿，大喊“咔！”还扔场记板。',
    sneezefeld: '什么都注意，什么都打喷嚏，还扔纸巾。',
    divot: '挑剔的高尔夫球手，乱打高尔夫球还洒了咖啡。',
    macdoodle: '随手画的飞蛾直冲你的狗群飞来。',
    lettuceman: '深夜沙拉节目主持人，扔提词卡和铅笔。',
    rowdy: '棒球场上嗓门最大的啦啦队长：快速球和满天飞的帽子。',
    fryer: '快餐厨师把煎蛋和松饼翻向你。',
    socks: '脏衣服堆之王，下起袜子和旧靴子雨。',
    yogan: '超级柔软的瑜伽播客主，麦克风和哑铃满天飞。',
    gigglegan: '又困又爱吃零食的家伙，下起口袋零食和培根雨。',
    brooms: '拿着扫帚的搞笑国王，扔王冠和高礼帽。',
    elder: '元老级驯鹿，青春两千岁，滚来车轮和沙漏。',
  },
};

function designOf(n: number): string {
  const d = miniDesignForLevel(n) ?? '';
  return PUN_ALIAS[d] ?? d;
}

const infoCache = new Map<number, Info>();
function info(n: number): Info {
  const hit = infoCache.get(n);
  if (hit) return hit;
  let out: Info;
  const big = bossForLevel(n);
  if (big) out = { n, kind: 'boss', def: big, name: big.name, key: `b-${big.modeId}`, design: big.modeId };
  else {
    const live = miniBossForLevel(n);
    const design = designOf(n);
    // Old internal ids show their pun name; current defs already carry it.
    const old = PUN_ALIAS[live?.mini?.design ?? ''];
    if (live) out = { n, kind: 'mini', def: live, name: old ? PUN_NAME[old] : live.name, key: `m-${design}`, design };
    else out = { n, kind: 'soon', def: miniBossForLevel(n, true), name: '', key: `s-${design}`, design };
  }
  infoCache.set(n, out);
  return out;
}

function blurbOf(i: Info): string {
  if (i.kind === 'soon') return tr('ls_soon_blurb');
  const b = BLURB[lang()]?.[i.design] ?? BLURB.en[i.design];
  if (b) return b;
  if (i.kind === 'boss' && i.def) return i.def.blurb.split(';')[0];
  return '';
}

function nameOf(i: Info): string {
  return i.kind === 'soon' ? tr('ls_soon') : i.name;
}

// ---------------------------------------------------------------------------------------------
// Drawing (the bosses' own renderers)
// ---------------------------------------------------------------------------------------------

const fights = new Map<number, { f: BossFight; b: Board }>();
function miniFight(def: BossDef): { f: BossFight; b: Board } {
  let hit = fights.get(def.level);
  if (!hit) {
    const f = new BossFight(def, 1);
    f.state = 'fight';
    f.stateT = 9;
    hit = { f, b: { x: 0, y: 0, w: 0, h: 0, real: true, rows: 3, spot: 1, bob: 0 } };
    fights.set(def.level, hit);
  }
  return hit;
}

/** Draw level i's boss centred in a w x h box (CSS px, ctx already scaled). */
function paint(ctx: CanvasRenderingContext2D, i: Info, w: number, h: number, t: number): void {
  const def = i.def;
  if (!def) return;
  ctx.save();
  try {
    if (i.kind === 'boss') {
      const s = Math.min(w, h * 1.05);
      if (def.signature === 'mirror') drawMimeMini(ctx, w / 2, h * 0.47, s * 0.62, s * 0.86, t);
      else if (!drawToonMini(ctx, def.modeId, w / 2, h * 0.5, s * 0.66, s * 0.82, t)) blob(ctx, w, h, def.tint);
    } else {
      const { f, b } = miniFight(def);
      b.h = h * 0.8;
      b.w = Math.min(w * 0.62, b.h * 0.72);
      b.x = w / 2 + b.w * 0.18;
      b.y = h * 0.52;
      drawMini(ctx, f, b, t, w);
    }
  } catch {
    blob(ctx, w, h, def.tint);
  }
  ctx.restore();
}

function blob(ctx: CanvasRenderingContext2D, w: number, h: number, tint: string): void {
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.55, w * 0.22, h * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** COMING SOON: the character's outline as a soft purple silhouette with a gold "?". */
function paintSoon(ctx: CanvasRenderingContext2D, i: Info, w: number, h: number, dpr: number): void {
  const off = document.createElement('canvas');
  off.width = Math.ceil(w * dpr);
  off.height = Math.ceil(h * dpr);
  const o = off.getContext('2d');
  if (!o) return;
  o.scale(dpr, dpr);
  paint(o, i, w, h, 0.4);
  o.globalCompositeOperation = 'source-in';
  o.fillStyle = '#3b2a6e';
  o.fillRect(0, 0, w, h);
  ctx.drawImage(off, 0, 0, w, h);
  ctx.fillStyle = '#ffe66d';
  ctx.font = `900 ${Math.round(h * 0.42)}px 'Orbitron', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255, 230, 109, 0.6)';
  ctx.shadowBlur = 8;
  ctx.fillText('?', w / 2, h * 0.52);
}

const thumbs = new Map<string, HTMLCanvasElement>();
function thumb(i: Info, w: number, h: number, dpr: number): HTMLCanvasElement {
  const k = `${i.key}|${w}x${h}|${dpr}|${lang()}`;
  let c = thumbs.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
    if (i.kind === 'soon') paintSoon(ctx, i, w, h, dpr);
    else paint(ctx, i, w, h, 0.4);
  }
  thumbs.set(k, c);
  return c;
}

// ---------------------------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------------------------

function loadPick(): number {
  try {
    const n = Math.round(Number(localStorage.getItem(PICK_KEY)));
    return n >= 1 && n <= MAX_LEVEL ? n : 1;
  } catch {
    return 1;
  }
}

function savePick(n: number): void {
  try {
    localStorage.setItem(PICK_KEY, String(n));
  } catch {
    /* private mode: just not remembered */
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createLevelSelect(host: LevelSelectHost): LevelSelect {
  let root: HTMLDivElement | null = null;
  let openNow = false;
  let sel = loadPick();
  let lastDigitAt = 0;
  let raf = 0;
  let io: IntersectionObserver | null = null;
  const tiles: HTMLButtonElement[] = [];
  let grid: HTMLDivElement;
  let num: HTMLInputElement;
  let err: HTMLParagraphElement;
  let big: HTMLCanvasElement;
  let cTag: HTMLSpanElement;
  let cLvl: HTMLSpanElement;
  let cName: HTMLParagraphElement;
  let cBlurb: HTMLParagraphElement;
  let play: HTMLButtonElement;
  let fight: HTMLButtonElement;
  const dpr = (): number => Math.min(2, Math.max(1, window.devicePixelRatio || 1));

  const drawTile = (tile: HTMLButtonElement): void => {
    const c = tile.querySelector('canvas');
    if (!c || c.dataset.drawn === lang()) return;
    const n = Number(tile.dataset.n);
    const w = c.clientWidth || 64;
    const h = c.clientHeight || 48;
    const d = dpr();
    c.width = Math.ceil(w * d);
    c.height = Math.ceil(h * d);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(thumb(info(n), w, h, d), 0, 0, c.width, c.height);
    c.dataset.drawn = lang();
  };

  const label = (): void => {
    if (!root) return;
    root.setAttribute('aria-label', tr('ls_title'));
    root.querySelector('.ls-title')!.textContent = tr('ls_title');
    root.querySelector('.ls-go-label')!.textContent = tr('ls_goto');
    root.querySelector('.ls-x')!.setAttribute('aria-label', tr('ls_close'));
    root.querySelector('.ls-hint')!.textContent = tr('ls_hint_keys');
    play.textContent = tr('ls_play');
    fight.textContent = tr('ls_fight');
    for (const tile of tiles) {
      const i = info(Number(tile.dataset.n));
      tile.querySelector('.ls-tname')!.textContent = nameOf(i);
      tile.setAttribute('aria-label', tr('ls_tile_aria', { n: i.n, k: tr(i.kind === 'boss' ? 'ls_boss' : 'ls_mini'), b: nameOf(i) }));
      const badge = tile.querySelector('.ls-badge');
      if (badge) badge.textContent = i.kind === 'boss' ? tr('ls_boss') : '';
    }
    showCard();
  };

  const showCard = (): void => {
    const i = info(sel);
    cTag.textContent = tr(i.kind === 'boss' ? 'ls_boss' : 'ls_mini');
    cTag.className = `ls-ctag ${i.kind}`;
    cLvl.textContent = tr('ls_level', { n: sel });
    cName.textContent = nameOf(i);
    cBlurb.textContent = blurbOf(i);
    fight.disabled = i.kind === 'soon';
    fight.title = i.kind === 'soon' ? tr('ls_soon') : '';
    root?.querySelector('.ls-card')?.setAttribute('data-kind', i.kind);
    drawBig(performance.now() / 1000);
  };

  const drawBig = (t: number): void => {
    const w = big.clientWidth;
    const h = big.clientHeight;
    if (!w || !h) return;
    const d = dpr();
    if (big.width !== Math.ceil(w * d) || big.height !== Math.ceil(h * d)) {
      big.width = Math.ceil(w * d);
      big.height = Math.ceil(h * d);
    }
    const ctx = big.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, big.width, big.height);
    const i = info(sel);
    if (i.kind === 'soon') {
      ctx.drawImage(thumb(i, w, h, d), 0, 0, big.width, big.height);
      return;
    }
    ctx.scale(d, d);
    paint(ctx, i, w, h, t);
  };

  const loop = (): void => {
    if (!openNow) return;
    drawBig(performance.now() / 1000);
    raf = requestAnimationFrame(loop);
  };

  const scrollTo = (n: number, center: boolean): void => {
    const tile = tiles[n - 1];
    if (!tile) return;
    const top = tile.offsetTop - grid.offsetTop;
    const bottom = top + tile.offsetHeight;
    if (center) grid.scrollTop = Math.max(0, top - (grid.clientHeight - tile.offsetHeight) / 2);
    else if (top < grid.scrollTop) grid.scrollTop = top - 4;
    else if (bottom > grid.scrollTop + grid.clientHeight) grid.scrollTop = bottom - grid.clientHeight + 4;
  };

  const select = (n: number, how: 'tap' | 'jump' | 'key' | 'init'): void => {
    const next = Math.min(MAX_LEVEL, Math.max(1, Math.round(n)));
    tiles[sel - 1]?.classList.remove('sel');
    tiles[sel - 1]?.setAttribute('aria-selected', 'false');
    sel = next;
    const tile = tiles[sel - 1];
    tile?.classList.add('sel');
    tile?.setAttribute('aria-selected', 'true');
    if (how !== 'init' || !num.value) num.value = String(sel);
    if (how !== 'tap') scrollTo(sel, how !== 'key');
    if (how === 'key') tile?.focus({ preventScroll: true });
    err.textContent = '';
    showCard();
    if (how !== 'init') host.sfx();
  };

  const fromBox = (): void => {
    const v = num.value.replace(/\D/g, '').slice(0, 3);
    if (v !== num.value) num.value = v;
    if (!v) {
      err.textContent = '';
      return;
    }
    const n = Number(v);
    if (n >= 1 && n <= MAX_LEVEL) {
      select(n, 'jump');
      num.value = v;
    } else err.textContent = tr('ls_bad');
  };

  const go = (doFight: boolean): void => {
    if (doFight && info(sel).kind === 'soon') return;
    savePick(sel);
    close();
    host.start(sel, doFight);
  };

  const cols = (): number => {
    const top = tiles[0]?.offsetTop ?? 0;
    let c = 0;
    while (c < tiles.length && tiles[c].offsetTop === top) c++;
    return Math.max(1, c);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (!openNow) return;
    // The game never sees keys while LEVEL SELECT is up.
    e.stopPropagation();
    const k = e.key;
    const inBox = e.target === num;
    if (k === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (/^[0-9]$/.test(k) && !inBox) {
      // Just type the number: digits within 1.2 s build it ("5", "7" -> 57).
      e.preventDefault();
      const now = performance.now();
      const keep = now - lastDigitAt < 1200 && num.value.length < 3 ? num.value : '';
      lastDigitAt = now;
      num.value = keep + k;
      fromBox();
      return;
    }
    if (inBox) {
      if (k === 'Enter') {
        e.preventDefault();
        fromBox();
        if (host.touch) num.blur();
        else play.focus();
      }
      return;
    }
    if (k === 'Backspace') {
      e.preventDefault();
      num.value = num.value.slice(0, -1);
      lastDigitAt = performance.now();
      fromBox();
      return;
    }
    const t = e.target as HTMLElement | null;
    const onTile = !!t?.classList?.contains('ls-tile') || t === root || t === grid;
    const step = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : k === 'ArrowUp' ? -cols() : k === 'ArrowDown' ? cols() : 0;
    if (step && (onTile || !t?.closest?.('.ls-chips'))) {
      e.preventDefault();
      select(sel + step, 'key');
      return;
    }
    if (k === 'Home' || k === 'End') {
      e.preventDefault();
      select(k === 'Home' ? 1 : MAX_LEVEL, 'key');
      return;
    }
    if (k === 'f' || k === 'F') {
      e.preventDefault();
      go(true);
      return;
    }
    if (k === 'Enter' && !(t instanceof HTMLButtonElement && !onTile)) {
      // Enter on a tile (or nowhere): PLAY LEVEL. On a button, the button's own action.
      e.preventDefault();
      go(false);
    }
  };

  const build = (): void => {
    root = el('div');
    root.id = 'lvl-select';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.tabIndex = -1;
    const panel = el('div', 'ls-panel');
    const head = el('div', 'ls-head');
    const title = el('h2', 'ls-title');
    const goLbl = el('label', 'ls-go');
    const goTxt = el('span', 'ls-go-label');
    num = el('input', 'ls-num');
    num.type = 'text';
    num.inputMode = 'numeric';
    num.pattern = '[0-9]*';
    num.maxLength = 3;
    num.autocomplete = 'off';
    num.setAttribute('enterkeyhint', 'go');
    num.setAttribute('aria-describedby', 'ls-err');
    goLbl.append(goTxt, num);
    const x = el('button', 'ls-x', '✕');
    x.type = 'button';
    head.append(title, goLbl, x);
    err = el('p', 'ls-err');
    err.id = 'ls-err';
    err.setAttribute('role', 'status');
    const chips = el('div', 'ls-chips');
    for (const n of CHIPS) {
      const c = el('button', `ls-chip${n === 1 ? '' : ' boss'}`, String(n));
      c.type = 'button';
      c.addEventListener('click', () => select(n, 'jump'));
      chips.append(c);
    }
    grid = el('div', 'ls-grid');
    grid.setAttribute('role', 'listbox');
    for (let n = 1; n <= MAX_LEVEL; n++) {
      const i = info(n);
      const tile = el('button', `ls-tile ${i.kind}${n >= 11 ? ' gold' : ''}`);
      tile.type = 'button';
      tile.dataset.n = String(n);
      tile.setAttribute('role', 'option');
      tile.setAttribute('aria-selected', 'false');
      const num2 = el('span', 'ls-n', String(n));
      const cv = el('canvas', 'ls-thumb');
      cv.setAttribute('aria-hidden', 'true');
      const nm = el('span', 'ls-tname');
      tile.append(num2, cv, nm);
      if (i.kind === 'boss') tile.append(el('span', 'ls-badge'));
      tile.addEventListener('click', () => {
        if (sel === n) {
          // Second tap on the picked tile: hop to PLAY LEVEL (Enter / tap there starts).
          play.focus({ preventScroll: true });
          return;
        }
        select(n, 'tap');
      });
      tiles.push(tile);
      grid.append(tile);
    }
    const card = el('div', 'ls-card');
    big = el('canvas', 'ls-big');
    big.setAttribute('aria-hidden', 'true');
    const infoBox = el('div', 'ls-info');
    const meta = el('p', 'ls-meta');
    cTag = el('span', 'ls-ctag');
    cLvl = el('span', 'ls-clvl');
    meta.append(cTag, cLvl);
    cName = el('p', 'ls-cname');
    cBlurb = el('p', 'ls-blurb');
    infoBox.append(meta, cName, cBlurb);
    const acts = el('div', 'ls-acts');
    play = el('button', 'ls-play');
    play.type = 'button';
    fight = el('button', 'ls-fight');
    fight.type = 'button';
    acts.append(play, fight);
    card.append(big, infoBox, acts);
    const hint = el('p', 'ls-hint');
    const left = el('div', 'ls-left');
    left.append(head, err, chips, grid, hint);
    panel.append(left, card);
    root.append(panel);
    (document.getElementById('app') ?? document.body).append(root);

    // Taps / keys / scrolls here never reach the game (canvas taps start runs; the document
    // blocks touchmove to stop page scroll, which would freeze the grid).
    const stop = (e: Event): void => e.stopPropagation();
    for (const ev of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend', 'touchmove', 'wheel', 'keyup']) root.addEventListener(ev, stop);
    root.addEventListener('click', (e) => {
      if (e.target === root) close();
    });
    x.addEventListener('click', () => close());
    play.addEventListener('click', () => go(false));
    fight.addEventListener('click', () => go(true));
    num.addEventListener('input', () => {
      lastDigitAt = performance.now();
      fromBox();
    });
    num.addEventListener('focus', () => num.select());
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            if (!en.isIntersecting) continue;
            drawTile(en.target as HTMLButtonElement);
            io?.unobserve(en.target);
          }
        },
        { root: grid, rootMargin: '120px 0px' },
      );
    }
    onLang(() => {
      if (!root) return;
      infoCache.clear();
      for (const tile of tiles) {
        const c = tile.querySelector('canvas');
        if (c) delete c.dataset.drawn;
      }
      label();
      if (openNow) observe();
    });
  };

  const observe = (): void => {
    for (const tile of tiles) {
      const c = tile.querySelector('canvas');
      if (c?.dataset.drawn === lang()) continue;
      if (io) io.observe(tile);
      else drawTile(tile);
    }
  };

  const open = (firstDigit?: string): void => {
    if (openNow) return;
    if (!root) build();
    if (!root) return;
    openNow = true;
    root.classList.add('open');
    root.setAttribute('aria-hidden', 'false');
    window.addEventListener('keydown', onKey, true);
    host.onToggle(true);
    label();
    num.value = '';
    select(sel, 'init');
    scrollTo(sel, true);
    observe();
    if (firstDigit) {
      num.value = firstDigit;
      lastDigitAt = performance.now();
      fromBox();
    }
    if (host.touch) root.focus({ preventScroll: true });
    else tiles[sel - 1]?.focus({ preventScroll: true });
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  };

  function close(): void {
    if (!openNow || !root) return;
    openNow = false;
    cancelAnimationFrame(raf);
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    window.removeEventListener('keydown', onKey, true);
    (document.activeElement as HTMLElement | null)?.blur?.();
    host.onToggle(false);
  }

  return { open, close, isOpen: () => openNow };
}
