/**
 * MINI-BOSSES: a short, punchy fight at the end of every level that has no big boss (1-9, 11-19,
 * ... 101-109). The big bosses on 10, 20, ... 110 and 111 are untouched (see Boss.ts).
 *
 * GATE: the level timer ends in the mini-boss fight and the level is only passed once it is
 * beaten. Mini-bosses never get bored and leave (big bosses still do), however long you survive.
 * Beating one is worth 1,000 x level points, times the GAME SPEED (scalePoints), still capped.
 *
 * Every mini-boss is an original deadpan sight-gag character (G-rated slapstick: pratfalls,
 * literal-minded signs, props that misbehave) drawn smaller than any big boss and labelled
 * MINI-BOSS. Level 1 is ROB REINER (Dan's pick); the rest rotate through eight designs.
 * Difficulty rises smoothly with the level (miniTuning) and always stays well below the big
 * bosses, including the eased L60 and L90 fights, so there is no spike next to them.
 * The fight itself reuses BossFight (barks, weak spot, stun rings, shots) with a def.mini spec.
 */
import type { Board, BossDef, BossFight, BossShot, BossTuning, Pattern, PopSfx } from './Boss';
import { fmtNum, lang, type Lang } from '../i18n';
import { eyes, glow, mouth, speech, star, type Pose } from './bossToons';

export interface MiniSpec {
  design: Design;
  /** Shot costume per attack pattern (drawn by drawMiniShot). */
  skins: Record<string, string>;
  /** Weak-spot hit bursts and the stun burst, in the current language. */
  pops: () => [string, PopSfx][];
  stunPop: () => string;
}

type Design = 'reiner' | 'signpost' | 'detective' | 'captain' | 'cart' | 'banana' | 'luggage' | 'doctor' | 'weather';

/** Points per level for beating a mini-boss (x level, x GAME SPEED). */
export const MINI_POINTS_PER_LEVEL = 1000;

interface DesignDef {
  name: string;
  tint: string;
  /** Signature attack (first, so it comes up twice per attack cycle). */
  sig: Pattern;
  skins: Record<string, string>;
  sfx: [PopSfx, PopSfx, PopSfx];
}

const DESIGNS: Record<Design, DesignDef> = {
  reiner: { name: 'ROB REINER', tint: '#ffd166', sig: 'spray', skins: { aimed: 'clap', spray: 'reel' }, sfx: ['honk', 'boing', 'whistleUp'] },
  signpost: { name: 'SERGEANT SIGNPOST', tint: '#ffe14d', sig: 'tumble', skins: { tumble: 'sign', aimed: 'sign', wall: 'cone', spray: 'cone' }, sfx: ['honk', 'boing', 'honk'] },
  detective: { name: 'DETECTIVE DROPSY', tint: '#d9b27a', sig: 'rain', skins: { rain: 'donut', aimed: 'glass', wall: 'donut', spray: 'glass' }, sfx: ['whistleUp', 'honk', 'boing'] },
  captain: { name: 'CAPTAIN LITERAL', tint: '#7fc8ff', sig: 'homing', skins: { homing: 'plane', aimed: 'peanut', wall: 'peanut', spray: 'plane' }, sfx: ['whistleUp', 'whistleDown', 'honk'] },
  cart: { name: 'THE RUNAWAY SNACK CART', tint: '#ff8fa3', sig: 'spray', skins: { spray: 'pretzel', aimed: 'ice', wall: 'ice' }, sfx: ['whistleUp', 'honk', 'boing'] },
  banana: { name: 'THE BANANA BANDIT', tint: '#fff06a', sig: 'dots', skins: { dots: 'peel', aimed: 'peel', wall: 'peel', spray: 'peel' }, sfx: ['whistleDown', 'boing', 'whistleUp'] },
  luggage: { name: 'THE LOST LUGGAGE', tint: '#ff9f43', sig: 'buckles', skins: { buckles: 'sock', aimed: 'brush', wall: 'sock', spray: 'brush' }, sfx: ['honk', 'boing', 'honk'] },
  doctor: { name: 'DR. STRAIGHTFACE', tint: '#9ff0ff', sig: 'spray', skins: { spray: 'stick', aimed: 'bandage', wall: 'bandage' }, sfx: ['boing', 'honk', 'honk'] },
  weather: { name: 'THE WRONG WEATHERMAN', tint: '#a0e8ff', sig: 'rain', skins: { rain: 'drop', aimed: 'flake', wall: 'cloud', spray: 'flake' }, sfx: ['whistleDown', 'boing', 'whistleUp'] },
};

/**
 * Easing per mini-boss id (merged into Boss.ts EASE): at high GAME SPEED volleys never come
 * faster than one per realFire wall-clock seconds, shots never look faster than realShot px/s,
 * telegraphs keep realTele s and the weak spot stays put at least realDwell s (at 1.0 nothing
 * changes: the game-time values are longer). Tall lanes: stun rings turn up near the pack.
 */
export const MINI_EASE: Record<string, { realTele: number; realFire: number; realShot: number; realDwell: number; ringNear: number }> = Object.fromEntries(
  (['reiner', 'signpost', 'detective', 'captain', 'cart', 'banana', 'luggage', 'doctor', 'weather'] as const).map((d) => [`mini-${d}`, { realTele: 0.45, realFire: 0.6, realShot: 900, realDwell: 0.8, ringNear: 260 }]),
);

/** Levels 2-109 rotate through these (level 1 is ROB REINER). */
const ROTATION: Design[] = ['signpost', 'detective', 'captain', 'cart', 'banana', 'luggage', 'doctor', 'weather'];

interface Words {
  taunts: [string, string, string];
  pops: [string, string, string];
  stun: string;
  /** Said during the pratfall. */
  fall: string;
  /** Prop text drawn on the character (a sign, a chair back), if any. */
  prop?: string;
}

interface LangText {
  tag: string;
  gate: string;
  beaten: string;
  words: Record<Design, Words>;
}

const TEXT: Record<Lang, LangText> = {
  en: {
    tag: 'MINI-BOSS',
    gate: 'BEAT IT TO PASS LEVEL {n}',
    beaten: 'MINI-BOSS BEATEN  ·  +{p}',
    words: {
      reiner: { taunts: ['ACTION! WAIT, WHO CAST ALL THESE DOGS?', 'FROM THE TOP. THIS TIME WITH LESS BARKING.', 'I SAID CUT, NOT WOOF.'], pops: ['CUT!', 'TAKE TWO!', 'ACTION!'], stun: 'QUIET ON SET!', fall: "THAT'S A WRAP!", prop: 'ROB' },
      signpost: { taunts: ['PLEASE OBEY ALL SIGNS. ESPECIALLY ME.', 'CAUTION: SLIPPERY WHEN SMUG.', 'YIELD! NO, NOT LIKE THAT.'], pops: ['CLANG!', 'TWANG!', 'BONK!'], stun: 'DETOUR!', fall: 'OOPS!', prop: 'SIGN' },
      detective: { taunts: ['I HAVE CRACKED THE CASE: YOU ARE A DOG.', 'NOTHING TO SEE HERE. I CHECKED. TWICE.', 'STAND BACK. THIS DONUT IS EVIDENCE.'], pops: ['CLUE!', 'OOF!', 'BONK!'], stun: 'CASE CLOSED?', fall: 'OOF!' },
      captain: { taunts: ['THIS IS YOUR CAPTAIN. I AM IN CHARGE OF THE CAPTAINING.', 'PLEASE KEEP YOUR PAWS INSIDE THE GAME AT ALL TIMES.', 'WE ARE NOW FLYING. THAT IS THE AIRPLANE PART.'], pops: ['DING!', 'WHOOSH!', 'BONK!'], stun: 'TURBULENCE!', fall: 'PARACHUTE!', prop: 'PILOT' },
      cart: { taunts: ['SNACKS? NO. ONLY PROJECTILES.', 'PLEASE RETURN YOUR TRAY TABLE. AND YOUR DOGS.', 'ALL FOUR WHEELS SQUEAK. IT IS A FEATURE.'], pops: ['DING!', 'CLINK!', 'SQUEAK!'], stun: 'PARKING BRAKE!', fall: 'SQUEEEAK!' },
      banana: { taunts: ['I FIND YOUR DODGING VERY A-PEELING.', 'THIS IS A STICK-UP. WELL, MORE OF A BUNCH-UP.', 'MIND THE PEEL. AND THAT PEEL. AND THAT ONE.'], pops: ['SLIP!', 'SPLAT!', 'WHEE!'], stun: 'PEELED!', fall: 'WHOOPS!' },
      luggage: { taunts: ['I HAVE BEEN TO 40 AIRPORTS. NONE ON PURPOSE.', 'THIS BAG IS OVER THE WEIGHT LIMIT FOR FUN.', 'PLEASE DO NOT LEAVE YOUR DOGS UNATTENDED.'], pops: ['THUD!', 'ZIP!', 'FLOMP!'], stun: 'WRONG CAROUSEL!', fall: 'ZZZIP!' },
      doctor: { taunts: ['THE DIAGNOSIS IS SERIOUS: TOO MUCH FUN.', 'SAY AH. NOT YOU. THE DOGS.', 'I AM A DOCTOR. THESE ARE MY SERIOUS EYEBROWS.'], pops: ['BOINK!', 'AHEM!', 'BONK!'], stun: 'SECOND OPINION!', fall: 'NEXT!' },
      weather: { taunts: ["TODAY'S FORECAST: A 100% CHANCE OF ME.", 'EXPECT LIGHT SHOWERS OF EVERYTHING.', 'THE SUN WILL BE OUT LATER. I ASKED NICELY.'], pops: ['DRIP!', 'SPLISH!', 'FWOOSH!'], stun: 'FORECAST: DIZZY!', fall: 'WHOOSH!' },
    },
  },
  es: {
    tag: 'MINIJEFE',
    gate: '¡VÉNCELO PARA PASAR EL NIVEL {n}!',
    beaten: 'MINIJEFE K.O.  ·  +{p}',
    words: {
      reiner: { taunts: ['¡ACCIÓN! ESPERA, ¿QUIÉN CONTRATÓ A TANTOS PERROS?', 'DESDE EL PRINCIPIO. ESTA VEZ CON MENOS LADRIDOS.', 'DIJE «CORTEN», NO «GUAU».'], pops: ['¡CORTEN!', '¡TOMA DOS!', '¡ACCIÓN!'], stun: '¡SILENCIO EN EL SET!', fall: '¡FIN DEL RODAJE!', prop: 'ROB' },
      signpost: { taunts: ['OBEDEZCA TODAS LAS SEÑALES. SOBRE TODO A MÍ.', 'PRECAUCIÓN: RESBALA CUANDO PRESUME.', '¡CEDA EL PASO! NO, ASÍ NO.'], pops: ['¡CLANC!', '¡TOING!', '¡BONK!'], stun: '¡DESVÍO!', fall: '¡UY!', prop: 'LETRERO' },
      detective: { taunts: ['CASO RESUELTO: ERES UN PERRO.', 'AQUÍ NO HAY NADA QUE VER. LO REVISÉ. DOS VECES.', 'ATRÁS. ESTA DONA ES UNA PRUEBA.'], pops: ['¡PISTA!', '¡UF!', '¡BONK!'], stun: '¿CASO CERRADO?', fall: '¡UF!' },
      captain: { taunts: ['LES HABLA SU CAPITÁN. YO ME ENCARGO DE CAPITANEAR.', 'MANTENGAN LAS PATAS DENTRO DEL JUEGO EN TODO MOMENTO.', 'YA ESTAMOS VOLANDO. ESA ES LA PARTE DEL AVIÓN.'], pops: ['¡DING!', '¡FIUUU!', '¡BONK!'], stun: '¡TURBULENCIA!', fall: '¡PARACAÍDAS!', prop: 'PILOTO' },
      cart: { taunts: ['¿BOTANAS? NO. SOLO PROYECTILES.', 'REGRESE SU MESITA A SU LUGAR. Y A SUS PERROS.', 'LAS CUATRO RUEDAS RECHINAN. ES A PROPÓSITO.'], pops: ['¡DING!', '¡CLINC!', '¡ÑIQUI!'], stun: '¡FRENO DE MANO!', fall: '¡ÑIIIIC!' },
      banana: { taunts: ['SOY UN PLÁTANO PELIGROSO. BUENO, UN POCO.', 'ESTO ES UN ASALTO. CON CÁSCARAS.', 'CUIDADO CON LA CÁSCARA. Y CON ESA. Y ESA.'], pops: ['¡RESBALÓN!', '¡PLAF!', '¡IUJU!'], stun: '¡PELADO!', fall: '¡UPS!' },
      luggage: { taunts: ['HE IDO A 40 AEROPUERTOS. NINGUNO A PROPÓSITO.', 'ESTA MALETA EXCEDE EL PESO PERMITIDO DE DIVERSIÓN.', 'NO DEJE A SUS PERROS DESATENDIDOS.'], pops: ['¡PUM!', '¡ZIP!', '¡FLOP!'], stun: '¡CINTA EQUIVOCADA!', fall: '¡ZIIIP!' },
      doctor: { taunts: ['EL DIAGNÓSTICO ES GRAVE: DEMASIADA DIVERSIÓN.', 'DIGA AAA. USTED NO. LOS PERROS.', 'SOY DOCTOR. ESTAS SON MIS CEJAS SERIAS.'], pops: ['¡BOINC!', '¡EJEM!', '¡BONK!'], stun: '¡SEGUNDA OPINIÓN!', fall: '¡SIGUIENTE!' },
      weather: { taunts: ['PRONÓSTICO DE HOY: 100% DE PROBABILIDAD DE MÍ.', 'SE ESPERAN LLOVIZNAS DE TODO.', 'MÁS TARDE SALDRÁ EL SOL. SE LO PEDÍ AMABLEMENTE.'], pops: ['¡PLIC!', '¡CHAPOTEO!', '¡FIUUU!'], stun: '¡PRONÓSTICO: MAREO!', fall: '¡FIUUU!' },
    },
  },
  vi: {
    tag: 'TRÙM NHỎ',
    gate: 'HẠ NÓ ĐỂ QUA CẤP {n}',
    beaten: 'HẠ TRÙM NHỎ  ·  +{p}',
    words: {
      reiner: { taunts: ['DIỄN! KHOAN, AI MỜI CẢ ĐÀN CHÓ NÀY VẬY?', 'LÀM LẠI TỪ ĐẦU. LẦN NÀY BỚT SỦA GIÙM.', 'TÔI BẢO «CẮT», CHỨ ĐÂU BẢO «GÂU».'], pops: ['CẮT!', 'QUAY LẠI!', 'DIỄN!'], stun: 'IM LẶNG!', fall: 'ĐÓNG MÁY!', prop: 'ROB' },
      signpost: { taunts: ['VUI LÒNG TUÂN THỦ MỌI BIỂN BÁO. NHẤT LÀ TÔI.', 'CẨN THẬN: TRƠN TRƯỢT KHI TỰ MÃN.', 'NHƯỜNG ĐƯỜNG! KHÔNG, KHÔNG PHẢI KIỂU ĐÓ.'], pops: ['KENG!', 'TOÀNG!', 'CỐP!'], stun: 'ĐƯỜNG VÒNG!', fall: 'ÚI!', prop: 'BIỂN' },
      detective: { taunts: ['TÔI PHÁ ÁN RỒI: BẠN LÀ MỘT CON CHÓ.', 'KHÔNG CÓ GÌ ĐỂ XEM. TÔI KIỂM TRA RỒI. HAI LẦN.', 'LÙI LẠI. CÁI BÁNH VÒNG NÀY LÀ TANG VẬT.'], pops: ['MANH MỐI!', 'ỐI!', 'CỐP!'], stun: 'XONG ÁN?', fall: 'ỐI!' },
      captain: { taunts: ['CƠ TRƯỞNG XIN THÔNG BÁO. TÔI PHỤ TRÁCH VIỆC LÀM CƠ TRƯỞNG.', 'VUI LÒNG GIỮ CHÂN TRONG TRÒ CHƠI MỌI LÚC.', 'CHÚNG TA ĐANG BAY. ĐÓ LÀ PHẦN MÁY BAY.'], pops: ['DING!', 'VÙ!', 'CỐP!'], stun: 'NHIỄU ĐỘNG!', fall: 'NHẢY DÙ!', prop: 'PHI CÔNG' },
      cart: { taunts: ['ĐỒ ĂN VẶT Ư? KHÔNG. CHỈ CÓ ĐẠN THÔI.', 'VUI LÒNG GẬP BÀN ĂN LẠI. CẢ ĐÀN CHÓ NỮA.', 'CẢ BỐN BÁNH ĐỀU KÊU CỌT KẸT. CỐ Ý ĐẤY.'], pops: ['DING!', 'LENG KENG!', 'CỌT KẸT!'], stun: 'PHANH TAY!', fall: 'CỌT KẸẸẸT!' },
      banana: { taunts: ['TÔI LÀ QUẢ CHUỐI NGUY HIỂM. HƠI HƠI THÔI.', 'ĐÂY LÀ VỤ CƯỚP. BẰNG VỎ CHUỐI.', 'COI CHỪNG VỎ CHUỐI. CẢ CÁI KIA. VÀ CÁI KIA NỮA.'], pops: ['TRƯỢT!', 'BẸP!', 'WIII!'], stun: 'LỘT VỎ!', fall: 'OÁI!' },
      luggage: { taunts: ['TÔI ĐÃ ĐẾN 40 SÂN BAY. KHÔNG CÁI NÀO CỐ Ý.', 'VALI NÀY VƯỢT QUÁ CÂN NẶNG VUI VẺ CHO PHÉP.', 'VUI LÒNG KHÔNG ĐỂ ĐÀN CHÓ CỦA BẠN KHÔNG AI TRÔNG.'], pops: ['BỊCH!', 'XOẸT!', 'PHỊCH!'], stun: 'NHẦM BĂNG CHUYỀN!', fall: 'XOẸẸẸT!' },
      doctor: { taunts: ['CHẨN ĐOÁN NGHIÊM TRỌNG: QUÁ NHIỀU NIỀM VUI.', 'NÓI A NÀO. KHÔNG PHẢI BẠN. ĐÀN CHÓ ẤY.', 'TÔI LÀ BÁC SĨ. ĐÂY LÀ CẶP LÔNG MÀY NGHIÊM TÚC.'], pops: ['BOONG!', 'E HÈM!', 'CỐP!'], stun: 'Ý KIẾN THỨ HAI!', fall: 'NGƯỜI TIẾP THEO!' },
      weather: { taunts: ['DỰ BÁO HÔM NAY: 100% KHẢ NĂNG CÓ TÔI.', 'DỰ KIẾN MƯA RÀO NHẸ ĐỦ MỌI THỨ.', 'LÁT NỮA MẶT TRỜI SẼ RA. TÔI ĐÃ NHỜ LỊCH SỰ.'], pops: ['TÍ TÁCH!', 'TÕM!', 'VÙ!'], stun: 'DỰ BÁO: CHÓNG MẶT!', fall: 'VÙÙ!' },
    },
  },
  zh: {
    tag: '小头目',
    gate: '打败它才能通过第 {n} 关',
    beaten: '击败小头目  ·  +{p}',
    words: {
      reiner: { taunts: ['开拍！等等，这么多狗是谁请来的？', '从头再来。这次少叫几声。', '我说的是“咔”，不是“汪”。'], pops: ['咔！', '再来一条！', '开拍！'], stun: '现场安静！', fall: '杀青！', prop: 'ROB' },
      signpost: { taunts: ['请遵守所有标志。尤其是我。', '小心：得意时路滑。', '让行！不对，不是那样让。'], pops: ['哐！', '嘣！', '咚！'], stun: '绕行！', fall: '哎呀！', prop: '牌子' },
      detective: { taunts: ['我破案了：你是一只狗。', '这里没什么好看的。我查过了，两遍。', '退后。这个甜甜圈是证物。'], pops: ['线索！', '哎哟！', '咚！'], stun: '结案了？', fall: '哎哟！' },
      captain: { taunts: ['我是机长。我负责当机长。', '请随时把爪子放在游戏里面。', '我们现在在飞。这就是飞机的部分。'], pops: ['叮！', '嗖！', '咚！'], stun: '气流颠簸！', fall: '跳伞！', prop: '机长' },
      cart: { taunts: ['零食？没有。只有飞弹。', '请收起小桌板。还有你的狗。', '四个轮子都吱吱响。这是特色。'], pops: ['叮！', '叮当！', '吱吱！'], stun: '手刹！', fall: '吱——！' },
      banana: { taunts: ['我是一根危险的香蕉。有一点点危险。', '打劫！用香蕉皮打劫。', '小心香蕉皮。还有那块。还有那块。'], pops: ['打滑！', '啪叽！', '呜呼！'], stun: '剥皮啦！', fall: '哎哟喂！' },
      luggage: { taunts: ['我去过 40 个机场。没有一个是故意的。', '这个箱子的欢乐超重了。', '请勿将您的狗无人看管。'], pops: ['咚！', '嗞！', '噗通！'], stun: '转盘错了！', fall: '嗞啦！' },
      doctor: { taunts: ['诊断很严重：快乐过量。', '说“啊”。不是你，是狗。', '我是医生。这是我严肃的眉毛。'], pops: ['嘣！', '咳咳！', '咚！'], stun: '会诊！', fall: '下一位！' },
      weather: { taunts: ['今日预报：100% 会出现我。', '预计有零星阵雨，下什么都有。', '太阳待会儿就出来。我好好拜托过了。'], pops: ['滴答！', '哗啦！', '呼——！'], stun: '预报：头晕！', fall: '呼——！' },
    },
  },
};

const text = (): LangText => TEXT[lang()] ?? TEXT.en;
const words = (d: Design): Words => text().words[d];
const fill = (s: string, vars: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/** The design fighting at the end of this level (null on big-boss levels). */
export function miniDesignForLevel(level: number): Design | null {
  const n = Math.floor(level);
  if (!Number.isFinite(n) || n < 1 || n >= 111 || n % 10 === 0) return null;
  return n === 1 ? 'reiner' : ROTATION[(n - 2) % ROTATION.length];
}

const cache = new Map<number, BossDef>();

/**
 * ROLLOUT IN BATCHES BY DECADE: mini-bosses are live on levels 1..MINI_LIVE_MAX only.
 * Batch 1 = levels 1-9. Next batches: 19, 29 ... 109 (every mini level). Levels above it play
 * exactly as before (no mini, no gate). The server bound (supabase/fsb_minis_initials.sql)
 * already allows every mini level, so raising this needs no migration.
 */
export const MINI_LIVE_MAX = 9;

/** The mini-boss at the end of this level, or null (levels 10, 20 ... 110 and 111 have big bosses). */
export function miniBossForLevel(level: number, ignoreRollout = false): BossDef | null {
  if (!ignoreRollout && level > MINI_LIVE_MAX) return null;
  const design = miniDesignForLevel(level);
  if (!design) return null;
  const hit = cache.get(level);
  if (hit) return hit;
  const dd = DESIGNS[design];
  // Attack pool grows with the level: signature + aimed, walls from 11, sprays from 31.
  const patterns: Pattern[] = [dd.sig, 'aimed'];
  if (level >= 11 && !patterns.includes('wall')) patterns.push('wall');
  if (level >= 31 && !patterns.includes('spray')) patterns.push('spray');
  const def: BossDef = {
    level,
    rank: 0,
    modeId: `mini-${design}`,
    name: dd.name,
    dogs: 0,
    tint: dd.tint,
    style: 'solid',
    signature: 'mini',
    blurb: `MINI-BOSS ${dd.name}`,
    patterns,
    taunts: [],
    mini: {
      design,
      skins: dd.skins,
      pops: () => words(design).pops.map((w, i) => [w, dd.sfx[i]] as [string, PopSfx]),
      stunPop: () => words(design).stun,
    },
  };
  cache.set(level, def);
  return def;
}

/**
 * Mini-boss tuning: rises smoothly with the level (diminishing steps, like the big bosses' curve)
 * from a quick level-1 warm-up to level 109, always below every big boss (L10 MONSIEUR MIRROR has
 * 55 HP; the eased L60 / L90 bosses have ~100 / ~92 HP and faster, denser volleys). Never bored:
 * the mini-boss is the level's gate.
 */
export function miniTuning(level: number): BossTuning {
  const m = Math.min(1, Math.max(0, (level - 1) / 108));
  const x = 1 - (1 - m) * (1 - m);
  const lerp = (a: number, b: number): number => a + (b - a) * x;
  return {
    hp: Math.round(lerp(14, 40)),
    fireEvery: +lerp(2.3, 1.3).toFixed(3),
    volley: +lerp(1.2, 3).toFixed(2),
    shotSpeed: Math.round(lerp(175, 300)),
    stun: +lerp(4, 2.4).toFixed(2),
    spotEvery: +lerp(4.2, 2.4).toFixed(2),
    ringEvery: +lerp(5, 6).toFixed(2),
    bored: Number.POSITIVE_INFINITY,
  };
}

/** Bonus points for beating the mini-boss on this level, before the GAME SPEED multiplier. */
export function miniBonus(level: number): number {
  return MINI_POINTS_PER_LEVEL * Math.max(1, Math.floor(level));
}

export function miniTaunt(def: BossDef, rng: () => number): string {
  const ts = def.mini ? words(def.mini.design).taunts : TEXT.en.words.reiner.taunts;
  return ts[Math.floor(rng() * ts.length) % ts.length];
}

/** HP-bar title: "MINI-BOSS: NAME" (names stay English). */
export function miniTitle(def: BossDef): string {
  return `${text().tag}: ${def.name}`;
}

export function miniBanner(def: BossDef): string {
  return miniTitle(def);
}

export function miniGateText(level: number): string {
  return fill(text().gate, { n: level });
}

export function miniBeatenText(points: number): string {
  return fill(text().beaten, { p: fmtNum(points) });
}

// ---------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

interface MiniWob {
  spotY: number;
  t: number;
  px: number;
  py: number;
}
const wobs = new WeakMap<Board, MiniWob>();

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A word fitted to a width (prop text: signs, chair backs). */
function propText(ctx: Ctx, s: string, x: number, y: number, maxW: number, size: number, color: string): void {
  ctx.save();
  let sz = size;
  ctx.font = `900 ${sz}px 'Orbitron', sans-serif`;
  while (ctx.measureText(s).width > maxW && sz > 6) {
    sz -= 1;
    ctx.font = `900 ${sz}px 'Orbitron', sans-serif`;
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
  ctx.restore();
}

/** The weak spot: a glowing prop at the spot-row height on the side facing the dogs. */
function spotProp(ctx: Ctx, design: Design, x: number, y: number, r: number, p: Pose): void {
  if (Number.isNaN(y)) return;
  glow(ctx, x, y, r, p);
  ctx.save();
  ctx.translate(x, y);
  switch (design) {
    case 'reiner': {
      // megaphone
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(r * 0.7, -r * 0.3);
      ctx.lineTo(-r * 0.9, -r * 0.8);
      ctx.lineTo(-r * 0.9, r * 0.8);
      ctx.lineTo(r * 0.7, r * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7a4b00';
      ctx.fillRect(r * 0.6, -r * 0.3, r * 0.35, r * 0.6);
      break;
    }
    case 'signpost':
      // the big red PUSH button (no words: a hand icon)
      ctx.fillStyle = '#ff3355';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-r * 0.15, -r * 0.45, r * 0.3, r * 0.6);
      break;
    case 'detective':
      // magnifying glass
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = r * 0.25;
      ctx.beginPath();
      ctx.arc(-r * 0.15, 0, r * 0.6, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(190,240,255,0.6)';
      ctx.fill();
      ctx.strokeStyle = '#7a4b00';
      ctx.beginPath();
      ctx.moveTo(r * 0.3, r * 0.45);
      ctx.lineTo(r * 0.9, r * 1.0);
      ctx.stroke();
      break;
    case 'captain':
      // golden wings pin
      ctx.fillStyle = '#ffd23f';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(s * r * 0.5, 0, r * 0.6, r * 0.22, s * 0.25, 0, TAU);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, TAU);
      ctx.fill();
      break;
    case 'cart':
      // service bell
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(0, r * 0.2, r * 0.7, Math.PI, TAU);
      ctx.fill();
      ctx.fillRect(-r * 0.85, r * 0.2, r * 1.7, r * 0.2);
      ctx.fillRect(-r * 0.08, -r * 0.7, r * 0.16, r * 0.25);
      break;
    case 'banana':
      // bandit mask
      ctx.fillStyle = '#222';
      rr(ctx, -r * 0.9, -r * 0.35, r * 1.8, r * 0.7, r * 0.3);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(-r * 0.4, 0, r * 0.18, 0, TAU);
      ctx.arc(r * 0.4, 0, r * 0.18, 0, TAU);
      ctx.fill();
      break;
    case 'luggage':
      // luggage tag
      ctx.fillStyle = '#ffd23f';
      rr(ctx, -r * 0.8, -r * 0.5, r * 1.3, r, r * 0.15);
      ctx.fill();
      ctx.fillStyle = '#7a4b00';
      ctx.beginPath();
      ctx.arc(-r * 0.55, 0, r * 0.12, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r * 0.5, 0);
      ctx.lineTo(r * 1.0, -r * 0.2);
      ctx.stroke();
      break;
    case 'doctor':
      // head mirror
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.75, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath();
      ctx.arc(-r * 0.15, -r * 0.15, r * 0.35, 0, TAU);
      ctx.fill();
      break;
    case 'weather':
      // a sun sticker (peeling at one corner)
      ctx.fillStyle = '#ffd23f';
      star(ctx, 0, 0, r * 0.95, 8);
      ctx.fillStyle = '#ff9f1a';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, TAU);
      ctx.fill();
      break;
  }
  ctx.restore();
}

/** Plain little body parts shared by the people-shaped minis. */
function legs(ctx: Ctx, w: number, h: number, t: number, color: string, shoe = '#222'): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, w * 0.09);
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const sw = Math.sin(t * 7 + (s > 0 ? Math.PI : 0)) * w * 0.06;
    ctx.beginPath();
    ctx.moveTo(s * w * 0.14, h * 0.22);
    ctx.lineTo(s * w * 0.16 + sw, h * 0.46);
    ctx.stroke();
    ctx.fillStyle = shoe;
    ctx.beginPath();
    ctx.ellipse(s * w * 0.16 + sw - w * 0.05, h * 0.47, w * 0.12, w * 0.06, 0, 0, TAU);
    ctx.fill();
  }
}

function head(ctx: Ctx, x: number, y: number, r: number, skin: string, p: Pose): void {
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  eyes(ctx, x - r * 0.05, y - r * 0.15, r * 0.3, p, 1.0);
}

type MiniDraw = (ctx: Ctx, w: number, h: number, p: Pose, prop: string) => void;

/** Each draws around (0, 0) = box centre, filling about w x h, facing left (toward the dogs). */
const BODY: Record<Design, MiniDraw> = {
  reiner: (ctx, w, h, p, prop) => {
    // a tall director's chair; the director leans on the armrest with his megaphone
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = Math.max(3, w * 0.06);
    ctx.beginPath();
    ctx.moveTo(-w * 0.35, h * 0.48);
    ctx.lineTo(w * 0.35, h * 0.05);
    ctx.moveTo(w * 0.35, h * 0.48);
    ctx.lineTo(-w * 0.35, h * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(-w * 0.42, h * 0.0, w * 0.84, h * 0.08);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(w * 0.08, -h * 0.36, w * 0.42, h * 0.16);
    propText(ctx, prop, w * 0.29, -h * 0.28, w * 0.36, Math.max(8, w * 0.2), '#fff');
    // body (cardigan) and head with glasses + beard
    ctx.fillStyle = '#4a6fa5';
    rr(ctx, -w * 0.3, -h * 0.18, w * 0.55, h * 0.24, w * 0.12);
    ctx.fill();
    const hr = Math.min(w * 0.26, h * 0.13);
    const hy = -h * 0.18 - hr * 0.9;
    ctx.fillStyle = '#d9d9d9';
    ctx.beginPath();
    ctx.arc(-w * 0.16, hy + hr * 0.45, hr * 0.85, 0, Math.PI);
    ctx.fill();
    head(ctx, -w * 0.16, hy, hr, '#f2c7a5', p);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(-w * 0.16 + s * hr * 0.3, hy - hr * 0.15, hr * 0.36, 0, TAU);
      ctx.stroke();
    }
    mouth(ctx, -w * 0.16, hy + hr * 0.5, hr * 0.35, p);
    // the clapperboard on his lap
    ctx.fillStyle = '#222';
    ctx.fillRect(w * 0.08, -h * 0.08, w * 0.3, h * 0.1);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) ctx.fillRect(w * 0.1 + i * w * 0.1, -h * 0.08, w * 0.04, h * 0.03);
  },
  signpost: (ctx, w, h, p, prop) => {
    // a lanky signpost on two legs, a police cap, holding up a sign that says SIGN
    legs(ctx, w, h, p.t, '#9aa3ad');
    ctx.fillStyle = '#9aa3ad';
    ctx.fillRect(-w * 0.06, -h * 0.2, w * 0.12, h * 0.44);
    ctx.save();
    ctx.translate(0, -h * 0.25);
    ctx.rotate(Math.sin(p.t * 3) * 0.08);
    ctx.fillStyle = '#ffe14d';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    rr(ctx, -w * 0.46, -h * 0.13, w * 0.92, h * 0.26, 6);
    ctx.fill();
    ctx.stroke();
    eyes(ctx, -w * 0.12, -h * 0.03, Math.min(w, h) * 0.07, p, 1.1);
    propText(ctx, prop, 0, h * 0.075, w * 0.8, Math.max(7, w * 0.16), '#222');
    // police cap
    ctx.fillStyle = '#1f3a93';
    rr(ctx, -w * 0.28, -h * 0.22, w * 0.56, h * 0.09, 4);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(-w * 0.34, -h * 0.14, w * 0.4, h * 0.025);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(0, -h * 0.18, w * 0.04, 0, TAU);
    ctx.fill();
    ctx.restore();
  },
  detective: (ctx, w, h, p) => {
    // trench coat, fedora, shoelaces tied together (he shuffles)
    legs(ctx, w * 0.8, h, p.t * 0.5, '#4b3b2a', '#3a2a1a');
    ctx.fillStyle = '#c8a46e';
    ctx.beginPath();
    ctx.moveTo(-w * 0.32, h * 0.25);
    ctx.lineTo(-w * 0.22, -h * 0.2);
    ctx.lineTo(w * 0.22, -h * 0.2);
    ctx.lineTo(w * 0.32, h * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7a5a2e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.2);
    ctx.lineTo(0, h * 0.25);
    ctx.stroke();
    ctx.fillStyle = '#7a5a2e';
    ctx.fillRect(-w * 0.3, h * 0.0, w * 0.6, h * 0.035);
    const hr = Math.min(w * 0.24, h * 0.12);
    const hy = -h * 0.2 - hr * 0.8;
    head(ctx, 0, hy, hr, '#f2c7a5', p);
    mouth(ctx, 0, hy + hr * 0.5, hr * 0.3, p);
    // fedora (lifts when bonked)
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(-hr * 1.4, hy - hr * 0.75 + p.lift * 3, hr * 2.8, hr * 0.22);
    rr(ctx, -hr * 0.85, hy - hr * 1.45 + p.lift * 3, hr * 1.7, hr * 0.75, hr * 0.2);
    ctx.fill();
    // a donut in the coat pocket
    ctx.strokeStyle = '#ff8fc8';
    ctx.lineWidth = Math.max(2, w * 0.05);
    ctx.beginPath();
    ctx.arc(w * 0.16, h * 0.12, w * 0.06, 0, TAU);
    ctx.stroke();
  },
  captain: (ctx, w, h, p, prop) => {
    // a pilot in a kiddie plane on a stick, holding a card that says PILOT
    ctx.save();
    ctx.rotate(Math.sin(p.t * 2.5) * 0.06);
    ctx.fillStyle = '#e8eef5';
    rr(ctx, -w * 0.48, h * 0.02, w * 0.96, h * 0.18, h * 0.08);
    ctx.fill();
    ctx.fillStyle = '#7fc8ff';
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, h * 0.1);
    ctx.lineTo(w * 0.25, h * 0.3);
    ctx.lineTo(w * 0.35, h * 0.1);
    ctx.closePath();
    ctx.fill();
    // propeller (on the front, facing the dogs)
    ctx.fillStyle = '#555';
    const pr = h * 0.12 * Math.abs(Math.sin(p.t * 30));
    ctx.fillRect(-w * 0.52, h * 0.11 - pr, w * 0.04, pr * 2);
    ctx.fillStyle = '#1f3a93';
    rr(ctx, -w * 0.2, -h * 0.16, w * 0.4, h * 0.2, w * 0.08);
    ctx.fill();
    const hr = Math.min(w * 0.22, h * 0.11);
    const hy = -h * 0.16 - hr * 0.8;
    head(ctx, 0, hy, hr, '#f2c7a5', p);
    mouth(ctx, 0, hy + hr * 0.5, hr * 0.3, p);
    ctx.fillStyle = '#1f3a93';
    rr(ctx, -hr * 1.1, hy - hr * 1.25 + p.lift * 3, hr * 2.2, hr * 0.6, hr * 0.2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(-hr * 1.25, hy - hr * 0.7 + p.lift * 3, hr * 1.4, hr * 0.15);
    // the PILOT card, held up very helpfully
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    rr(ctx, w * 0.12, -h * 0.42, w * 0.38, h * 0.14, 3);
    ctx.fill();
    ctx.stroke();
    propText(ctx, prop, w * 0.31, -h * 0.35, w * 0.34, Math.max(7, w * 0.11), '#1f3a93');
    ctx.restore();
  },
  cart: (ctx, w, h, p) => {
    // a runaway drinks cart with googly eyes and a bow tie, on squeaky wheels
    ctx.fillStyle = '#c9d1d9';
    rr(ctx, -w * 0.42, -h * 0.25, w * 0.84, h * 0.6, 6);
    ctx.fill();
    ctx.strokeStyle = '#7d8590';
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.38, -h * 0.25 + i * h * 0.15);
      ctx.lineTo(w * 0.38, -h * 0.25 + i * h * 0.15);
      ctx.stroke();
    }
    eyes(ctx, -w * 0.1, -h * 0.1, Math.min(w, h) * 0.1, p, 1.1);
    ctx.fillStyle = '#ff3b8d';
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, h * 0.04);
    ctx.lineTo(-w * 0.24, -h * 0.0);
    ctx.lineTo(-w * 0.24, h * 0.08);
    ctx.closePath();
    ctx.moveTo(-w * 0.1, h * 0.04);
    ctx.lineTo(w * 0.04, -h * 0.0);
    ctx.lineTo(w * 0.04, h * 0.08);
    ctx.closePath();
    ctx.fill();
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(s * w * 0.3, h * 0.4 + Math.abs(Math.sin(p.t * 9 + s)) * -2, h * 0.06, 0, TAU);
      ctx.fill();
    }
  },
  banana: (ctx, w, h, p) => {
    // a banana in a striped shirt, tiptoeing
    legs(ctx, w * 0.7, h, p.t * 1.4, '#3a2a1a');
    ctx.save();
    ctx.rotate(-0.12);
    ctx.fillStyle = '#ffe14d';
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.05, w * 0.28, h * 0.36, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#6b4a1f';
    ctx.fillRect(-w * 0.04, -h * 0.46, w * 0.08, h * 0.07);
    // striped shirt
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.05, w * 0.28, h * 0.36, 0, 0, TAU);
    ctx.clip();
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : '#222';
      ctx.fillRect(-w * 0.3, h * 0.02 + i * h * 0.05, w * 0.6, h * 0.05);
    }
    ctx.restore();
    eyes(ctx, -w * 0.03, -h * 0.17, Math.min(w, h) * 0.08, p, 1.0);
    mouth(ctx, -w * 0.03, -h * 0.06, Math.min(w, h) * 0.08, p);
    ctx.restore();
  },
  luggage: (ctx, w, h, p) => {
    // a battered suitcase with stickers, a sock sticking out of the zip
    ctx.fillStyle = '#d35400';
    rr(ctx, -w * 0.42, -h * 0.25, w * 0.84, h * 0.62, 8);
    ctx.fill();
    ctx.strokeStyle = '#7a3000';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.arc(0, -h * 0.25, w * 0.14, Math.PI, TAU);
    ctx.stroke();
    ctx.fillStyle = '#7fffff';
    ctx.beginPath();
    ctx.arc(w * 0.22, h * 0.2, w * 0.09, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff4ec8';
    ctx.fillRect(w * 0.05, h * 0.0, w * 0.16, h * 0.08);
    eyes(ctx, -w * 0.08, -h * 0.06, Math.min(w, h) * 0.1, p, 1.1);
    mouth(ctx, -w * 0.08, h * 0.08, Math.min(w, h) * 0.09, p);
    ctx.fillStyle = '#fff';
    ctx.save();
    ctx.translate(w * 0.42, -h * 0.05);
    ctx.rotate(Math.sin(p.t * 6) * 0.3);
    ctx.fillRect(0, -h * 0.03, w * 0.16, h * 0.06);
    ctx.fillStyle = '#ff3355';
    ctx.fillRect(w * 0.1, -h * 0.03, w * 0.06, h * 0.06);
    ctx.restore();
  },
  doctor: (ctx, w, h, p) => {
    // lab coat, clipboard, and a perfectly straight face (only the eyebrows move)
    legs(ctx, w * 0.8, h, p.t * 0.6, '#334');
    ctx.fillStyle = '#f5f7fa';
    rr(ctx, -w * 0.3, -h * 0.2, w * 0.6, h * 0.44, w * 0.08);
    ctx.fill();
    ctx.strokeStyle = '#9aa3ad';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.2);
    ctx.lineTo(0, h * 0.24);
    ctx.stroke();
    // stethoscope
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -h * 0.16, w * 0.14, 0.2, Math.PI - 0.2);
    ctx.stroke();
    const hr = Math.min(w * 0.22, h * 0.11);
    const hy = -h * 0.2 - hr * 0.85;
    ctx.fillStyle = '#e8b896';
    ctx.beginPath();
    ctx.arc(0, hy, hr, 0, TAU);
    ctx.fill();
    // deadpan: dot eyes and a flat line mouth, whatever happens; the eyebrows do all the acting
    ctx.fillStyle = '#111';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * hr * 0.35, hy - hr * 0.05, hr * 0.1, 0, TAU);
      ctx.fill();
      const lift = p.hurt || p.stun ? -hr * 0.25 : Math.sin(p.t * 2) > 0.92 ? -hr * 0.15 : 0;
      ctx.fillRect(s * hr * 0.35 - hr * 0.18, hy - hr * 0.38 + lift, hr * 0.36, hr * 0.08);
    }
    ctx.fillRect(-hr * 0.3, hy + hr * 0.45, hr * 0.6, hr * 0.07);
    // clipboard
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(w * 0.18, -h * 0.05, w * 0.22, h * 0.2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(w * 0.2, -h * 0.03, w * 0.18, h * 0.16);
  },
  weather: (ctx, w, h, p) => {
    // a weatherman under an umbrella that keeps flipping inside out
    legs(ctx, w * 0.8, h, p.t * 0.8, '#223');
    ctx.fillStyle = '#2e4a7d';
    rr(ctx, -w * 0.26, -h * 0.16, w * 0.52, h * 0.4, w * 0.08);
    ctx.fill();
    ctx.fillStyle = '#ff3355';
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.15);
    ctx.lineTo(-w * 0.04, h * 0.08);
    ctx.lineTo(w * 0.04, h * 0.08);
    ctx.closePath();
    ctx.fill();
    const hr = Math.min(w * 0.22, h * 0.11);
    const hy = -h * 0.16 - hr * 0.85;
    head(ctx, 0, hy, hr, '#f2c7a5', p);
    mouth(ctx, 0, hy + hr * 0.5, hr * 0.3, p);
    // umbrella (flips inside out every few seconds)
    const flip = Math.sin(p.t * 1.3) > 0.7 ? -1 : 1;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.28, -h * 0.05);
    ctx.lineTo(w * 0.28, -h * 0.38);
    ctx.stroke();
    ctx.fillStyle = '#ff7ac8';
    ctx.beginPath();
    ctx.moveTo(w * 0.28 - w * 0.3, -h * 0.38);
    ctx.quadraticCurveTo(w * 0.28, -h * 0.38 - flip * h * 0.16, w * 0.28 + w * 0.3, -h * 0.38);
    ctx.closePath();
    ctx.fill();
  },
};

/** Draw a mini-boss: entrance slide is the board's x; hurt wobble, stun birdies, pratfall defeat. */
export function drawMini(ctx: Ctx, f: BossFight, b: Board, time: number, W: number): void {
  const spec = f.def.mini;
  if (!spec) return;
  const design = spec.design;
  const rowH = b.h / b.rows;
  const sy = b.y - b.h / 2 + rowH * (b.spot + 0.5);
  let wb = wobs.get(b);
  if (!wb) {
    wb = { spotY: sy, t: time, px: 0, py: 0 };
    wobs.set(b, wb);
  }
  const dt = Math.min(0.05, Math.max(0, time - wb.t));
  wb.t = time;
  wb.spotY += (sy - wb.spotY) * Math.min(1, dt * 22);
  wb.px = Math.sin(time * 2.1 + b.bob) * 0.8;
  wb.py = 0.4 + Math.sin(time * 1.7) * 0.3;
  const beaten = f.state === 'defeated' ? clamp01(f.stateT / f.exitS) : f.state === 'gone' ? 1 : 0;
  const p: Pose = {
    t: time + b.bob,
    enter: f.state === 'enter' ? clamp01(f.stateT / f.enterS) : 1,
    beaten,
    hurt: f.hurtT > 0.12 && f.state === 'fight',
    stun: f.stunned,
    px: wb.px,
    py: wb.py,
    lift: f.hurtT > 0.2 ? -2 : 0,
    spotY: f.active ? wb.spotY : NaN,
    glow: f.active,
    real: true,
    idx: 0,
    slam: 0,
    swapAge: 9,
  };
  const w = b.w;
  const h = b.h;
  const prop = words(design).prop ?? '';
  ctx.save();
  // pratfall: tips over backwards about the feet, bounces once, fades
  const feetY = b.y + h / 2;
  let rot = 0;
  let alpha = 1;
  let dy = 0;
  if (beaten > 0) {
    const k = clamp01(beaten / 0.45);
    rot = k * k * 1.5;
    dy = beaten > 0.45 ? -Math.sin(((beaten - 0.45) / 0.25) * Math.PI) * h * 0.08 * (beaten < 0.7 ? 1 : 0) : 0;
    alpha = beaten > 0.7 ? 1 - (beaten - 0.7) / 0.3 : 1;
  }
  if (p.hurt) rot += Math.sin(time * 45) * 0.05;
  ctx.globalAlpha *= Math.max(0, alpha);
  ctx.translate(b.x, feetY + dy);
  ctx.rotate(rot);
  // a banana peel under the feet during the pratfall (the classic)
  if (beaten > 0) {
    ctx.save();
    ctx.rotate(-rot);
    drawPeel(ctx, -w * 0.15, 0, Math.max(6, w * 0.12), 0.3);
    ctx.restore();
  }
  ctx.translate(0, -h / 2);
  const sq = p.stun ? 1 : 1 + Math.sin(p.t * 8) * 0.03 - (p.hurt ? 0.08 : 0);
  ctx.scale(1 / sq, sq);
  BODY[design](ctx, w, h, p, prop);
  ctx.restore();
  // the weak spot prop, held out toward the dogs at the spot height
  if (f.active) spotProp(ctx, design, b.x - w * 0.55, p.spotY, Math.max(8, Math.min(w * 0.22, rowH * 0.42)), p);
  if (p.stun && beaten <= 0) {
    for (let i = 0; i < 3; i++) {
      const a = time * 4 + (i * TAU) / 3;
      ctx.fillStyle = '#ffe14d';
      star(ctx, b.x + Math.cos(a) * w * 0.4, b.y - h / 2 - 8 + Math.sin(a) * 5, 5);
    }
  }
  if (beaten > 0.15 && beaten < 0.95) speech(ctx, words(design).fall, Math.max(60, Math.min(W - 60, b.x)), b.y - h / 2 - 12, 15, '#ffe14d');
}

function drawPeel(ctx: Ctx, x: number, y: number, r: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#ffe14d';
  for (const a of [-0.9, 0, 0.9]) {
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.6, r * 0.3, r * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#6b4a1f';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.22, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Mini-boss shot costumes (physics and hit radius unchanged). Returns false for unknown skins. */
export function drawMiniShot(ctx: Ctx, s: BossShot, solid: boolean, time: number): boolean {
  const skin = s.skin;
  if (!skin) return false;
  const r = s.r;
  ctx.save();
  ctx.translate(s.x, s.y);
  if (!solid) ctx.globalAlpha *= 0.45;
  const spin = s.t * 6;
  switch (skin) {
    case 'clap':
      ctx.rotate(Math.sin(s.t * 10) * 0.3);
      ctx.fillStyle = '#222';
      ctx.fillRect(-r, -r * 0.5, r * 2, r * 1.3);
      ctx.save();
      ctx.translate(-r, -r * 0.5);
      ctx.rotate(-0.3 - Math.abs(Math.sin(s.t * 12)) * 0.4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, -r * 0.45, r * 2, r * 0.45);
      ctx.fillStyle = '#222';
      for (let i = 0; i < 3; i++) ctx.fillRect(r * 0.2 + i * r * 0.6, -r * 0.45, r * 0.3, r * 0.45);
      ctx.restore();
      break;
    case 'reel':
      ctx.rotate(spin);
      ctx.fillStyle = '#9aa3ad';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#222';
      for (let i = 0; i < 5; i++) {
        const a = (i * TAU) / 5;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.2, 0, TAU);
        ctx.fill();
      }
      break;
    case 'sign':
      ctx.rotate(spin * 0.5 + Math.PI / 4);
      ctx.fillStyle = '#ffe14d';
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.fillRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
      ctx.strokeRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#222';
      ctx.fillRect(-r * 0.1, -r * 0.6, r * 0.2, r * 0.75);
      ctx.fillRect(-r * 0.1, r * 0.3, r * 0.2, r * 0.2);
      break;
    case 'cone':
      ctx.rotate(Math.sin(s.t * 8) * 0.4);
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.1);
      ctx.lineTo(r * 0.75, r * 0.8);
      ctx.lineTo(-r * 0.75, r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-r * 0.45, -r * 0.05, r * 0.9, r * 0.25);
      ctx.fillStyle = '#ff7a1a';
      ctx.fillRect(-r, r * 0.75, r * 2, r * 0.25);
      break;
    case 'donut':
      ctx.rotate(spin);
      ctx.strokeStyle = '#f4b183';
      ctx.lineWidth = r * 0.75;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.62, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = '#ff8fc8';
      ctx.lineWidth = r * 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.62, 0.3, TAU - 0.6);
      ctx.stroke();
      break;
    case 'glass':
      ctx.rotate(spin);
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = r * 0.25;
      ctx.beginPath();
      ctx.arc(-r * 0.2, 0, r * 0.6, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = '#7a4b00';
      ctx.beginPath();
      ctx.moveTo(r * 0.3, r * 0.4);
      ctx.lineTo(r, r);
      ctx.stroke();
      break;
    case 'plane': {
      ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#7fc8ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(-r, -r * 0.8);
      ctx.lineTo(-r * 0.5, 0);
      ctx.lineTo(-r, r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'peanut':
      ctx.rotate(spin * 0.7);
      ctx.fillStyle = '#4aa3ff';
      rr(ctx, -r, -r * 0.7, r * 2, r * 1.4, 3);
      ctx.fill();
      ctx.fillStyle = '#e8c27a';
      ctx.beginPath();
      ctx.ellipse(-r * 0.25, 0, r * 0.35, r * 0.28, 0, 0, TAU);
      ctx.ellipse(r * 0.3, 0, r * 0.35, r * 0.28, 0, 0, TAU);
      ctx.fill();
      break;
    case 'pretzel':
      ctx.rotate(spin);
      ctx.strokeStyle = '#a0612a';
      ctx.lineWidth = r * 0.35;
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.1, r * 0.45, 0, TAU);
      ctx.moveTo(r * 0.8, -r * 0.1);
      ctx.arc(r * 0.35, -r * 0.1, r * 0.45, 0, TAU);
      ctx.moveTo(-r * 0.6, r * 0.7);
      ctx.lineTo(r * 0.6, r * 0.7);
      ctx.stroke();
      break;
    case 'ice':
      ctx.rotate(spin * 0.5);
      ctx.fillStyle = 'rgba(200,240,255,0.9)';
      rr(ctx, -r * 0.85, -r * 0.85, r * 1.7, r * 1.7, r * 0.35);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-r * 0.5, -r * 0.55, r * 0.35, r * 0.2);
      break;
    case 'peel':
      drawPeel(ctx, 0, 0, r * 1.2, spin);
      break;
    case 'sock':
      ctx.rotate(spin);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-r * 0.35, -r, r * 0.7, r * 1.4);
      ctx.beginPath();
      ctx.ellipse(r * 0.1, r * 0.45, r * 0.6, r * 0.35, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff3355';
      ctx.fillRect(-r * 0.35, -r, r * 0.7, r * 0.25);
      ctx.fillRect(-r * 0.35, -r * 0.5, r * 0.7, r * 0.15);
      break;
    case 'brush':
      ctx.rotate(spin);
      ctx.fillStyle = '#7fffff';
      ctx.fillRect(-r * 1.2, -r * 0.15, r * 2, r * 0.3);
      ctx.fillStyle = '#fff';
      ctx.fillRect(r * 0.5, -r * 0.5, r * 0.6, r * 0.35);
      break;
    case 'stick':
      ctx.rotate(spin);
      ctx.fillStyle = '#f0d9a8';
      rr(ctx, -r * 1.2, -r * 0.3, r * 2.4, r * 0.6, r * 0.3);
      ctx.fill();
      break;
    case 'bandage':
      ctx.rotate(spin * 0.6);
      ctx.fillStyle = '#f3c99b';
      rr(ctx, -r * 1.2, -r * 0.4, r * 2.4, r * 0.8, r * 0.4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-r * 0.35, -r * 0.3, r * 0.7, r * 0.6);
      break;
    case 'drop':
      ctx.fillStyle = '#4aa3ff';
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.2);
      ctx.quadraticCurveTo(r, r * 0.2, 0, r * 0.9);
      ctx.quadraticCurveTo(-r, r * 0.2, 0, -r * 1.2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(-r * 0.25, r * 0.2, r * 0.2, 0, TAU);
      ctx.fill();
      break;
    case 'flake':
      ctx.rotate(spin * 0.5);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, r * 0.2);
      for (let i = 0; i < 3; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(r, 0);
        ctx.stroke();
      }
      break;
    case 'cloud':
      ctx.fillStyle = '#dfe6ee';
      ctx.beginPath();
      ctx.arc(-r * 0.45, r * 0.1, r * 0.55, 0, TAU);
      ctx.arc(r * 0.1, -r * 0.2, r * 0.65, 0, TAU);
      ctx.arc(r * 0.6, r * 0.15, r * 0.5, 0, TAU);
      ctx.fill();
      break;
    default:
      ctx.restore();
      return false;
  }
  void time;
  ctx.restore();
  return true;
}
