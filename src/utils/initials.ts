/**
 * Initials alphabets, validation and the G-rated filter (shared by entry, boards and tickers).
 *
 * The picker shows only the current game language's set (no mixing):
 *   en  A-Z, ★, emojis
 *   es  A-N Ñ O-Z, Á É Í Ó Ú Ü, ★, emojis
 *   vi  the 29-letter Vietnamese alphabet (no tone marks), ★, emojis
 *   zh  144 curated kid-friendly characters in pinyin order, ★, emojis
 *   fr/de/pt/it/nl/pl/tr/id/fil/sv  Latin letters (plus language accents), ★, emojis
 * The server (supabase migration fsb_initials_allowlist.sql) accepts the union of every set
 * and rejects everything else, plus the same rude list. Keep the two in step.
 *
 * Every emoji is a single code point (no variation selectors / ZWJ), so "3 characters" means
 * exactly 3 code points both here and in Postgres char_length().
 */
import type { Lang } from '../i18n';

export const STAR = '★';

/** Kid-friendly, single-code-point emojis (after ★ in every language). */
export const EMOJIS: readonly string[] = [
  '⭐', '🌟', '🚀', '🍕', '🍩', '🍦', '🍉', '🐶', '🐱', '🐼', '🦊', '🐸',
  '🐙', '🐢', '🦄', '🦖', '🌈', '🎮', '🏆', '🎉', '🔥', '⚡', '👾', '🤖', '🎈',
];

const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const ES = [...'ABCDEFGHIJKLMN', 'Ñ', ...'OPQRSTUVWXYZ', 'Á', 'É', 'Í', 'Ó', 'Ú', 'Ü'];
const VI = ['A', 'Ă', 'Â', 'B', 'C', 'D', 'Đ', 'E', 'Ê', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'Ô', 'Ơ', 'P', 'Q', 'R', 'S', 'T', 'U', 'Ư', 'V', 'X', 'Y'];
/** Simplified Chinese: animals, nature, colours, numbers, happy words. Pinyin order. */
export const ZH_CHARS =
  '爱安八白百宝北贝冰彩草茶唱超车橙船春大岛灯蝶东冬豆朵鹅二方飞粉蜂风福歌狗鼓瓜光龟果海好河荷红虹猴湖虎花画黄火江金九橘酷快兰蓝乐亮林六龙鹿绿马猫梅莓美萌梦米明木南鸟牛跑飘七千强琴晴秋球日三沙山上狮十石书树水四糖桃天甜田跳土兔蛙玩万王五舞西喜虾下夏象小笑心星熊雪鸭羊叶一勇鱼宇雨圆月云早中竹紫';
const ZH = Array.from(ZH_CHARS);


const FR = [...AZ, 'À', 'Â', 'Æ', 'Ç', 'É', 'È', 'Ê', 'Ë', 'Î', 'Ï', 'Ô', 'Œ', 'Ù', 'Û', 'Ü', 'Ÿ'];
const DE = [...AZ, 'Ä', 'Ö', 'Ü', 'ẞ'];
const PT = [...AZ, 'Á', 'Â', 'Ã', 'À', 'Ç', 'É', 'Ê', 'Í', 'Ó', 'Ô', 'Õ', 'Ú'];
const IT = [...AZ, 'À', 'È', 'É', 'Ì', 'Ò', 'Ù'];
const NL = [...AZ];
const PL = [...AZ, 'Ą', 'Ć', 'Ę', 'Ł', 'Ń', 'Ó', 'Ś', 'Ź', 'Ż'];
const TR = ['A', 'B', 'C', 'Ç', 'D', 'E', 'F', 'G', 'Ğ', 'H', 'I', 'İ', 'J', 'K', 'L', 'M', 'N', 'O', 'Ö', 'P', 'R', 'S', 'Ş', 'T', 'U', 'Ü', 'V', 'Y', 'Z'];
const ID = [...AZ];
const FIL = [...AZ, 'Ñ'];
const SV = [...AZ, 'Å', 'Ä', 'Ö'];

const RU = Array.from('АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ');
const UK = Array.from('АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ');
const JA = Array.from('アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン');
const KO = Array.from('가나다라마바사아자차카타파하');
const HI = Array.from('अआइईउऊएऐओऔकखगघचछजझटठडढणतथदधनपफबभमयरलवशषसह');
const TH = Array.from('กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ');

const SETS: Record<Lang, readonly string[]> = {
  en: [...AZ, STAR, ...EMOJIS],
  es: [...ES, STAR, ...EMOJIS],
  vi: [...VI, STAR, ...EMOJIS],
  zh: [...ZH, STAR, ...EMOJIS],
  fr: [...FR, STAR, ...EMOJIS],
  de: [...DE, STAR, ...EMOJIS],
  pt: [...PT, STAR, ...EMOJIS],
  it: [...IT, STAR, ...EMOJIS],
  nl: [...NL, STAR, ...EMOJIS],
  pl: [...PL, STAR, ...EMOJIS],
  tr: [...TR, STAR, ...EMOJIS],
  id: [...ID, STAR, ...EMOJIS],
  fil: [...FIL, STAR, ...EMOJIS],
  sv: [...SV, STAR, ...EMOJIS],
  ru: [...RU, STAR, ...EMOJIS],
  uk: [...UK, STAR, ...EMOJIS],
  ja: [...JA, STAR, ...EMOJIS],
  ko: [...KO, STAR, ...EMOJIS],
  hi: [...HI, STAR, ...EMOJIS],
  th: [...TH, STAR, ...EMOJIS],
};

/** The picker's characters for one language, in order. */
export function initialsSet(l: Lang): readonly string[] {
  return SETS[l] ?? SETS.en;
}

/** Union of every language's set: what the boards (and the server) accept. */
/**
 * The old sunglasses emoji: no longer in any picker (the game dropped eyewear, Dan 2026-10-08), but
 * still accepted on rows already on the board (the server allowlist has it) and shown as SHADES_SWAP.
 */
const LEGACY_SHADES = '\u{1F60E}';
const SHADES_SWAP = '🌟';
export const ALLOWED: ReadonlySet<string> = new Set([LEGACY_SHADES, ...AZ, ...ES, ...VI, ...ZH, ...FR, ...DE, ...PT, ...IT, ...NL, ...PL, ...TR, ...ID, ...FIL, ...SV, ...RU, ...UK, ...JA, ...KO, ...HI, ...TH, STAR, ...EMOJIS]);

/** Code points (an emoji is one character here, unlike String.length). */
export function chars(s: string): string[] {
  return Array.from(s ?? '');
}

/** Exactly 3 allowed characters (any mix of the union: older or other-language rows still show). */
export function isValidInitials(s: string): boolean {
  const c = chars(s);
  return c.length === 3 && c.every((ch) => ALLOWED.has(ch));
}

/** The default first character of a fresh entry in this language. */
export function firstChar(l: Lang): string {
  return initialsSet(l)[0];
}

/** Step through this language's set (wraps both ways: ★ and the emojis are one step below the first letter). */
export function nextChar(ch: string, delta: number, l: Lang): string {
  const set = initialsSet(l);
  const i = set.indexOf(ch);
  const base = i >= 0 ? i : 0;
  const n = (((base + delta) % set.length) + set.length) % set.length;
  return set[n];
}

// —— G-rated filter ————————————————————————————————————————————————————————————
// Latin combos are compared after folding Vietnamese / Spanish accents (Ñ is kept, so COÑ is caught
// but CON is fine). ★ / emojis are skipped when looking for letter runs.
// Chinese phrases match anywhere inside the 3 characters.

/** Fold accents to the base letter (Ñ stays Ñ). */
export function foldLatin(s: string): string {
  const map: Record<string, string> = {
    Á: 'A', À: 'A', Ă: 'A', Â: 'A', Ã: 'A', Ä: 'A', Å: 'A', Æ: 'AE',
    Ç: 'C', Ć: 'C',
    É: 'E', È: 'E', Ê: 'E', Ë: 'E', Ę: 'E',
    Í: 'I', Ì: 'I', Î: 'I', Ï: 'I', İ: 'I',
    Ó: 'O', Ò: 'O', Ô: 'O', Õ: 'O', Ö: 'O', Ơ: 'O', Œ: 'OE',
    Ú: 'U', Ù: 'U', Û: 'U', Ü: 'U', Ư: 'U',
    Ý: 'Y', Ÿ: 'Y',
    Đ: 'D', Ń: 'N', Ł: 'L', Ś: 'S', Ź: 'Z', Ż: 'Z',
    Ğ: 'G', Ş: 'S', ẞ: 'SS',
  };
  return chars(s.toUpperCase()).map((c) => map[c] ?? c).join('');
}

/** Rude 3-letter combos (folded). English, Spanish, Vietnamese. Keep in step with the SQL. */
export const RUDE_LATIN: readonly string[] = [
  // English
  'ASS', 'AZZ', 'ARS', 'FUK', 'FUC', 'FUQ', 'FUX', 'FCK', 'FKU', 'FKN', 'FAG', 'FAP', 'FFS', 'WTF', 'STF', 'GTF',
  'SHT', 'CUM', 'CUN', 'CNT', 'KNT', 'DIK', 'DIC', 'DCK', 'DIX', 'COK', 'COC', 'KOK', 'TIT', 'TTS', 'TTY',
  'NIG', 'NGR', 'NGA', 'NIK', 'JIZ', 'JZZ', 'PIS', 'PSS', 'SOB', 'SUK', 'KKK', 'NAZ', 'HOE', 'HOR', 'WHR', 'SLT',
  'BCH', 'BJS', 'VAG', 'PNS', 'SEX', 'XXX', 'KYS', 'DTF', 'TWT', 'CUK', 'POS', 'HEL',
  // Spanish (folded; Ñ kept)
  'PUT', 'PTA', 'PTO', 'CUL', 'MRD', 'VRG', 'PIJ', 'PJA', 'COÑ', 'HDP', 'JOD', 'ZRA', 'ZOR', 'CBR',
  'MMN', 'OJT', 'PNE', 'CHG', 'PLL',
  // Vietnamese (folded: Đ→D, Ơ/Ô→O, Ư→U, Ă/Â→A, Ê→E)
  'DIT', 'DCM', 'DMM', 'DKM', 'DMN', 'VCL', 'VKL', 'VLX', 'CLM', 'CAC', 'LON', 'DEO', 'DUM', 'CMM', 'DJT',
];

/** Rude Chinese phrases (any match inside the initials). Every character here is in the picker. */
export const RUDE_ZH: readonly string[] = ['王八', '二百五', '三八', '小三', '狗东西', '黄书'];

const RUDE_SET = new Set(RUDE_LATIN);

/** Letters only (★ / emojis dropped), folded. */
function lettersOnly(s: string): string {
  return chars(foldLatin(s))
    .filter((c) => c !== STAR && !EMOJIS.includes(c))
    .join('');
}

/** Would these initials be rude on a family board? */
export function isRude(s: string): boolean {
  if (!s) return false;
  const raw = foldLatin(s);
  if (RUDE_SET.has(raw)) return true;
  const letters = lettersOnly(s);
  if (letters.length >= 3) {
    const lc = chars(letters);
    for (let i = 0; i + 3 <= lc.length; i++) if (RUDE_SET.has(lc.slice(i, i + 3).join(''))) return true;
  }
  for (const p of RUDE_ZH) if (s.includes(p) || letters.includes(p)) return true;
  return false;
}

/** What a board shows: rude initials become ***. */
export function maskInitials(s: string): string {
  return isRude(s) ? '***' : s.split(LEGACY_SHADES).join(SHADES_SWAP);
}

/** Canvas font tail so Vietnamese, Chinese and emoji glyphs always have a font (aligned columns). */
export const GLYPH_FALLBACK =
  "'Noto Sans', 'Segoe UI', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";

/** The friendly G-rated nudge when rude initials are blocked. */
const RUDE_PROMPT: Record<Lang, string> = {
  en: 'OOPS! THOSE SLIPPED ON A BANANA PEEL. PICK DIFFERENT ONES!',
  es: '¡UPS! ESAS SE RESBALARON CON UNA CÁSCARA. ¡ELIGE OTRAS!',
  vi: 'ÚI! MẤY CHỮ ĐÓ TRƯỢT VỎ CHUỐI RỒI. CHỌN CHỮ KHÁC NHÉ!',
  zh: '哎呀！这几个字踩到香蕉皮啦。换几个吧！',
  fr: 'OUPS ! ÇA A GLISSÉ SUR UNE PEAU DE BANANE. CHOISIS-EN D’AUTRES !',
  de: 'UPS! DIE SIND AUF EINER BANANENSCHALE AUSGERUTSCHT. NIMM ANDERE!',
  pt: 'OPS! ESSAS ESCORREGARAM NA CASCA DE BANANA. ESCOLHA OUTRAS!',
  it: 'OPS! QUELLE SONO SCIVOLATE SU UNA BUCCIA. SCEGLINE ALTRE!',
  nl: 'OEPS! DIE GLEDEN UIT OVER EEN BANANENSCHIL. KIES ANDERE!',
  pl: 'UPS! TE POŚLIZGNĘŁY SIĘ NA SKÓRCE BANANA. WYBIERZ INNE!',
  tr: 'HOP! MUZ KABUĞUNA KAYDILAR. BAŞKALARINI SEÇ!',
  id: 'UPS! ITU TERSLIP KULIT PISANG. PILIH YANG LAIN!',
  fil: 'Naku! Nadulas sa balat ng saging. Pumili ng iba!',
  sv: 'HOPSAN! DE HALKADE PÅ ETT BANANSKAL. VÄLJ ANDRA!',
  ru: 'УПС! ЭТИ БУКВЫ ПОДСКОЛЬЗНУЛИСЬ НА БАНАНОВОЙ КОЖУРЕ. ВЫБЕРИ ДРУГИЕ!',
  uk: 'ОПС! ЦІ ЛІТЕРИ ПОСКОВЗНУЛИСЯ НА БАНАНОВІЙ ШКУРЦІ. ОБЕРИ ІНШІ!',
  ja: 'おっと！その文字はバナナの皮で滑ったよ。別のを選んで！',
  ko: '앗! 그 글자가 바나나 껍질에 미끄러졌어. 다른 걸 골라!',
  hi: 'उफ़! ये अक्षर केले के छिलके पर फिसल गए। दूसरे चुनो!',
  th: 'อุ๊ย! ตัวอักษรลื่นเปลือกกล้วย เลือกใหม่นะ!',
};
export function rudePrompt(l: Lang): string {
  return RUDE_PROMPT[l] ?? RUDE_PROMPT.en;
}
