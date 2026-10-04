/**
 * The playful G-rated taunt line on the leaderboard (game-over) screen.
 *
 * Shown to everyone who isn't #1 on the board they just played for: one set of lines for runs that
 * missed the board, another for runs on the board below #1. Original slapstick, all four languages,
 * the same count per language so one random pick works in any language. #1 gets no taunt.
 */
import type { Lang } from '../i18n';

const MISSED: Record<Lang, readonly string[]> = {
  en: [
    'THE BOARD SAVED YOU A SEAT. IT\'S IN THE PARKING LOT.',
    'SO CLOSE! THE TOP 11 CAN HEAR YOU KNOCKING.',
    'YOUR SCORE IS ON ITS WAY. IT STOPPED FOR SNACKS.',
    'THE BOARD SLIPPED ON A BANANA PEEL RIGHT BEFORE YOU ARRIVED.',
    'ONE MORE RIDE AND THE BOARD MIGHT HAVE TO SCOOT OVER.',
    'THE TOP 11 LOCKED THE DOOR. THE WINDOW IS WIDE OPEN.',
  ],
  es: [
    'LA TABLA TE GUARDÓ UN ASIENTO. ESTÁ EN EL ESTACIONAMIENTO.',
    '¡CASI! EL TOP 11 YA TE OYE TOCAR LA PUERTA.',
    'TU RÉCORD VIENE EN CAMINO. PARÓ A COMPRAR BOCADILLOS.',
    'LA TABLA PISÓ UNA CÁSCARA DE PLÁTANO JUSTO ANTES DE QUE LLEGARAS.',
    'UNA VUELTA MÁS Y LA TABLA TENDRÁ QUE HACERTE SITIO.',
    'EL TOP 11 CERRÓ LA PUERTA. LA VENTANA ESTÁ ABIERTA.',
  ],
  vi: [
    'BẢNG ĐÃ GIỮ CHỖ CHO BẠN. CHỖ ĐÓ Ở BÃI ĐỖ XE.',
    'SUÝT NỮA! TOP 11 ĐÃ NGHE THẤY BẠN GÕ CỬA.',
    'ĐIỂM CỦA BẠN ĐANG TỚI. NÓ GHÉ MUA ĐỒ ĂN VẶT.',
    'BẢNG VỪA GIẪM VỎ CHUỐI NGAY TRƯỚC KHI BẠN TỚI.',
    'THÊM MỘT LƯỢT NỮA LÀ BẢNG PHẢI NHÍCH QUA CHO BẠN.',
    'TOP 11 KHÓA CỬA RỒI. CỬA SỔ VẪN MỞ TOANG.',
  ],
  zh: [
    '排行榜给你留了个座位，在停车场。',
    '就差一点！前 11 名已经听到你在敲门了。',
    '你的分数正在路上，它停下来买零食了。',
    '你来之前，排行榜刚好踩到了香蕉皮。',
    '再骑一次，排行榜就得给你挪位置了。',
    '前 11 名锁上了门，可窗户还开着呢。',
  ],
};

const BELOW_TOP: Record<Lang, readonly string[]> = {
  en: [
    'ON THE BOARD! #1 IS NERVOUSLY POLISHING ITS TROPHY.',
    'NICE! #1 JUST SPILLED ITS LEMONADE LOOKING AT YOU.',
    '#1 CHECKED ITS MIRRORS. YOU\'RE IN THEM.',
    'THE TOP SPOT IS STILL WARM. SOMEONE JUST STOOD UP.',
    '#1 HAS STARTED WEARING A HELMET. JUST IN CASE.',
    'YOU\'RE CLIMBING! #1 IS HIDING THE LADDER.',
  ],
  es: [
    '¡EN LA TABLA! EL #1 PULE SU TROFEO MUY NERVIOSO.',
    '¡BIEN! AL #1 SE LE CAYÓ LA LIMONADA AL VERTE.',
    'EL #1 MIRÓ SUS ESPEJOS. AHÍ ESTÁS TÚ.',
    'EL PRIMER PUESTO SIGUE CALIENTITO. ALGUIEN SE ACABA DE LEVANTAR.',
    'EL #1 YA SE PUSO CASCO. POR SI ACASO.',
    '¡VAS SUBIENDO! EL #1 ESTÁ ESCONDIENDO LA ESCALERA.',
  ],
  vi: [
    'CÓ TÊN TRÊN BẢNG! HẠNG 1 ĐANG LO LẮNG LAU CÚP.',
    'HAY LẮM! HẠNG 1 VỪA LÀM ĐỔ LY NƯỚC CHANH KHI THẤY BẠN.',
    'HẠNG 1 NHÌN GƯƠNG CHIẾU HẬU. BẠN ĐANG Ở TRONG ĐÓ.',
    'GHẾ HẠNG 1 VẪN CÒN ẤM. CÓ NGƯỜI VỪA ĐỨNG DẬY.',
    'HẠNG 1 BẮT ĐẦU ĐỘI MŨ BẢO HIỂM. CHO CHẮC.',
    'BẠN ĐANG LEO LÊN! HẠNG 1 ĐANG GIẤU CÁI THANG.',
  ],
  zh: [
    '上榜了！第 1 名正紧张地擦奖杯。',
    '漂亮！第 1 名看到你，柠檬水都洒了。',
    '第 1 名看了看后视镜，里面是你。',
    '第一名的座位还热乎着，有人刚站起来。',
    '第 1 名开始戴头盔了，以防万一。',
    '你在往上爬！第 1 名正在藏梯子。',
  ],
};

/** Lines per set (same in every language). */
export const BOARD_TAUNT_COUNT = MISSED.en.length;

/**
 * The line for this viewer: `place` is their index on the board (-1 = not on it). #1 (place 0)
 * and empty boards get ''. `pick` is any integer (chosen once per game-over screen).
 */
export function boardTaunt(l: Lang, place: number, pick: number, boardSize: number): string {
  if (place === 0 || boardSize <= 0) return '';
  const set = (place < 0 ? MISSED : BELOW_TOP)[l] ?? (place < 0 ? MISSED : BELOW_TOP).en;
  return set[((pick % set.length) + set.length) % set.length];
}
