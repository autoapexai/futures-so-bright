/**
 * MINI-BOSSES: a short, punchy fight at the end of every level that has no big boss (1-9, 11-19,
 * ... 101-109). The big bosses on 10, 20, ... 110 and 111 are untouched (see Boss.ts).
 *
 * GATE: the level timer ends in the mini-boss fight and the level is only passed once it is
 * beaten. Mini-bosses never get bored and leave (big bosses still do), however long you survive.
 * Beating one is worth 1,000 x level points, times the GAME SPEED (scalePoints), still capped.
 *
 * THE LINEUP (Mr. Dan's list): every mini-boss is a gentle, G-rated cartoon with a satirical pun
 * name (never a real name or a real likeness), labelled "MINI-BOSS: NAME", with a signature pun
 * prop and Airplane!/Naked Gun-style deadpan sight gags (pratfalls, literal-minded signs, props
 * that misbehave). All lines are original. Level 1 is ROB REINDEER; then, in order and repeating:
 * JERRY SNEEZEFELD, LARRY DIVOT, NORM MACDOODLE, DAVID LETTUCEMAN, ROWDY STEVENS, RICHARD FRYER,
 * RED SOCKS, JOE YOGAN, JIM GIGGLEGAN, MEL BROOMS, CARL REINDEER. Drawn smaller than any big boss.
 * Difficulty rises smoothly with the level (miniTuning) and always stays well below the big
 * bosses, including the eased L60 and L90 fights, so there is no spike next to them.
 * The fight itself reuses BossFight (barks, weak spot, stun rings, shots) with a def.mini spec.
 *
 * ON A MISSION ONLY: the run's first mini-boss (level 1 on a normal start) is BRIDGE TROLLS
 * instead (missionFirstMiniForLevel): a few ordinary, mismatched cartoon people in everyday
 * clothes hogging a little bridge, who get bumped off and SPLASH harmlessly into the river. Same
 * slot, same level tuning, gate and bonus; every other mode and every later mini is unchanged.
 */
import type { Board, BossDef, BossFight, BossShot, BossTuning, Pattern, PopSfx } from './Boss';
import { fmtNum, lang, type Lang } from '../i18n';
import { eyes, glow, mouth, speech, star, type Pose } from './bossToons';

export interface MiniSpec {
  design: Design;
  /** 0 on the character's first appearance, 1 on the second, ... (fresh gags each time). */
  appearance: number;
  /** Shot costume per attack pattern (drawn by drawMiniShot). */
  skins: Record<string, string>;
  /** Weak-spot hit bursts and the stun burst, in the current language. */
  pops: () => [string, PopSfx][];
  stunPop: () => string;
}

type Design = 'reindeer' | 'sneezefeld' | 'divot' | 'macdoodle' | 'lettuceman' | 'rowdy' | 'fryer' | 'socks' | 'yogan' | 'gigglegan' | 'brooms' | 'elder' | 'bridgetrolls';

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
  reindeer: { name: 'ROB REINDEER', tint: '#ffd166', sig: 'spray', skins: { aimed: 'clap', spray: 'reel' }, sfx: ['honk', 'boing', 'whistleUp'] },
  sneezefeld: { name: 'JERRY SNEEZEFELD', tint: '#fff3d6', sig: 'spray', skins: { spray: 'tissue', aimed: 'tissue', wall: 'tissue' }, sfx: ['boing', 'honk', 'whistleUp'] },
  divot: { name: 'LARRY DIVOT', tint: '#d8c59a', sig: 'dots', skins: { dots: 'golf', aimed: 'golf', wall: 'coffee', spray: 'golf' }, sfx: ['honk', 'whistleDown', 'boing'] },
  macdoodle: { name: 'NORM MACDOODLE', tint: '#b8c7d6', sig: 'homing', skins: { homing: 'moth', aimed: 'moth', wall: 'moth', spray: 'moth' }, sfx: ['whistleDown', 'honk', 'boing'] },
  lettuceman: { name: 'DAVID LETTUCEMAN', tint: '#8fc1ff', sig: 'tumble', skins: { tumble: 'card', aimed: 'pencil', wall: 'card', spray: 'pencil' }, sfx: ['whistleUp', 'honk', 'boing'] },
  rowdy: { name: 'ROWDY STEVENS', tint: '#ff6b6b', sig: 'spray', skins: { spray: 'baseball', aimed: 'baseball', wall: 'cap' }, sfx: ['whistleUp', 'boing', 'honk'] },
  fryer: { name: 'RICHARD FRYER', tint: '#ffb347', sig: 'buckles', skins: { buckles: 'egg', aimed: 'pancake', wall: 'egg', spray: 'pancake' }, sfx: ['boing', 'whistleUp', 'honk'] },
  socks: { name: 'RED SOCKS', tint: '#d9b98c', sig: 'rain', skins: { rain: 'sock', aimed: 'boot', wall: 'hubcap', spray: 'sock' }, sfx: ['honk', 'boing', 'whistleDown'] },
  yogan: { name: 'JOE YOGAN', tint: '#9be39b', sig: 'homing', skins: { homing: 'mic', aimed: 'dumbbell', wall: 'dumbbell', spray: 'mic' }, sfx: ['honk', 'whistleUp', 'boing'] },
  gigglegan: { name: 'JIM GIGGLEGAN', tint: '#ffd6a5', sig: 'rain', skins: { rain: 'pocket', aimed: 'bacon', wall: 'pocket', spray: 'bacon' }, sfx: ['boing', 'honk', 'whistleDown'] },
  brooms: { name: 'MEL BROOMS', tint: '#e3b5ff', sig: 'tumble', skins: { tumble: 'crown', aimed: 'tophat', wall: 'tophat', spray: 'crown' }, sfx: ['honk', 'boing', 'whistleUp'] },
  elder: { name: 'CARL REINDEER', tint: '#e6e6e6', sig: 'dots', skins: { dots: 'wheel', aimed: 'hourglass', wall: 'wheel', spray: 'hourglass' }, sfx: ['whistleDown', 'boing', 'honk'] },
  // ON A MISSION's first mini-boss only (never in ROTATION): see missionFirstMiniForLevel.
  bridgetrolls: { name: 'BRIDGE TROLLS', tint: '#7ec8e3', sig: 'spray', skins: { spray: 'cone', aimed: 'bobber', wall: 'cone', dots: 'bobber' }, sfx: ['honk', 'boing', 'whistleDown'] },
};

/**
 * Easing per mini-boss id (merged into Boss.ts EASE): at high GAME SPEED volleys never come
 * faster than one per realFire wall-clock seconds, shots never look faster than realShot px/s,
 * telegraphs keep realTele s and the weak spot stays put at least realDwell s (at 1.0 nothing
 * changes: the game-time values are longer). Tall lanes: stun rings turn up near the pack.
 */
export const MINI_EASE: Record<string, { realTele: number; realFire: number; realShot: number; realDwell: number; ringNear: number }> = Object.fromEntries(
  (Object.keys(DESIGNS) as Design[]).map((d) => [`mini-${d}`, { realTele: 0.45, realFire: 0.6, realShot: 900, realDwell: 0.8, ringNear: 260 }]),
);

/**
 * THE LINEUP (Mr. Dan's list). Level 1 is ROB REINDEER; every later mini-boss level takes the
 * next character in this order and the list repeats (11 characters over mini-bosses #2-#99, so each
 * shows up 9 times). Each repeat is a later level, so it is harder (miniTuning), and it opens
 * with a fresh set of gags (miniTaunt picks from a different window of the character's lines).
 */
const ROTATION: Design[] = ['sneezefeld', 'divot', 'macdoodle', 'lettuceman', 'rowdy', 'fryer', 'socks', 'yogan', 'gigglegan', 'brooms', 'elder'];

interface Words {
  /** Six original G-rated lines (three for ROB REINDEER); each appearance uses a different three. */
  taunts: string[];
  pops: [string, string, string];
  stun: string;
  /** Said during the pratfall. */
  fall: string;
  /** Prop text drawn on the character (a sign, a card, a cap), if any. */
  prop?: string;
  /** A second little sign (BRIDGE TROLLS has two). */
  prop2?: string;
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
      reindeer: { taunts: ['ACTION! WAIT, WHO CAST ALL THESE DOGS? I ASKED FOR REINDEER.', 'FROM THE TOP. THIS TIME WITH LESS BARKING AND MORE ANTLERS.', 'I SAID CUT, NOT WOOF.'], pops: ['CUT!', 'TAKE TWO!', 'ACTION!'], stun: 'QUIET ON SET!', fall: "THAT'S A WRAP!", prop: 'ROB' },
      sneezefeld: { taunts: ['EVER NOTICE DOGS IN SUNGLASSES NEVER SNEEZE? HOW DO THEY DO IT?', 'WHO DECIDED THE TISSUE BOX ALWAYS HAS ONE TISSUE LEFT? EVERY TIME!', 'I SNEEZED ONCE AND NOW THE WHOLE LEVEL SAYS BLESS YOU. WHO ARE THESE PEOPLE?', 'POLLEN IN SPACE? HOW DID POLLEN GET A ROCKET?', "WHY DO THEY CALL IT A BOSS FIGHT? I'M MORE OF A MANAGER.", 'AND THE SUN! UP THERE ALL DAY, MAKING ME SNEEZE. GET A HOBBY!'], pops: ['ACHOO!', 'BLESS ME!', 'OH, COME ON!'], stun: 'AH... AH... ACHOO!', fall: 'PASS THE TISSUES!', prop: 'TISSUES' },
      divot: { taunts: ['IS THIS A RULE NOW? DOGS JUST RUNNING AT PEOPLE? WHO DECIDED THAT?', "I'M NOT SAYING YOU'RE WRONG. I'M SAYING I'M RIGHT.", "YOU WAVED AT ME. I DIDN'T WAVE BACK. NOW IT'S A WHOLE THING.", 'ONE SWING AND I DUG UP HALF THE COURSE. THAT DIVOT HAS ITS OWN ZIP CODE.', "I'LL DODGE WHEN I'M READY. I HAVE A SYSTEM.", 'DID YOU JUST STAND IN MY DIVOT? THAT WAS MY DIVOT.'], pops: ['HEY!', 'FORE!', 'REALLY?!'], stun: '*SHRUG*', fall: "I'LL PUT THE GRASS BACK!", prop: 'FORE' },
      macdoodle: { taunts: ['I DREW A MOTH. NOW IT WILL NOT LEAVE THE LAMP.', "SO A DOG WALKS INTO A LEVEL. THAT'S IT. THAT'S THE WHOLE THING.", "I'M GOING TO STAND HERE AND DOODLE. THAT'S THE PLAN.", "THE MOTH SAYS HI. HE DOESN'T. HE'S A DOODLE.", "SOME SAY I'M DEADPAN. I SAY NOTHING. SEE?", "THAT WAS A GOOD DODGE. I'M NOT GOING TO CLAP, BUT IT WAS."], pops: ['HM.', 'SCRIBBLE.', 'WELL.'], stun: 'HUH.', fall: 'WELL, THAT HAPPENED.', prop: 'DOODLES' },
      lettuceman: { taunts: ["TONIGHT'S TOP TEN SALADS: NUMBER TEN, LETTUCE. NUMBER NINE, ALSO LETTUCE.", "WE'LL BE RIGHT BACK AFTER I THROW THIS PENCIL.", 'NUMBER FOUR: SUNGLASSES INDOORS. SUNGLASSES OUTDOORS. ALL THE SUNGLASSES.', 'TONIGHT ON THE DESK: ONE PENCIL, ONE MUG, ONE VERY CRISP HEAD OF LETTUCE.', "AND THE NUMBER ONE REASON YOU WON'T PASS: ME. I HAVE A DESK.", "I'M NOT A SALAD. I'M A HOST. A LEAFY HOST."], pops: ['NUMBER TEN!', 'CRUNCH!', 'ZING!'], stun: 'COMMERCIAL BREAK!', fall: 'LETTUCE SAY GOOD NIGHT!', prop: 'TOP 10' },
      rowdy: { taunts: ["GOOD VIBES ONLY! YOU'RE DOING GREAT! NOW STOP!", "LET'S GO, TEAM! WAIT, WHICH TEAM AM I ON?", 'HIGH FIVES FOR EVERYONE! EXCEPT THE DOGS. THEY HAVE PAWS.', 'WARMING UP THE ARM! THIS PITCH HAS FEELINGS!', "I'M NOT LOUD. I'M ROWDY. THERE'S A DIFFERENCE. IT'S THE VOLUME.", "YOU CAN DO IT! I BELIEVE IN YOU! DON'T TELL MY BOSS."], pops: ["LET'S GO!", 'YEAH!', 'STRIKE!'], stun: 'TIME OUT!', fall: 'GOOD GAME, GOOD GAME!', prop: 'ROWDY' },
      fryer: { taunts: ['I GOT A WHOLE KITCHEN AND NOBODY TO COOK FOR. YOU WANT PANCAKES?', "FLIP IT, CATCH IT, AND RUN! THAT'S THE WHOLE GAME!", 'THIS FRYING PAN HAS SEEN THINGS. MOSTLY EGGS.', "HOLD ON, I'M LAUGHING AT MY OWN JOKE. GIVE ME A SECOND.", 'THESE DOGS ARE FAST! SOMEBODY CALL THEIR MOMS!', "CAREFUL! THAT PANCAKE DOESN'T KNOW WHERE IT'S GOING. NEITHER DO I."], pops: ['SIZZLE!', 'FLIP!', 'HA HA!'], stun: 'ALL FLIPPED OUT!', fall: 'OKAY, OKAY, YOU WIN!', prop: 'PAN' },
      socks: { taunts: ['WELCOME TO THE LAUNDRY PILE! EVERYTHING IS FOR SALE. EVEN THE LINT.', 'THIS SOCK? GENUINE. GENUINELY MISSING ITS PARTNER.', 'HOLD ON, LET ME SIT DOWN. THIS ROCKING CHAIR WAS A BARGAIN.', "I'VE GOT A BOOT, HALF A LAMP, AND ONE RED SOCK. WHERE'S THE OTHER ONE?", 'YOU DOGS ARE TRACKING MUD ON MY CLEAN SOCKS!', "MY SOCK PUPPET SAYS YOU'RE TOO FAST. HE ALSO SAYS HELLO."], pops: ['CLUNK!', 'FLOP!', 'RATTLE!'], stun: 'HOLD ON NOW!', fall: 'SOLD! TO THE DOGS!', prop: 'SOCKS' },
      yogan: { taunts: ['WHOA. DOGS IN SUNGLASSES. HAVE YOU EVER REALLY THOUGHT ABOUT THAT?', "THIS MICROPHONE IS HUGE. I DON'T KNOW WHO ORDERED IT.", 'THREE-HOUR EPISODE TODAY. TOPIC: WHY ARE YOU STILL DODGING?', 'DOWNWARD DOG? MORE LIKE DOWNWARD DOGS. ALL OF YOU. RIGHT NOW.', 'I JUST HELD A YOGA POSE FOR AN HOUR. ONE HOUR. ASK THE MAT.', 'BREATHE IN. BREATHE OUT. NOW DODGE.'], pops: ['WHOA!', 'NAMASTE!', 'BOOM!'], stun: 'TOTALLY STRETCHED!', fall: "AND THAT'S THE SHOW!", prop: 'ON AIR' },
      gigglegan: { taunts: ['I WAS GOING TO EXERCISE TODAY. THEN I SAW A SNACK.', 'THIS POCKET SNACK IS FROZEN ON THE OUTSIDE AND LAVA IN THE MIDDLE.', 'BACON IS JUST BREAKFAST WITH A DRUMROLL.', "ARE THOSE DOGS RUNNING? ON PURPOSE? I'M SO TIRED FOR THEM.", "I'LL DODGE AFTER SECOND LUNCH. OR THIRD.", "HEE HEE. SORRY, I GIGGLE WHEN I'M HUNGRY. I'M ALWAYS HUNGRY."], pops: ['MMM!', 'HEE HEE!', 'NOM!'], stun: 'FOOD COMA!', fall: 'NAP TIME!', prop: 'SNACKS' },
      brooms: { taunts: ['HEAR YE! THE KING DECLARES: NO RUNNING IN THE KINGDOM! ALSO, SWEEP UP.', 'I HAVE A HAT FOR EVERY OCCASION. THIS IS MY THROWING HAT.', 'BRING ME MY CROWN! NO, THE SILLY ONE!', 'ROYAL DECREE: ALL DOGS MUST WEAR SUNGLASSES. OH. THEY DO.', "I'VE BEEN A KING, A COWBOY AND A CHEF. TODAY I'M A BROOM.", 'HALT, IN THE NAME OF THE BROOM! I SHALL SWEEP YOU OFF YOUR PAWS!'], pops: ['OY!', 'MY HAT!', 'SWISH!'], stun: 'THE CROWN SLIPPED!', fall: 'EXIT, STAGE LEFT!', prop: 'BROOM' },
      elder: { taunts: ["I'M THE ORIGINAL REINDEER. MY SON GOT HIS ANTLERS FROM ME.", "BACK IN MY DAY, WE DIDN'T HAVE LEVELS. WE HAD ROCKS.", 'THIS CANE IS OLDER THAN THE WHEEL. I CHECKED.', 'I REMEMBER WHEN THE SUN WAS A LITTLE SMALLER.', 'SLOW DOWN, YOUNG PUPS! SOME OF US ARE ANCIENT!', 'I INVENTED THE NAP. NOBODY EVER GIVES ME CREDIT.'], pops: ['OOF!', 'HMPH!', 'TAP TAP!'], stun: "WHERE'S MY CANE?", fall: 'TIME FOR A NAP!', prop: 'DAD' },
      bridgetrolls: { taunts: ['THIS IS OUR BRIDGE! GO AROUND!', 'NO HONKING! WE ARE GRUMBLING IN PEACE HERE.', 'THIS BRIDGE IS CLOSED... FOR FUN!'], pops: ['HEY!', 'HMPH!', 'NO HONKING!'], stun: 'WOBBLY BRIDGE!', fall: 'SPLASH! ON PURPOSE!', prop: 'NO FUN', prop2: 'NO HONKING' },
    },
  },
  es: {
    tag: 'MINIJEFE',
    gate: '¡VÉNCELO PARA PASAR EL NIVEL {n}!',
    beaten: 'MINIJEFE K.O.  ·  +{p}',
    words: {
      reindeer: { taunts: ['¡ACCIÓN! ESPERA, ¿QUIÉN CONTRATÓ A TANTOS PERROS? YO PEDÍ RENOS.', 'DESDE EL PRINCIPIO. ESTA VEZ CON MENOS LADRIDOS Y MÁS ASTAS.', 'DIJE «CORTEN», NO «GUAU».'], pops: ['¡CORTEN!', '¡TOMA DOS!', '¡ACCIÓN!'], stun: '¡SILENCIO EN EL SET!', fall: '¡FIN DEL RODAJE!', prop: 'ROB' },
      sneezefeld: { taunts: ['¿NO HAS NOTADO QUE LOS PERROS CON GAFAS DE SOL NUNCA ESTORNUDAN? ¿CÓMO LO HACEN?', '¿QUIÉN DECIDIÓ QUE A LA CAJA SIEMPRE LE QUEDE UN SOLO PAÑUELO? ¡SIEMPRE!', 'ESTORNUDÉ UNA VEZ Y AHORA TODO EL NIVEL DICE «SALUD». ¿QUIÉN ES ESTA GENTE?', '¿POLEN EN EL ESPACIO? ¿CÓMO CONSIGUIÓ UN COHETE EL POLEN?', '¿POR QUÉ LE DICEN PELEA DE JEFE? YO SOY MÁS BIEN GERENTE.', '¡Y EL SOL! AHÍ ARRIBA TODO EL DÍA, HACIÉNDOME ESTORNUDAR. ¡BÚSCATE UN PASATIEMPO!'], pops: ['¡ACHÍS!', '¡SALUD A MÍ!', '¡AY, POR FAVOR!'], stun: '¡AH... AH... ACHÍS!', fall: '¡PÁSENME LOS PAÑUELOS!', prop: 'PAÑUELOS' },
      divot: { taunts: ['¿AHORA ES UNA REGLA? ¿PERROS CORRIENDO HACIA LA GENTE? ¿QUIÉN LO DECIDIÓ?', 'NO DIGO QUE ESTÉS EQUIVOCADO. DIGO QUE YO TENGO RAZÓN.', 'ME SALUDASTE. NO TE DEVOLVÍ EL SALUDO. AHORA ES TODO UN TEMA.', 'UN GOLPE Y ARRANQUÉ MEDIO CAMPO. ESE TROZO DE CÉSPED TIENE SU PROPIO CÓDIGO POSTAL.', 'ESQUIVARÉ CUANDO ESTÉ LISTO. TENGO UN SISTEMA.', '¿TE PARASTE EN MI HOYITO DE CÉSPED? ESE ERA MI HOYITO.'], pops: ['¡OYE!', '¡BOLA VA!', '¡¿EN SERIO?!'], stun: '¿Y QUÉ?', fall: '¡YA PONGO EL CÉSPED!', prop: 'FORE' },
      macdoodle: { taunts: ['DIBUJÉ UNA POLILLA. AHORA NO SE QUIERE IR DE LA LÁMPARA.', 'ENTONCES UN PERRO ENTRA A UN NIVEL. YA. ESO ES TODO.', 'ME VOY A QUEDAR AQUÍ GARABATEANDO. ESE ES EL PLAN.', 'LA POLILLA TE SALUDA. NO ES CIERTO. ES UN GARABATO.', 'DICEN QUE SOY INEXPRESIVO. YO NO DIGO NADA. ¿VES?', 'BUENA ESQUIVADA. NO VOY A APLAUDIR, PERO LO FUE.'], pops: ['MM.', 'GARABATO.', 'PUES.'], stun: 'AJÁ.', fall: 'BUENO, ESO PASÓ.', prop: 'GARABATOS' },
      lettuceman: { taunts: ['EL TOP 10 DE ENSALADAS DE HOY: NÚMERO DIEZ, LECHUGA. NÚMERO NUEVE, TAMBIÉN LECHUGA.', 'VOLVEMOS DESPUÉS DE QUE LANCE ESTE LÁPIZ.', 'NÚMERO CUATRO: GAFAS DE SOL ADENTRO. GAFAS DE SOL AFUERA. TODAS LAS GAFAS.', 'HOY EN EL ESCRITORIO: UN LÁPIZ, UNA TAZA Y UNA LECHUGA MUY CRUJIENTE.', 'Y LA RAZÓN NÚMERO UNO POR LA QUE NO PASARÁS: YO. TENGO UN ESCRITORIO.', 'NO SOY UNA ENSALADA. SOY UN PRESENTADOR. UN PRESENTADOR CON HOJAS.'], pops: ['¡NÚMERO DIEZ!', '¡CRUNCH!', '¡ZAS!'], stun: '¡PAUSA COMERCIAL!', fall: '¡BUENAS NOCHES, LECHUGUITAS!', prop: 'TOP 10' },
      rowdy: { taunts: ['¡SOLO BUENA ONDA! ¡LO ESTÁS HACIENDO GENIAL! ¡AHORA PARA!', '¡VAMOS, EQUIPO! ESPERA, ¿EN QUÉ EQUIPO ESTOY?', '¡CHOCA ESOS CINCO TODO EL MUNDO! MENOS LOS PERROS. TIENEN PATAS.', '¡CALENTANDO EL BRAZO! ¡ESTE LANZAMIENTO TIENE SENTIMIENTOS!', 'NO SOY RUIDOSO. SOY ALBOROTADOR. HAY UNA DIFERENCIA: EL VOLUMEN.', '¡TÚ PUEDES! ¡CREO EN TI! NO SE LO DIGAS A MI JEFE.'], pops: ['¡VAMOS!', '¡SÍ!', '¡STRIKE!'], stun: '¡TIEMPO FUERA!', fall: '¡BUEN JUEGO, BUEN JUEGO!', prop: 'ROWDY' },
      fryer: { taunts: ['TENGO UNA COCINA ENTERA Y NADIE PARA QUIEN COCINAR. ¿QUIERES PANQUEQUES?', '¡VOLTÉALO, ATRÁPALO Y CORRE! ¡ESE ES TODO EL JUEGO!', 'ESTA SARTÉN HA VISTO COSAS. SOBRE TODO HUEVOS.', 'ESPERA, ME ESTOY RIENDO DE MI PROPIO CHISTE. DAME UN SEGUNDO.', '¡ESTOS PERROS SON RÁPIDOS! ¡QUE ALGUIEN LLAME A SUS MAMÁS!', '¡CUIDADO! ESE PANQUEQUE NO SABE A DÓNDE VA. YO TAMPOCO.'], pops: ['¡CHISS!', '¡VUELTA!', '¡JA, JA!'], stun: '¡TODO VOLTEADO!', fall: '¡VALE, VALE, TÚ GANAS!', prop: 'SARTÉN' },
      socks: { taunts: ['¡BIENVENIDOS AL MONTÓN DE ROPA! TODO ESTÁ A LA VENTA. HASTA LA PELUSA.', '¿ESTE CALCETÍN? AUTÉNTICO. AUTÉNTICAMENTE SIN SU PAREJA.', 'ESPERA, DÉJAME SENTARME. ESTA MECEDORA FUE UNA GANGA.', 'TENGO UNA BOTA, MEDIA LÁMPARA Y UN CALCETÍN ROJO. ¿DÓNDE ESTÁ EL OTRO?', '¡PERROS, ESTÁN LLENANDO DE LODO MIS CALCETINES LIMPIOS!', 'MI TÍTERE DE CALCETÍN DICE QUE ERES DEMASIADO RÁPIDO. TAMBIÉN DICE HOLA.'], pops: ['¡CLONC!', '¡PLAF!', '¡TRAC, TRAC!'], stun: '¡UN MOMENTO!', fall: '¡VENDIDO A LOS PERROS!', prop: 'CALCETINES' },
      yogan: { taunts: ['UAU. PERROS CON GAFAS DE SOL. ¿ALGUNA VEZ LO HAS PENSADO EN SERIO?', 'ESTE MICRÓFONO ES ENORME. NO SÉ QUIÉN LO PIDIÓ.', 'EPISODIO DE TRES HORAS HOY. TEMA: ¿POR QUÉ SIGUES ESQUIVANDO?', '¿PERRO BOCA ABAJO? MÁS BIEN PERROS BOCA ABAJO. TODOS USTEDES. AHORA.', 'ACABO DE AGUANTAR UNA POSTURA DE YOGA UNA HORA. UNA HORA. PREGÚNTALE A LA ESTERILLA.', 'INHALA. EXHALA. AHORA ESQUIVA.'], pops: ['¡UAU!', '¡NAMASTÉ!', '¡BUM!'], stun: '¡SUPERESTIRADO!', fall: '¡Y ESO FUE TODO EL PROGRAMA!', prop: 'AL AIRE' },
      gigglegan: { taunts: ['HOY IBA A HACER EJERCICIO. LUEGO VI UNA BOTANA.', 'ESTA EMPANADA DE BOLSILLO ESTÁ CONGELADA POR FUERA Y ES LAVA POR DENTRO.', 'EL TOCINO ES SOLO DESAYUNO CON REDOBLE DE TAMBOR.', '¿ESOS PERROS ESTÁN CORRIENDO? ¿A PROPÓSITO? QUÉ CANSANCIO ME DAN.', 'ESQUIVARÉ DESPUÉS DEL SEGUNDO ALMUERZO. O DEL TERCERO.', 'JI, JI. PERDÓN, ME DA LA RISA CUANDO TENGO HAMBRE. SIEMPRE TENGO HAMBRE.'], pops: ['¡MMM!', '¡JI, JI!', '¡ÑAM!'], stun: '¡SIESTA DIGESTIVA!', fall: '¡HORA DE LA SIESTA!', prop: 'BOTANAS' },
      brooms: { taunts: ['¡OÍD, OÍD! EL REY DECLARA: ¡PROHIBIDO CORRER EN EL REINO! Y A BARRER.', 'TENGO UN SOMBRERO PARA CADA OCASIÓN. ESTE ES MI SOMBRERO PARA LANZAR.', '¡TRAEDME MI CORONA! ¡NO, LA CHISTOSA!', 'DECRETO REAL: TODOS LOS PERROS DEBEN USAR GAFAS DE SOL. AH. YA LAS USAN.', 'HE SIDO REY, VAQUERO Y CHEF. HOY SOY UNA ESCOBA.', '¡ALTO, EN NOMBRE DE LA ESCOBA! ¡OS BARRERÉ DE VUESTRAS PATAS!'], pops: ['¡AY!', '¡MI SOMBRERO!', '¡FIUU!'], stun: '¡SE ME RESBALÓ LA CORONA!', fall: '¡MUTIS POR LA IZQUIERDA!', prop: 'ESCOBA' },
      elder: { taunts: ['SOY EL RENO ORIGINAL. MI HIJO SACÓ LAS ASTAS DE MÍ.', 'EN MIS TIEMPOS NO HABÍA NIVELES. HABÍA PIEDRAS.', 'ESTE BASTÓN ES MÁS VIEJO QUE LA RUEDA. LO COMPROBÉ.', 'RECUERDO CUANDO EL SOL ERA UN POQUITO MÁS PEQUEÑO.', '¡MÁS DESPACIO, CACHORROS! ¡ALGUNOS SOMOS ANTIQUÍSIMOS!', 'YO INVENTÉ LA SIESTA. NADIE ME DA EL CRÉDITO.'], pops: ['¡UF!', '¡HMPF!', '¡TOC, TOC!'], stun: '¿DÓNDE ESTÁ MI BASTÓN?', fall: '¡HORA DE LA SIESTA!', prop: 'PAPÁ' },
      bridgetrolls: { taunts: ['¡ESTE ES NUESTRO PUENTE! ¡DA LA VUELTA!', '¡NADA DE BOCINAZOS! AQUÍ REFUNFUÑAMOS EN PAZ.', 'ESTE PUENTE ESTÁ CERRADO... ¡A LA DIVERSIÓN!'], pops: ['¡OYE!', '¡HMPF!', '¡SIN BOCINAZOS!'], stun: '¡EL PUENTE SE TAMBALEA!', fall: '¡CHAPUZÓN! ¡A PROPÓSITO!', prop: 'SIN DIVERSIÓN', prop2: 'SIN BOCINAS' },
    },
  },
  vi: {
    tag: 'TRÙM NHỎ',
    gate: 'HẠ NÓ ĐỂ QUA CẤP {n}',
    beaten: 'HẠ TRÙM NHỎ  ·  +{p}',
    words: {
      reindeer: { taunts: ['DIỄN! KHOAN, AI MỜI CẢ ĐÀN CHÓ NÀY VẬY? TÔI ĐẶT TUẦN LỘC CƠ MÀ.', 'LÀM LẠI TỪ ĐẦU. LẦN NÀY BỚT SỦA, THÊM GẠC.', 'TÔI BẢO «CẮT», CHỨ ĐÂU BẢO «GÂU».'], pops: ['CẮT!', 'QUAY LẠI!', 'DIỄN!'], stun: 'IM LẶNG!', fall: 'ĐÓNG MÁY!', prop: 'ROB' },
      sneezefeld: { taunts: ['BẠN CÓ ĐỂ Ý LÀ CHÓ ĐEO KÍNH RÂM KHÔNG BAO GIỜ HẮT XÌ KHÔNG? SAO HAY VẬY?', 'AI QUYẾT ĐỊNH HỘP KHĂN GIẤY LÚC NÀO CŨNG CÒN ĐÚNG MỘT TỜ? LẦN NÀO CŨNG VẬY!', 'TÔI HẮT XÌ MỘT CÁI, GIỜ CẢ MÀN CHƠI ĐỀU NÓI «SỐNG LÂU». MẤY NGƯỜI NÀY LÀ AI VẬY?', 'PHẤN HOA TRÊN VŨ TRỤ À? PHẤN HOA LẤY ĐÂU RA TÊN LỬA?', 'SAO GỌI LÀ ĐÁNH TRÙM? TÔI GIỐNG QUẢN LÝ HƠN.', 'CÒN MẶT TRỜI NỮA! Ở TRÊN ĐÓ CẢ NGÀY, LÀM TÔI HẮT XÌ. KIẾM SỞ THÍCH ĐI CHỨ!'], pops: ['HẮT XÌ!', 'TỰ CHÚC MÌNH!', 'THÔI MÀ!'], stun: 'HA... HA... HẮT XÌ!', fall: 'ĐƯA KHĂN GIẤY ĐÂY!', prop: 'KHĂN GIẤY' },
      divot: { taunts: ['GIỜ ĐÂY LÀ LUẬT À? CHÓ CỨ CHẠY THẲNG VÀO NGƯỜI TA? AI QUYẾT VẬY?', 'TÔI KHÔNG NÓI BẠN SAI. TÔI NÓI TÔI ĐÚNG.', 'BẠN VẪY TAY VỚI TÔI. TÔI KHÔNG VẪY LẠI. GIỜ THÀNH CẢ MỘT CHUYỆN.', 'VUNG GẬY MỘT CÁI, TÔI XỚI TUNG NỬA SÂN GÔN. MIẾNG CỎ ĐÓ CÓ CẢ MÃ BƯU ĐIỆN RIÊNG.', 'KHI NÀO SẴN SÀNG TÔI SẼ NÉ. TÔI CÓ HỆ THỐNG.', 'BẠN VỪA ĐỨNG VÀO CHỖ CỎ BỊ XỚI CỦA TÔI À? CHỖ ĐÓ LÀ CỦA TÔI.'], pops: ['NÀY!', 'CẨN THẬN BÓNG!', 'THẬT HẢ?!'], stun: '*NHÚN VAI*', fall: 'TÔI SẼ TRẢ CỎ LẠI!', prop: 'FORE' },
      macdoodle: { taunts: ['TÔI VẼ MỘT CON BƯỚM ĐÊM. GIỜ NÓ KHÔNG CHỊU RỜI CÁI ĐÈN.', 'RỒI MỘT CON CHÓ BƯỚC VÀO MÀN CHƠI. HẾT. CHUYỆN CHỈ CÓ VẬY.', 'TÔI SẼ ĐỨNG ĐÂY VÀ VẼ NGUỆCH NGOẠC. KẾ HOẠCH LÀ VẬY.', 'CON BƯỚM ĐÊM GỬI LỜI CHÀO. KHÔNG ĐÂU. NÓ LÀ HÌNH VẼ MÀ.', 'NGƯỜI TA BẢO TÔI MẶT LẠNH. TÔI KHÔNG NÓI GÌ. THẤY CHƯA?', 'NÉ HAY ĐẤY. TÔI SẼ KHÔNG VỖ TAY, NHƯNG HAY THẬT.'], pops: ['Ừ.', 'NGOÁY NGOÁY.', 'CHÀ.'], stun: 'HỬM.', fall: 'CHÀ, CHUYỆN ĐÓ ĐÃ XẢY RA.', prop: 'HÌNH VẼ' },
      lettuceman: { taunts: ['TOP 10 MÓN SALAD TỐI NAY: SỐ MƯỜI, XÀ LÁCH. SỐ CHÍN, CŨNG LÀ XÀ LÁCH.', 'CHÚNG TÔI SẼ TRỞ LẠI SAU KHI TÔI NÉM CÂY BÚT CHÌ NÀY.', 'SỐ BỐN: KÍNH RÂM TRONG NHÀ. KÍNH RÂM NGOÀI TRỜI. TẤT CẢ KÍNH RÂM.', 'TRÊN BÀN TỐI NAY: MỘT CÂY BÚT CHÌ, MỘT CÁI CỐC, MỘT CÂY XÀ LÁCH THẬT GIÒN.', 'VÀ LÝ DO SỐ MỘT BẠN KHÔNG QUA ĐƯỢC: TÔI. TÔI CÓ CÁI BÀN.', 'TÔI KHÔNG PHẢI ĐĨA SALAD. TÔI LÀ NGƯỜI DẪN CHƯƠNG TRÌNH. MỘT NGƯỜI DẪN NHIỀU LÁ.'], pops: ['SỐ MƯỜI!', 'RỘP!', 'VÚT!'], stun: 'QUẢNG CÁO!', fall: 'XÀ LÁCH CHÚC NGỦ NGON!', prop: 'TOP 10' },
      rowdy: { taunts: ['CHỈ TOÀN NĂNG LƯỢNG VUI! BẠN ĐANG LÀM RẤT TỐT! GIỜ DỪNG LẠI ĐI!', 'CỐ LÊN CẢ ĐỘI! KHOAN, TÔI Ở ĐỘI NÀO NHỈ?', 'ĐẬP TAY VỚI MỌI NGƯỜI! TRỪ ĐÀN CHÓ. CHÚNG CÓ CHÂN.', 'KHỞI ĐỘNG CÁNH TAY! CÚ NÉM NÀY CÓ CẢM XÚC ĐẤY!', 'TÔI KHÔNG ỒN. TÔI NÁO NHIỆT. KHÁC NHAU ĐẤY: Ở ÂM LƯỢNG.', 'BẠN LÀM ĐƯỢC! TÔI TIN BẠN! ĐỪNG MÁCH SẾP TÔI NHÉ.'], pops: ['CỐ LÊN!', 'YEAH!', 'STRIKE!'], stun: 'TẠM DỪNG!', fall: 'TRẬN HAY, TRẬN HAY!', prop: 'ROWDY' },
      fryer: { taunts: ['TÔI CÓ CẢ CĂN BẾP MÀ KHÔNG CÓ AI ĐỂ NẤU CHO. BẠN MUỐN ĂN BÁNH KẾP KHÔNG?', 'LẬT NÓ, BẮT NÓ, RỒI CHẠY! TRÒ CHƠI CHỈ CÓ VẬY!', 'CÁI CHẢO NÀY TỪNG TRẢI LẮM. CHỦ YẾU LÀ TRỨNG.', 'KHOAN, TÔI ĐANG CƯỜI CHUYỆN CỦA CHÍNH MÌNH. CHỜ TÔI CHÚT.', 'ĐÀN CHÓ NÀY NHANH QUÁ! AI GỌI MẸ CHÚNG ĐI!', 'CẨN THẬN! CÁI BÁNH KẾP ĐÓ KHÔNG BIẾT NÓ BAY ĐI ĐÂU. TÔI CŨNG VẬY.'], pops: ['XÈO XÈO!', 'LẬT!', 'HA HA!'], stun: 'LẬT TUNG CẢ LÊN!', fall: 'THÔI ĐƯỢC, BẠN THẮNG!', prop: 'CHẢO' },
      socks: { taunts: ['CHÀO MỪNG ĐẾN ĐỐNG ĐỒ GIẶT! MỌI THỨ ĐỀU BÁN. CẢ XƠ VẢI CŨNG BÁN.', 'CHIẾC TẤT NÀY À? HÀNG THẬT. THẬT SỰ LẠC MẤT CHIẾC KIA.', 'KHOAN, ĐỂ TÔI NGỒI ĐÃ. CÁI GHẾ BẬP BÊNH NÀY MUA RẺ LẮM.', 'TÔI CÓ MỘT CHIẾC ỦNG, NỬA CÁI ĐÈN, VÀ MỘT CHIẾC TẤT ĐỎ. CHIẾC KIA ĐÂU RỒI?', 'ĐÀN CHÓ KIA LÀM DÍNH BÙN LÊN ĐÔI TẤT SẠCH CỦA TÔI!', 'CON RỐI TẤT CỦA TÔI BẢO BẠN NHANH QUÁ. NÓ CŨNG GỬI LỜI CHÀO.'], pops: ['CẠCH!', 'PHỊCH!', 'LỌC CỌC!'], stun: 'KHOAN ĐÃ NÀO!', fall: 'BÁN! CHO ĐÀN CHÓ!', prop: 'TẤT' },
      yogan: { taunts: ['CHÀ. CHÓ ĐEO KÍNH RÂM. BẠN ĐÃ BAO GIỜ THẬT SỰ NGHĨ VỀ ĐIỀU ĐÓ CHƯA?', 'CÁI MICRO NÀY TO QUÁ. TÔI KHÔNG BIẾT AI ĐẶT NÓ.', 'TẬP HÔM NAY DÀI BA TIẾNG. CHỦ ĐỀ: SAO BẠN VẪN CÒN NÉ?', 'TƯ THẾ CHÓ ÚP MẶT À? PHẢI LÀ CẢ ĐÀN CHÓ ÚP MẶT. TẤT CẢ CÁC BẠN. NGAY BÂY GIỜ.', 'TÔI VỪA GIỮ MỘT TƯ THẾ YOGA SUỐT MỘT TIẾNG. MỘT TIẾNG. HỎI CÁI THẢM MÀ XEM.', 'HÍT VÀO. THỞ RA. GIỜ THÌ NÉ.'], pops: ['CHÀ!', 'NAMASTE!', 'BÙM!'], stun: 'DÃN HẾT CỠ!', fall: 'VÀ CHƯƠNG TRÌNH KẾT THÚC!', prop: 'ĐANG PHÁT' },
      gigglegan: { taunts: ['HÔM NAY TÔI ĐỊNH TẬP THỂ DỤC. RỒI TÔI THẤY ĐỒ ĂN VẶT.', 'CÁI BÁNH KẸP NÀY NGOÀI THÌ ĐÔNG ĐÁ, TRONG THÌ NÓNG NHƯ DUNG NHAM.', 'THỊT XÔNG KHÓI CHỈ LÀ BỮA SÁNG CÓ TIẾNG TRỐNG DẠO ĐẦU.', 'MẤY CON CHÓ ĐÓ ĐANG CHẠY À? CỐ Ý LUÔN? TÔI MỆT THAY CHO CHÚNG.', 'ĂN TRƯA LẦN HAI XONG TÔI SẼ NÉ. HOẶC LẦN BA.', 'HI HI. XIN LỖI, ĐÓI LÀ TÔI CƯỜI KHÚC KHÍCH. MÀ TÔI LÚC NÀO CŨNG ĐÓI.'], pops: ['NGON!', 'HI HI!', 'MĂM!'], stun: 'NO QUÁ BUỒN NGỦ!', fall: 'GIỜ NGỦ TRƯA!', prop: 'ĐỒ ĂN VẶT' },
      brooms: { taunts: ['NGHE ĐÂY! NHÀ VUA TUYÊN BỐ: CẤM CHẠY TRONG VƯƠNG QUỐC! VÀ NHỚ QUÉT DỌN.', 'TÔI CÓ MŨ CHO MỌI DỊP. ĐÂY LÀ MŨ ĐỂ NÉM.', 'MANG VƯƠNG MIỆN RA ĐÂY! KHÔNG, CÁI NGỘ NGHĨNH CƠ!', 'CHIẾU CHỈ: MỌI CON CHÓ PHẢI ĐEO KÍNH RÂM. Ồ. CHÚNG ĐEO RỒI.', 'TÔI TỪNG LÀ VUA, CAO BỒI VÀ ĐẦU BẾP. HÔM NAY TÔI LÀ CÂY CHỔI.', 'ĐỨNG LẠI, NHÂN DANH CÂY CHỔI! TA SẼ QUÉT CÁC NGƯƠI BAY ĐI!'], pops: ['ÔI!', 'MŨ CỦA TA!', 'VÚT VÚT!'], stun: 'VƯƠNG MIỆN TUỘT RỒI!', fall: 'XIN LUI VÀO CÁNH GÀ!', prop: 'CHỔI' },
      elder: { taunts: ['TÔI LÀ CHÚ TUẦN LỘC ĐẦU TIÊN. CON TRAI TÔI ĐƯỢC CẶP GẠC LÀ NHỜ TÔI.', 'HỒI XƯA LÀM GÌ CÓ MÀN CHƠI. CHỈ CÓ ĐÁ THÔI.', 'CÂY GẬY NÀY CÒN GIÀ HƠN CẢ BÁNH XE. TÔI KIỂM TRA RỒI.', 'TÔI CÒN NHỚ HỒI MẶT TRỜI NHỎ HƠN MỘT CHÚT.', 'CHẬM LẠI NÀO, MẤY CÚN CON! CÓ NGƯỜI CỔ XƯA LẮM RỒI!', 'TÔI PHÁT MINH RA GIẤC NGỦ TRƯA. CHẲNG AI GHI CÔNG TÔI CẢ.'], pops: ['ỐI!', 'HỪM!', 'CỘC CỘC!'], stun: 'GẬY CỦA TÔI ĐÂU?', fall: 'ĐẾN GIỜ NGỦ TRƯA!', prop: 'BỐ' },
      bridgetrolls: { taunts: ['ĐÂY LÀ CẦU CỦA CHÚNG TÔI! ĐI ĐƯỜNG KHÁC ĐI!', 'CẤM BÓP CÒI! CHÚNG TÔI ĐANG CẰN NHẰN YÊN BÌNH Ở ĐÂY.', 'CẦU NÀY ĐÓNG CỬA... KHÔNG TIẾP NIỀM VUI!'], pops: ['NÀY!', 'HỨ!', 'CẤM BÓP CÒI!'], stun: 'CẦU RUNG RINH!', fall: 'ÙM! CỐ Ý ĐẤY!', prop: 'CẤM VUI', prop2: 'CẤM BÓP CÒI' },
    },
  },
  zh: {
    tag: '小头目',
    gate: '打败它才能通过第 {n} 关',
    beaten: '击败小头目  ·  +{p}',
    words: {
      reindeer: { taunts: ['开拍！等等，这么多狗是谁请来的？我要的是驯鹿。', '从头再来。这次少叫几声，多点鹿角。', '我说的是“咔”，不是“汪”。'], pops: ['咔！', '再来一条！', '开拍！'], stun: '现场安静！', fall: '杀青！', prop: 'ROB' },
      sneezefeld: { taunts: ['你有没有发现，戴墨镜的狗从来不打喷嚏？它们怎么做到的？', '是谁规定纸巾盒里永远只剩一张纸巾？每次都这样！', '我打了一个喷嚏，现在整关的人都在说“长命百岁”。这些人是谁？', '太空里有花粉？花粉从哪儿弄来的火箭？', '为什么叫打头目？我更像个经理。', '还有太阳！整天挂在上面，害我打喷嚏。找点爱好吧！'], pops: ['阿嚏！', '保佑我！', '拜托！'], stun: '阿……阿……阿嚏！', fall: '快递纸巾！', prop: '纸巾' },
      divot: { taunts: ['现在这算规矩吗？狗直接冲着人跑？谁定的？', '我没说你错。我是说我对。', '你冲我挥手，我没挥回去。现在成了一件大事。', '一杆下去，我把半个球场都挖起来了。那块草皮都有自己的邮编了。', '我准备好了自然会躲。我有一套方法。', '你刚才站在我的草皮坑里了？那是我的坑。'], pops: ['喂！', '看球！', '真的假的？！'], stun: '*耸肩*', fall: '我会把草皮放回去！', prop: 'FORE' },
      macdoodle: { taunts: ['我画了一只飞蛾。现在它赖在台灯边不走了。', '一只狗走进了一关。就这样。完了。', '我就站在这儿涂鸦。这就是计划。', '飞蛾向你问好。其实没有。它是涂鸦。', '有人说我面无表情。我什么也不说。看到没？', '躲得不错。我不会鼓掌，但确实不错。'], pops: ['嗯。', '涂涂。', '这样啊。'], stun: '哈？', fall: '好吧，发生了。', prop: '涂鸦' },
      lettuceman: { taunts: ['今晚十大沙拉：第十名，生菜。第九名，还是生菜。', '等我扔完这支铅笔，马上回来。', '第四名：室内戴墨镜。室外戴墨镜。所有墨镜。', '今晚桌上：一支铅笔，一个杯子，一棵特别脆的生菜。', '你过不了关的头号原因：我。我有一张桌子。', '我不是沙拉。我是主持人。一个长叶子的主持人。'], pops: ['第十名！', '咔嚓！', '嗖！'], stun: '插播广告！', fall: '生菜祝大家晚安！', prop: 'TOP 10' },
      rowdy: { taunts: ['只要好心情！你做得很棒！现在停下！', '加油，队友们！等等，我是哪一队的？', '大家击个掌！狗除外。它们只有爪子。', '热身胳膊！这一球是有感情的！', '我不是吵。我是闹腾。有区别的：区别在音量。', '你能行！我相信你！别告诉我老板。'], pops: ['加油！', '耶！', '好球！'], stun: '暂停！', fall: '好比赛，好比赛！', prop: 'ROWDY' },
      fryer: { taunts: ['我有一整个厨房，却没人可以做饭给他吃。你要松饼吗？', '翻一下，接住，快跑！游戏就这么简单！', '这口平底锅见过大世面。主要是鸡蛋。', '等等，我在笑我自己的笑话。给我一秒钟。', '这些狗跑得真快！快叫它们的妈妈来！', '小心！那块松饼不知道要飞去哪儿。我也不知道。'], pops: ['滋滋！', '翻！', '哈哈！'], stun: '翻得团团转！', fall: '好啦好啦，你赢了！', prop: '平底锅' },
      socks: { taunts: ['欢迎来到脏衣服堆！什么都卖。连线头都卖。', '这只袜子？正品。货真价实地丢了另一只。', '等等，让我坐下。这把摇椅可是捡了便宜。', '我有一只靴子、半盏灯，还有一只红袜子。另一只去哪儿了？', '你们这些狗，把泥巴踩到我干净的袜子上了！', '我的袜子木偶说你太快了。它还说你好。'], pops: ['哐当！', '啪嗒！', '咔啦咔啦！'], stun: '等一下！', fall: '成交！卖给狗狗！', prop: '袜子' },
      yogan: { taunts: ['哇。戴墨镜的狗。你有没有认真想过这件事？', '这个麦克风太大了。我不知道是谁订的。', '今天这期三小时。主题：你为什么还在躲？', '下犬式？应该叫下犬们式。你们全部。现在。', '我刚保持一个瑜伽姿势一小时。一小时。不信问垫子。', '吸气。呼气。现在躲。'], pops: ['哇！', '合十！', '砰！'], stun: '拉伸到底！', fall: '本期节目到此结束！', prop: '直播中' },
      gigglegan: { taunts: ['我今天本来要去锻炼。然后我看到了零食。', '这个口袋点心外面冻得硬邦邦，里面烫得像岩浆。', '培根就是配了鼓声的早餐。', '那些狗在跑步？主动跑？我替它们累。', '等我吃完第二顿午饭再躲。或者第三顿。', '嘻嘻。抱歉，我一饿就傻笑。而我总是饿。'], pops: ['嗯——！', '嘻嘻！', '吧唧！'], stun: '吃撑犯困！', fall: '午睡时间！', prop: '零食' },
      brooms: { taunts: ['听着！国王宣布：王国里禁止奔跑！还有，扫扫地。', '我每种场合都有一顶帽子。这顶是用来扔的。', '把我的王冠拿来！不，要那顶搞笑的！', '皇家法令：所有狗都必须戴墨镜。哦，它们戴了。', '我当过国王、牛仔和厨师。今天我是一把扫帚。', '以扫帚之名，站住！我要把你们扫得四脚朝天！'], pops: ['哎哟！', '我的帽子！', '唰！'], stun: '王冠滑下来了！', fall: '从舞台左侧退场！', prop: '扫帚' },
      elder: { taunts: ['我是元祖驯鹿。我儿子的鹿角就是随我。', '想当年，我们没有关卡。我们只有石头。', '这根拐杖比轮子还老。我查过。', '我记得太阳以前还小一点。', '慢点，小狗们！我们有些人可是老古董！', '午睡是我发明的。可从来没人记得我的功劳。'], pops: ['哎哟！', '哼！', '笃笃！'], stun: '我的拐杖呢？', fall: '该打盹了！', prop: '老爸' },
      bridgetrolls: { taunts: ['这是我们的桥！绕道走！', '禁止按喇叭！我们在这儿安安静静地发牢骚。', '这座桥关闭了……不许好玩！'], pops: ['喂！', '哼！', '禁止鸣笛！'], stun: '桥在晃！', fall: '扑通！故意的！', prop: '禁止玩乐', prop2: '禁止鸣笛' },
    },
  },
};

const text = (): LangText => TEXT[lang()] ?? TEXT.en;
const words = (d: Design): Words => text().words[d];
const fill = (s: string, vars: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/** Mini-boss number on this level: L1 -> 1, L2 -> 2 ... L9 -> 9, L11 -> 10 ... L109 -> 99. */
function miniIndex(level: number): number {
  return level - Math.floor(level / 10);
}

/** The character fighting at the end of this level (null on big-boss levels). */
export function miniDesignForLevel(level: number): Design | null {
  const n = Math.floor(level);
  if (!Number.isFinite(n) || n < 1 || n >= 111 || n % 10 === 0) return null;
  const k = miniIndex(n);
  return k === 1 ? 'reindeer' : ROTATION[(k - 2) % ROTATION.length];
}

/** Which appearance of that character this is (0 = first). */
export function miniAppearance(level: number): number {
  const k = miniIndex(Math.floor(level));
  return k <= 1 ? 0 : Math.floor((k - 2) / ROTATION.length);
}

const cache = new Map<number, BossDef>();

/**
 * ROLLOUT IN BATCHES BY DECADE: mini-bosses are live on levels 1..MINI_LIVE_MAX only.
 * Live: 1-9, 11-19, 21-29, 31-39, 41-49, 51-59, 61-69 (batches 1-7). Next: 79, 89 ... 109 (every mini level). Levels above it play
 * exactly as before (no mini, no gate). The server bound (supabase/fsb_minis_initials.sql)
 * already allows every mini level, so raising this needs no migration.
 */
export const MINI_LIVE_MAX = 69;

/** Every mini-boss level (1-109, not multiples of 10): 99 in all. */
export const MINI_TOTAL = 99;

/** How many mini-bosses are live now (mini levels at or below MINI_LIVE_MAX); updates with each batch. */
export function miniLiveCount(): number {
  let n = 0;
  for (let l = 1; l <= Math.min(109, MINI_LIVE_MAX); l++) if (l % 10 !== 0) n++;
  return n;
}

/** The mini-boss at the end of this level, or null (levels 10, 20 ... 110 and 111 have big bosses). */
export function miniBossForLevel(level: number, ignoreRollout = false): BossDef | null {
  if (!ignoreRollout && level > MINI_LIVE_MAX) return null;
  const design = miniDesignForLevel(level);
  if (!design) return null;
  const hit = cache.get(level);
  if (hit) return hit;
  const def = buildMini(level, design, miniAppearance(level));
  cache.set(level, def);
  return def;
}

const missionCache = new Map<number, BossDef>();

/**
 * ON A MISSION ONLY: the run's first mini-boss (Game asks for it while minisBeaten is 0, so it is
 * level 1 on a normal start) is BRIDGE TROLLS instead of that level's usual character. It takes the
 * slot as it is: same level, same miniTuning, same gate and the same 1,000 x level bonus. Null
 * wherever miniBossForLevel is null (big-boss levels, levels past the rollout).
 */
export function missionFirstMiniForLevel(level: number, ignoreRollout = false): BossDef | null {
  if (!miniBossForLevel(level, ignoreRollout)) return null;
  const hit = missionCache.get(level);
  if (hit) return hit;
  const def = buildMini(level, 'bridgetrolls', 0);
  missionCache.set(level, def);
  return def;
}

function buildMini(level: number, design: Design, appearance: number): BossDef {
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
      appearance,
      skins: dd.skins,
      pops: () => words(design).pops.map((w, i) => [w, dd.sfx[i]] as [string, PopSfx]),
      stunPop: () => words(design).stun,
    },
  };
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

/** A taunt from this appearance's window of three lines (repeat visits open with fresh gags). */
export function miniTaunt(def: BossDef, rng: () => number): string {
  const spec = def.mini;
  const ts = spec ? words(spec.design).taunts : TEXT.en.words.reindeer.taunts;
  const n = Math.min(3, ts.length);
  const off = spec ? (spec.appearance * 3) % ts.length : 0;
  return ts[(off + (Math.floor(rng() * n) % n)) % ts.length];
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
    case 'bridgetrolls': {
      // a squeaky rubber duck (the only honking allowed on their bridge)
      ctx.rotate(Math.sin(p.t * 3) * 0.12);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.ellipse(r * 0.1, r * 0.25, r * 0.75, r * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-r * 0.3, -r * 0.35, r * 0.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff8c1a';
      ctx.beginPath();
      ctx.ellipse(-r * 0.75, -r * 0.28, r * 0.25, r * 0.12, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(-r * 0.4, -r * 0.45, r * 0.08, 0, TAU);
      ctx.fill();
      break;
    }
    case 'reindeer': {
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
    case 'sneezefeld':
      // a tissue box with the last tissue sticking up
      ctx.fillStyle = '#4aa3ff';
      rr(ctx, -r * 0.8, -r * 0.2, r * 1.6, r * 0.85, r * 0.12);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-r * 0.8, r * 0.15, r * 1.6, r * 0.12);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, -r * 0.2);
      ctx.quadraticCurveTo(-r * 0.4 + Math.sin(p.t * 7) * r * 0.15, -r * 0.8, 0, -r * 0.95);
      ctx.quadraticCurveTo(r * 0.35, -r * 0.6, r * 0.3, -r * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'yogan':
      // a comically big microphone
      ctx.fillStyle = '#333';
      ctx.fillRect(r * 0.05, -r * 0.12, r * 0.95, r * 0.24);
      ctx.fillStyle = '#c0c6cc';
      ctx.beginPath();
      ctx.arc(-r * 0.25, 0, r * 0.75, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.25 + i * r * 0.18, -r * 0.5);
        ctx.lineTo(-r * 0.25 + i * r * 0.18, r * 0.5);
        ctx.stroke();
      }
      break;
    case 'divot': {
      // a golf ball on a tee, next to a freshly dug divot
      ctx.fillStyle = '#6b4226';
      ctx.beginPath();
      ctx.ellipse(-r * 0.35, r * 0.6, r * 0.5, r * 0.22, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#3fbf5a';
      ctx.lineWidth = Math.max(1.5, r * 0.1);
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.35 + i * r * 0.18, r * 0.5);
        ctx.lineTo(-r * 0.35 + i * r * 0.22, r * 0.25);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff3a0';
      ctx.fillRect(r * 0.3, r * 0.05, r * 0.14, r * 0.7);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(r * 0.37, -r * 0.25, r * 0.38, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ccc';
      for (const [dx, dy] of [[-0.1, -0.3], [0.1, -0.15], [0.05, -0.4]]) {
        ctx.beginPath();
        ctx.arc(r * (0.37 + dx), r * dy, r * 0.05, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'macdoodle':
      // the lamp bulb his moth friend visits
      ctx.fillStyle = '#fff3a0';
      ctx.beginPath();
      ctx.arc(0, -r * 0.15, r * 0.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#9aa3ad';
      ctx.fillRect(-r * 0.3, r * 0.4, r * 0.6, r * 0.35);
      break;
    case 'lettuceman':
      // a TOP TEN index card
      ctx.fillStyle = '#fff';
      rr(ctx, -r * 0.85, -r * 0.55, r * 1.7, r * 1.1, r * 0.1);
      ctx.fill();
      ctx.fillStyle = '#ff3355';
      ctx.fillRect(-r * 0.85, -r * 0.35, r * 1.7, r * 0.08);
      ctx.fillStyle = '#7fb3ff';
      for (let i = 0; i < 3; i++) ctx.fillRect(-r * 0.7, -r * 0.1 + i * r * 0.22, r * 1.4, r * 0.05);
      break;
    case 'rowdy':
      // a baseball glove
      ctx.fillStyle = '#b5651d';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.75, r * 0.85, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#8b4513';
      for (let i = 0; i < 4; i++) ctx.fillRect(-r * 0.6 + i * r * 0.32, -r * 0.95, r * 0.22, r * 0.5);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, r * 0.15, r * 0.3, 0, TAU);
      ctx.fill();
      break;
    case 'fryer':
      // a frying pan with a sunny-side-up egg (it jiggles)
      ctx.fillStyle = '#333';
      ctx.fillRect(r * 0.55, -r * 0.1, r * 0.6, r * 0.2);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.75, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.5 + Math.sin(p.t * 8) * r * 0.04, r * 0.42, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffc93c';
      ctx.beginPath();
      ctx.arc(-r * 0.05, -r * 0.03, r * 0.2, 0, TAU);
      ctx.fill();
      break;
    case 'socks':
      // one bright red sock (where is the other one?)
      ctx.rotate(Math.sin(p.t * 2) * 0.2);
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, -r * 0.85);
      ctx.lineTo(r * 0.35, -r * 0.85);
      ctx.lineTo(r * 0.35, r * 0.2);
      ctx.quadraticCurveTo(r * 0.35, r * 0.75, -r * 0.3, r * 0.7);
      ctx.quadraticCurveTo(-r * 0.85, r * 0.65, -r * 0.7, r * 0.3);
      ctx.lineTo(-r * 0.15, r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-r * 0.15, -r * 0.85, r * 0.5, r * 0.2);
      break;
    case 'gigglegan':
      // a steaming pocket snack
      ctx.fillStyle = '#e8b062';
      rr(ctx, -r * 0.8, -r * 0.45, r * 1.6, r * 0.9, r * 0.25);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.4, -r * 0.55);
        ctx.quadraticCurveTo(i * r * 0.4 + r * 0.2 * Math.sin(p.t * 6 + i), -r * 0.8, i * r * 0.4, -r * 1.05);
        ctx.stroke();
      }
      break;
    case 'brooms':
      // the royal orb (a big jewel on top)
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(0, r * 0.1, r * 0.65, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff4ec8';
      ctx.beginPath();
      ctx.arc(0, -r * 0.65, r * 0.25, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#b8860b';
      ctx.fillRect(-r * 0.65, r * 0.02, r * 1.3, r * 0.14);
      break;
    case 'elder':
      // an hourglass (a very, very long time of sand)
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(-r * 0.6, -r * 0.85, r * 1.2, r * 0.15);
      ctx.fillRect(-r * 0.6, r * 0.7, r * 1.2, r * 0.15);
      ctx.fillStyle = 'rgba(200,240,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, -r * 0.7);
      ctx.lineTo(r * 0.45, -r * 0.7);
      ctx.lineTo(0, 0);
      ctx.lineTo(r * 0.45, r * 0.7);
      ctx.lineTo(-r * 0.45, r * 0.7);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f0c040';
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, r * 0.7);
      ctx.lineTo(r * 0.3, r * 0.7);
      ctx.lineTo(0, r * 0.25);
      ctx.closePath();
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

type Hair = 'pompadour' | 'fringe' | 'parted' | 'swept' | 'short' | 'light' | 'bald' | 'none';

/** A gentle cartoon person (the people-shaped minis): legs, torso, head, hair and face details. */
interface Look {
  skin: string;
  shirt: string;
  pants: string;
  shoe?: string;
  hair: Hair;
  hairColor?: string;
  glasses?: boolean;
  mustache?: string;
  beard?: string;
  deadpan?: boolean;
  /** Torso width as a share of w. */
  torsoW?: number;
  /** No legs drawn (behind a desk, in a chair, in a long robe). */
  noLegs?: boolean;
  /** Cross little eyebrows and a frown (a grin again when bonked, stunned or beaten). */
  grumpy?: boolean;
}

function person(ctx: Ctx, w: number, h: number, p: Pose, k: Look): { hx: number; hy: number; hr: number; tw: number } {
  if (!k.noLegs) legs(ctx, w * 0.8, h, p.t * 0.8, k.pants, k.shoe ?? '#222');
  const tw = w * (k.torsoW ?? 0.5);
  ctx.fillStyle = k.shirt;
  rr(ctx, -tw / 2, -h * 0.2, tw, h * 0.44, w * 0.1);
  ctx.fill();
  const hr = Math.min(w * 0.22, h * 0.115);
  const hx = -w * 0.03;
  const hy = -h * 0.2 - hr * 0.85;
  if (k.beard) {
    ctx.fillStyle = k.beard;
    ctx.beginPath();
    ctx.moveTo(hx - hr * 0.85, hy + hr * 0.1);
    ctx.quadraticCurveTo(hx, hy + hr * 3.4, hx + hr * 0.85, hy + hr * 0.1);
    ctx.closePath();
    ctx.fill();
  }
  head(ctx, hx, hy, hr, k.skin, p);
  const hc = k.hairColor ?? '#2a1d14';
  ctx.fillStyle = hc;
  switch (k.hair) {
    case 'pompadour':
      ctx.beginPath();
      ctx.ellipse(hx, hy - hr * 0.5, hr * 1.04, hr * 0.62, 0, Math.PI, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hx - hr * 0.25, hy - hr * 1.0, hr * 0.7, hr * 0.32, -0.15, 0, TAU);
      ctx.fill();
      break;
    case 'fringe':
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(hx + s * hr * 0.92, hy - hr * 0.1, hr * 0.22, hr * 0.45, 0, 0, TAU);
        ctx.fill();
      }
      break;
    case 'parted':
    case 'swept':
    case 'short':
    case 'light':
      ctx.beginPath();
      ctx.ellipse(hx, hy - hr * 0.5, hr * 1.03, k.hair === 'short' ? hr * 0.52 : hr * 0.6, 0, Math.PI, TAU);
      ctx.fill();
      if (k.hair === 'swept') {
        ctx.beginPath();
        ctx.ellipse(hx - hr * 0.45, hy - hr * 0.75, hr * 0.6, hr * 0.28, 0.4, 0, TAU);
        ctx.fill();
      }
      if (k.hair === 'parted') {
        ctx.strokeStyle = k.skin;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(hx + hr * 0.3, hy - hr * 1.05);
        ctx.lineTo(hx + hr * 0.2, hy - hr * 0.6);
        ctx.stroke();
      }
      break;
    case 'bald':
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(hx + hr * 0.3, hy - hr * 0.6, hr * 0.3, hr * 0.15, 0.4, 0, TAU);
      ctx.fill();
      break;
    case 'none':
      break;
  }
  if (k.glasses) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx - hr * 0.05 + s * hr * 0.32, hy - hr * 0.15, hr * 0.34, 0, TAU);
      ctx.stroke();
    }
  }
  if (k.mustache) {
    ctx.fillStyle = k.mustache;
    rr(ctx, hx - hr * 0.45, hy + hr * 0.22, hr * 0.8, hr * 0.18, hr * 0.09);
    ctx.fill();
  }
  if (k.grumpy) {
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = Math.max(1.5, hr * 0.14);
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const ex = hx - hr * 0.05 + s * hr * 0.3;
      ctx.beginPath();
      ctx.moveTo(ex + s * hr * 0.3, hy - hr * 0.62);
      ctx.lineTo(ex - s * hr * 0.22, hy - hr * 0.44);
      ctx.stroke();
    }
  }
  if (k.grumpy && !p.hurt && !p.stun && p.beaten <= 0) {
    ctx.strokeStyle = '#5a2a1a';
    ctx.lineWidth = Math.max(1.5, hr * 0.14);
    ctx.beginPath();
    ctx.arc(hx, hy + hr * 0.78, hr * 0.32, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  } else if (k.deadpan) {
    ctx.strokeStyle = '#5a3a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - hr * 0.3, hy + hr * 0.52);
    ctx.lineTo(hx + hr * 0.2, hy + hr * 0.52);
    ctx.stroke();
  } else mouth(ctx, hx, hy + hr * 0.52, hr * 0.3, p);
  return { hx, hy, hr, tw };
}

/** An arm as a thick line ending in a little round hand. */
function arm(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, sleeve: string, skin: string): void {
  ctx.strokeStyle = sleeve;
  ctx.lineWidth = Math.max(3, w * 0.08);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x1, y1, Math.max(2.5, w * 0.05), 0, TAU);
  ctx.fill();
}

/** A small sign with fitted text (props: cards, placards, chair backs). */
function placard(ctx: Ctx, s: string, x: number, y: number, w: number, h: number, bg: string, fg: string, edge = '#222'): void {
  ctx.fillStyle = bg;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  rr(ctx, x, y, w, h, Math.min(4, h * 0.25));
  ctx.fill();
  ctx.stroke();
  if (s) propText(ctx, s, x + w / 2, y + h / 2, w * 0.88, Math.max(7, h * 0.62), fg);
}

/** Reindeer antlers (and furry ears) on a head at (hx, hy) with radius hr; drawn before the head. */
function antlers(ctx: Ctx, hx: number, hy: number, hr: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, hr * 0.18);
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const bx = hx + s * hr * 0.45;
    const by = hy - hr * 0.75;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + s * hr * 0.2, by - hr * 0.7, bx + s * hr * 0.75, by - hr * 1.05);
    ctx.moveTo(bx + s * hr * 0.12, by - hr * 0.45);
    ctx.lineTo(bx + s * hr * 0.6, by - hr * 0.45);
    ctx.moveTo(bx + s * hr * 0.2, by - hr * 0.75);
    ctx.lineTo(bx - s * hr * 0.05, by - hr * 1.1);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(hx + s * hr * 0.95, hy - hr * 0.35, hr * 0.32, hr * 0.15, s * 0.5, 0, TAU);
    ctx.fill();
  }
}

/** A round shiny nose (reindeer red, or a sniffly pink). */
function nose(ctx: Ctx, x: number, y: number, r: number, color = '#ff3b3b'): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, TAU);
  ctx.fill();
}

const SKIN = { light: '#f2c7a5', fair: '#ffe0cc', tan: '#e8b896', brown: '#8d5524', deep: '#6b4423' };

type MiniDraw = (ctx: Ctx, w: number, h: number, p: Pose, prop: string) => void;

/** Two plain legs planted in a relaxed stance (no walking swing: these folks are not going anywhere). */
function standLegs(ctx: Ctx, w: number, h: number, pants: string, shoe: string, stance: number): void {
  ctx.strokeStyle = pants;
  ctx.lineWidth = Math.max(3, w * 0.13);
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    const fx = s * w * (0.13 + stance * 0.06) + (s > 0 ? stance * w * 0.04 : 0);
    ctx.beginPath();
    ctx.moveTo(s * w * 0.11, h * 0.2);
    ctx.lineTo(fx, h * 0.45);
    ctx.stroke();
    ctx.fillStyle = shoe;
    ctx.beginPath();
    ctx.ellipse(fx - w * 0.05, h * 0.47, w * 0.11, w * 0.06, 0, 0, TAU);
    ctx.fill();
  }
}

/** A hand-lettered cardboard sign (a little crooked: homemade, not official). */
function cardboard(ctx: Ctx, s: string, x: number, y: number, w: number, h: number, tilt: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = '#d9b26f';
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2 + 1);
  ctx.lineTo(w / 2 - 2, -h / 2);
  ctx.lineTo(w / 2, h / 2 - 1);
  ctx.lineTo(-w / 2 + 1, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  propText(ctx, s, 0, 0, w * 0.86, Math.max(7, h * 0.6), '#3a2a6a');
  ctx.restore();
}

/**
 * BRIDGE TROLLS (ON A MISSION's first mini-boss): three ordinary, mismatched folks in everyday
 * clothes hogging a little wooden bridge over a river. A sun hat and an ice cream cone, an orange
 * hoodie with a hand-lettered NO HONKING sign, and a grandpa with a fishing pole; a cardboard
 * NO FUN sign leans on the rail. Each stands and sways in their own way (no formation, no
 * matching anything). Beaten: one by one they get bumped off the bridge and SPLASH into the
 * river, then bob back up, grumpy and perfectly fine.
 */
function drawBridgeTrolls(ctx: Ctx, w: number, h: number, p: Pose, prop: string): void {
  // folks sized from the width (tall portrait boxes would stretch them); the scene sits mid-box
  const pw = w * 0.52;
  const ph = Math.min(h * 0.58, w * 1.25);
  const deckY = ph * 0.285;
  const waterY = deckY + ph * 0.38;
  const bottomY = waterY + ph * 0.3;
  const L = -w * 0.95;
  const R = w * 0.95;
  // the river
  ctx.fillStyle = '#2f80d0';
  ctx.fillRect(L, waterY, R - L, bottomY - waterY);
  ctx.strokeStyle = 'rgba(190,230,255,0.85)';
  ctx.lineWidth = 2;
  for (let row = 0; row < 2; row++) {
    ctx.beginPath();
    for (let x = L; x <= R; x += 4) {
      const y = waterY + 3 + row * ph * 0.12 + Math.sin(x * 0.12 + p.t * (2.2 + row) + row) * 2;
      if (x === L) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // the little wooden bridge: an arch, a plank deck, a simple rail behind the people
  ctx.fillStyle = '#8b5a2b';
  ctx.beginPath();
  ctx.moveTo(-w * 0.82, deckY);
  ctx.lineTo(w * 0.82, deckY);
  ctx.lineTo(w * 0.72, waterY + 2);
  ctx.lineTo(w * 0.55, waterY + 2);
  ctx.quadraticCurveTo(0, deckY + ph * 0.04, -w * 0.55, waterY + 2);
  ctx.lineTo(-w * 0.72, waterY + 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#b07840';
  ctx.fillRect(-w * 0.86, deckY - ph * 0.02, w * 1.72, ph * 0.08);
  ctx.strokeStyle = '#6b4226';
  ctx.lineWidth = 1;
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * w * 0.19, deckY - ph * 0.02);
    ctx.lineTo(i * w * 0.19, deckY + ph * 0.06);
    ctx.stroke();
  }
  ctx.strokeStyle = '#a0703c';
  ctx.lineWidth = Math.max(2, w * 0.035);
  ctx.beginPath();
  ctx.moveTo(-w * 0.84, deckY - ph * 0.18);
  ctx.lineTo(w * 0.84, deckY - ph * 0.18);
  for (let i = -2; i <= 2; i++) {
    ctx.moveTo(i * w * 0.42, deckY);
    ctx.lineTo(i * w * 0.42, deckY - ph * 0.18);
  }
  ctx.stroke();
  // a cardboard NO FUN sign tied to the side of the bridge
  const b = p.beaten;
  cardboard(ctx, prop, -w * 0.08, deckY + (waterY - deckY) * 0.42, w * 0.56, ph * 0.13, -0.06 + Math.sin(p.t * 1.1) * 0.04);

  const hrOf = Math.min(pw * 0.22, ph * 0.115);
  const sign2 = words('bridgetrolls').prop2 ?? '';
  const folks: { x: number; look: Look; extra: (hx: number, hy: number, hr: number, tw: number) => void; pre?: (hx: number, hy: number, hr: number) => void; stance: number; sway: number }[] = [
    {
      // sun hat, teal t-shirt, jeans, an ice cream cone held out
      x: -w * 0.42,
      stance: 0.6,
      sway: 1.3,
      look: { skin: SKIN.tan, shirt: '#2ec4b6', pants: '#3d5a80', shoe: '#f1f1f1', hair: 'short', hairColor: '#6b3e1f', noLegs: true, grumpy: true },
      extra: (hx, hy, hr, tw) => {
        ctx.fillStyle = '#f2d16b';
        ctx.beginPath();
        ctx.ellipse(hx, hy - hr * 0.55, hr * 1.7, hr * 0.32, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(hx, hy - hr * 0.85, hr * 0.85, hr * 0.5, 0, Math.PI, TAU);
        ctx.fill();
        ctx.fillStyle = '#ff6fa8';
        ctx.fillRect(hx - hr * 0.85, hy - hr * 0.72, hr * 1.7, hr * 0.16);
        const ax = -pw * 0.46;
        const ay = -ph * 0.06;
        arm(ctx, -tw * 0.5, -ph * 0.12, ax, ay, pw, '#2ec4b6', SKIN.tan);
        ctx.fillStyle = '#d9a35b';
        ctx.beginPath();
        ctx.moveTo(ax - pw * 0.08, ay - pw * 0.04);
        ctx.lineTo(ax + pw * 0.08, ay - pw * 0.04);
        ctx.lineTo(ax, ay + pw * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ff9ec7';
        ctx.beginPath();
        ctx.arc(ax, ay - pw * 0.09, pw * 0.09, 0, TAU);
        ctx.fill();
      },
    },
    {
      // orange hoodie (hood up), grey sweatpants, a hand-lettered NO HONKING sign on a stick
      x: w * 0.02,
      stance: 0.2,
      sway: 0.9,
      look: { skin: SKIN.brown, shirt: '#ff8c42', pants: '#8d99ae', shoe: '#e63946', hair: 'none', noLegs: true, grumpy: true, torsoW: 0.56 },
      pre: (hx, hy, hr) => {
        ctx.fillStyle = '#e8762c';
        ctx.beginPath();
        ctx.arc(hx, hy - hr * 0.05, hr * 1.28, 0, TAU);
        ctx.fill();
      },
      extra: (hx, hy, hr, tw) => {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(hx - hr * 0.25, hy + hr * 1.05);
        ctx.lineTo(hx - hr * 0.3, hy + hr * 1.6);
        ctx.moveTo(hx + hr * 0.25, hy + hr * 1.05);
        ctx.lineTo(hx + hr * 0.3, hy + hr * 1.6);
        ctx.stroke();
        const sx = tw * 0.62;
        arm(ctx, tw * 0.5, -ph * 0.12, sx, -ph * 0.3, pw, '#ff8c42', SKIN.brown);
        ctx.strokeStyle = '#8b5a2b';
        ctx.lineWidth = Math.max(2, pw * 0.05);
        ctx.beginPath();
        ctx.moveTo(sx, -ph * 0.22);
        ctx.lineTo(sx, -ph * 0.62);
        ctx.stroke();
        cardboard(ctx, sign2, sx, -ph * 0.7, pw * 1.25, ph * 0.13, 0.08 + Math.sin(p.t * 1.7) * 0.05);
      },
    },
    {
      // grandpa in a purple polo with a fishing pole over the rail
      x: w * 0.44,
      stance: 0.4,
      sway: 1.7,
      look: { skin: SKIN.fair, shirt: '#9b5de5', pants: '#5c677d', shoe: '#3a2a1a', hair: 'bald', glasses: true, mustache: '#d8d8d8', noLegs: true, grumpy: true },
      extra: (_hx, _hy, _hr, tw) => {
        const hx2 = tw * 0.55;
        const hy2 = -ph * 0.02;
        arm(ctx, tw * 0.4, -ph * 0.12, hx2, hy2, pw, '#9b5de5', SKIN.fair);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = Math.max(1.5, pw * 0.035);
        const tipX = pw * 0.75;
        const tipY = -ph * 0.42;
        ctx.beginPath();
        ctx.moveTo(hx2 - pw * 0.05, hy2 + ph * 0.05);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
      },
    },
  ];
  folks.forEach((f, i) => {
    const d = 0.05 + i * 0.08;
    const k = clamp01((b - d) / 0.3);
    const footY = deckY;
    if (k < 1) {
      ctx.save();
      const hop = Math.sin(Math.min(1, k * 1.6) * Math.PI) * ph * 0.12;
      const drop = k * k * (waterY - deckY + ph * 0.9);
      if (k > 0) {
        // falling: everything below the water line is hidden (in they go)
        ctx.beginPath();
        ctx.rect(L - w, -h * 2, (R - L) + w * 2, waterY + 1 + h * 2);
        ctx.clip();
      }
      ctx.translate(f.x + k * w * 0.08, footY - hop + drop);
      ctx.rotate(k * (0.9 + i * 0.3) + Math.sin(p.t * f.sway + i * 2.1) * 0.035);
      ctx.translate(0, -ph * 0.47);
      standLegs(ctx, pw, ph, f.look.pants, f.look.shoe ?? '#222', f.stance);
      const hx = -pw * 0.03;
      const hy = -ph * 0.2 - hrOf * 0.85;
      f.pre?.(hx, hy, hrOf);
      const r = person(ctx, pw, ph, p, f.look);
      f.extra(r.hx, r.hy, r.hr, r.tw);
      ctx.restore();
      if (i === 2 && k <= 0) {
        // the fishing line drops from the pole tip to a red-and-white bobber
        const tx = f.x + pw * 0.75;
        const ty = footY - ph * 0.47 - ph * 0.42;
        const by = waterY + 2 + Math.sin(p.t * 2.5) * 1.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + 2, by - 3);
        ctx.stroke();
        bobber(ctx, tx + 2, by, Math.max(3, w * 0.035));
      }
    } else {
      // SPLASH! (a ring of droplets and a ripple), then they bob up grumpy and perfectly fine
      const x = f.x + w * 0.08;
      const st = (b - d - 0.3) / 0.25;
      if (st < 1) {
        ctx.fillStyle = 'rgba(200,235,255,0.95)';
        for (let j = 0; j < 7; j++) {
          const a = Math.PI * (0.15 + (0.7 * j) / 6);
          const v = ph * (0.3 + (j % 3) * 0.08);
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * v * st * 0.9, waterY - Math.sin(a) * v * st + st * st * v * 0.8, Math.max(2, w * 0.04) * (1 - st * 0.5), 0, TAU);
          ctx.fill();
        }
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - clamp01(st / 2))})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, waterY + 3, w * (0.1 + 0.25 * clamp01(st / 2)), ph * 0.03 + ph * 0.02 * clamp01(st), 0, 0, TAU);
      ctx.stroke();
      if (st > 0.5) {
        const bob = Math.sin(p.t * 4 + i) * 1.5;
        const hr = hrOf * 0.9;
        const hy = waterY + hr * 0.15 + bob;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - hr * 2, hy - hr * 2.5, hr * 4, waterY + 1 - (hy - hr * 2.5));
        ctx.clip();
        if (i === 1) {
          ctx.fillStyle = '#e8762c';
          ctx.beginPath();
          ctx.arc(x, hy, hr * 1.25, 0, TAU);
          ctx.fill();
        }
        head(ctx, x, hy, hr, f.look.skin, p);
        if (i === 0) {
          ctx.fillStyle = '#f2d16b';
          ctx.beginPath();
          ctx.ellipse(x, hy - hr * 0.6, hr * 1.5, hr * 0.28, 0.2, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  });
}

function bobber(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, TAU);
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y - r * 1.6);
  ctx.stroke();
}

/** Each draws around (0, 0) = box centre, filling about w x h, facing left (toward the dogs). */
const BODY: Record<Design, MiniDraw> = {
  reindeer: (ctx, w, h, p, prop) => {
    // a tall director's chair; ROB REINDEER leans on the armrest with his megaphone
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
    // body (cardigan) and a reindeer head: antlers, furry ears, a shiny red nose
    ctx.fillStyle = '#4a6fa5';
    rr(ctx, -w * 0.3, -h * 0.18, w * 0.55, h * 0.24, w * 0.12);
    ctx.fill();
    const hr = Math.min(w * 0.26, h * 0.13);
    const hy = -h * 0.18 - hr * 0.9;
    antlers(ctx, -w * 0.16, hy, hr, '#a0703c');
    head(ctx, -w * 0.16, hy, hr, '#c89a6a', p);
    nose(ctx, -w * 0.16 - hr * 0.1, hy + hr * 0.18, hr * 0.2);
    mouth(ctx, -w * 0.16, hy + hr * 0.55, hr * 0.3, p);
    // the clapperboard on his lap
    ctx.fillStyle = '#222';
    ctx.fillRect(w * 0.08, -h * 0.08, w * 0.3, h * 0.1);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) ctx.fillRect(w * 0.1 + i * w * 0.1, -h * 0.08, w * 0.04, h * 0.03);
  },
  sneezefeld: (ctx, w, h, p) => {
    // a sniffly observer with a rosy nose, holding out a tissue box (one tissue left, always)
    const { hx, hy, hr, tw } = person(ctx, w, h, p, { skin: SKIN.light, shirt: '#7fb3d5', pants: '#2d3a5a', hair: 'swept', hairColor: '#5a3a22' });
    nose(ctx, hx - hr * 0.1, hy + hr * 0.15, hr * 0.17, '#ff8a8a');
    arm(ctx, -tw * 0.5, -h * 0.1, -w * 0.4, -h * 0.03 + Math.sin(p.t * 3) * 2, w, '#7fb3d5', SKIN.light);
    ctx.fillStyle = '#4aa3ff';
    rr(ctx, -w * 0.5, -h * 0.06, w * 0.22, h * 0.09, 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-w * 0.5, -h * 0.025, w * 0.22, h * 0.02);
    const fl = Math.sin(p.t * 8) * w * 0.02;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-w * 0.44, -h * 0.06);
    ctx.quadraticCurveTo(-w * 0.47 + fl, -h * 0.12, -w * 0.39 + fl, -h * 0.15);
    ctx.quadraticCurveTo(-w * 0.36, -h * 0.1, -w * 0.34, -h * 0.06);
    ctx.closePath();
    ctx.fill();
    // every few seconds: a little ACHOO puff
    const ph = p.t % 3.2;
    if (ph < 0.5) {
      ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - ph / 0.5)})`;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(hx - hr * (1.4 + i * 0.5 + ph * 2), hy + hr * 0.2 + (i - 1) * hr * 0.3, hr * (0.25 + ph * 0.4), 0, TAU);
        ctx.fill();
      }
    }
  },
  divot: (ctx, w, h, p, prop) => {
    // a golfer in a green sun visor, mid-shrug, club at his side and a clump of turf at his feet
    const { hx, hy, hr, tw } = person(ctx, w, h, p, { skin: SKIN.light, shirt: '#8a9a5b', pants: '#c2b280', hair: 'short', hairColor: '#7a5a3a' });
    ctx.fillStyle = '#2e8b57';
    ctx.beginPath();
    ctx.ellipse(hx, hy - hr * 0.55, hr * 1.05, hr * 0.32, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillRect(hx - hr * 1.6, hy - hr * 0.62, hr * 0.9, hr * 0.16);
    const bob = Math.sin(p.t * 4) * h * 0.02;
    for (const s of [-1, 1]) arm(ctx, s * tw * 0.5, -h * 0.15, s * w * 0.44, -h * 0.3 + bob, w, '#8a9a5b', SKIN.light);
    placard(ctx, prop, -w * 0.2, -h * 0.06, w * 0.4, h * 0.1, '#fffbe0', '#2e8b57');
    ctx.strokeStyle = '#bfc5cc';
    ctx.lineWidth = Math.max(2, w * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.44, -h * 0.05);
    ctx.lineTo(w * 0.38, h * 0.42);
    ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.fillRect(w * 0.31, h * 0.41, w * 0.11, h * 0.04);
    const jump = Math.abs(Math.sin(p.t * 2.5)) * h * 0.04;
    ctx.fillStyle = '#6b4226';
    ctx.beginPath();
    ctx.ellipse(-w * 0.36, h * 0.42 - jump, w * 0.09, h * 0.025, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#3fbf5a';
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.36 + i * w * 0.03, h * 0.41 - jump);
      ctx.lineTo(-w * 0.36 + i * w * 0.035, h * 0.38 - jump);
      ctx.stroke();
    }
  },
  macdoodle: (ctx, w, h, p) => {
    // a plain suit, a perfectly straight face, a doodle pad, and the doodled moth fluttering by
    const { hx, hy, hr, tw } = person(ctx, w, h, p, { skin: SKIN.light, shirt: '#4a5568', pants: '#2d3748', hair: 'short', hairColor: '#b5651d', deadpan: true });
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(-w * 0.03, -h * 0.19);
    ctx.lineTo(w * 0.02, -h * 0.02);
    ctx.lineTo(-w * 0.08, -h * 0.02);
    ctx.closePath();
    ctx.fill();
    // the doodle pad, scribbles appearing
    arm(ctx, -tw * 0.5, -h * 0.1, -w * 0.36, -h * 0.02, w, '#4a5568', SKIN.light);
    ctx.fillStyle = '#fffbe0';
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    rr(ctx, -w * 0.5, -h * 0.12, w * 0.2, h * 0.15, 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#3366cc';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const n = 3 + Math.floor((p.t * 2) % 5);
    for (let i = 0; i < n; i++) {
      const x = -w * 0.47 + i * w * 0.03;
      ctx.moveTo(x, -h * 0.08 + (i % 2) * h * 0.03);
      ctx.lineTo(x + w * 0.025, -h * 0.02 - (i % 3) * h * 0.02);
    }
    ctx.stroke();
    // the moth (drawn in doodle lines)
    const mx = hx + hr * 1.7 + Math.sin(p.t * 2.3) * w * 0.08;
    const my = hy - hr * 1.1 + Math.cos(p.t * 3.1) * h * 0.04;
    const flap = 0.4 + Math.abs(Math.sin(p.t * 18)) * 0.6;
    ctx.fillStyle = '#fffbe0';
    ctx.strokeStyle = '#3366cc';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(mx + s * w * 0.04, my, w * 0.05, w * 0.035 * flap, s * 0.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#3366cc';
    ctx.fillRect(mx - 1, my - w * 0.03, 2, w * 0.06);
  },
  lettuceman: (ctx, w, h, p, prop) => {
    // behind the late-night desk with a mug, a head of crisp lettuce leaves for hair, holding up tonight's TOP 10 card
    const lh = person(ctx, w, h, p, { skin: SKIN.light, shirt: '#2c3e70', pants: '#2c3e70', hair: 'none', noLegs: true });
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      ctx.fillStyle = i % 2 ? '#7bd389' : '#4caf50';
      ctx.beginPath();
      ctx.ellipse(lh.hx + Math.cos(a) * lh.hr * 0.85, lh.hy + Math.sin(a) * lh.hr * 0.85 - lh.hr * 0.1, lh.hr * 0.42, lh.hr * 0.26, a + Math.PI / 2, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = '#2e7d32';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lh.hx, lh.hy - lh.hr * 1.15);
    ctx.lineTo(lh.hx, lh.hy - lh.hr * 0.75);
    ctx.stroke();
    ctx.fillStyle = '#7a4b2a';
    rr(ctx, -w * 0.48, -h * 0.02, w * 0.96, h * 0.49, 4);
    ctx.fill();
    ctx.fillStyle = '#9c6a3f';
    ctx.fillRect(-w * 0.5, -h * 0.04, w * 1.0, h * 0.05);
    ctx.fillStyle = '#fff';
    rr(ctx, -w * 0.4, -h * 0.13, w * 0.12, h * 0.09, 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-w * 0.27, -h * 0.085, w * 0.03, -1.2, 1.2);
    ctx.stroke();
    ctx.save();
    ctx.translate(w * 0.3, -h * 0.34);
    ctx.rotate(Math.sin(p.t * 2) * 0.08);
    placard(ctx, prop, -w * 0.2, -h * 0.07, w * 0.4, h * 0.14, '#fff', '#ff3355');
    ctx.restore();
  },
  rowdy: (ctx, w, h, p, prop) => {
    // a baseball cap (brim to the dogs), a ROWDY jersey, and a big fist pump
    const { hx, hy, hr, tw } = person(ctx, w, h, p, { skin: SKIN.light, shirt: '#f5f5f5', pants: '#555', hair: 'none' });
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.ellipse(hx, hy - hr * 0.45, hr * 1.05, hr * 0.65, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillRect(hx - hr * 1.7, hy - hr * 0.5, hr * 1.0, hr * 0.18);
    propText(ctx, prop, 0, -h * 0.06, tw * 0.85, Math.max(7, w * 0.13), '#e63946');
    const pump = Math.abs(Math.sin(p.t * 5)) * h * 0.06;
    arm(ctx, tw * 0.5, -h * 0.15, w * 0.36, -h * 0.36 - pump, w, '#f5f5f5', SKIN.light);
  },
  fryer: (ctx, w, h, p, prop) => {
    // a cheerful cook in a tall chef's hat and apron, flipping a pancake high out of his pan
    const { hx, hy, hr, tw } = person(ctx, w, h, p, { skin: SKIN.brown, shirt: '#ff8c42', pants: '#3b2f2f', hair: 'short', hairColor: '#1a1a1a' });
    ctx.fillStyle = '#fff';
    rr(ctx, -tw * 0.38, -h * 0.12, tw * 0.76, h * 0.34, 4);
    ctx.fill();
    propText(ctx, prop, 0, h * 0.04, tw * 0.6, Math.max(7, w * 0.11), '#ff8c42');
    ctx.beginPath();
    ctx.ellipse(hx, hy - hr * 0.8, hr * 0.85, hr * 0.25, 0, 0, TAU);
    ctx.fill();
    for (const dx of [-0.45, 0, 0.45]) {
      ctx.beginPath();
      ctx.arc(hx + dx * hr, hy - hr * 1.35, hr * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.fillRect(hx - hr * 0.8, hy - hr * 1.3, hr * 1.6, hr * 0.5);
    arm(ctx, -tw * 0.5, -h * 0.12, -w * 0.34, -h * 0.08, w, '#ff8c42', SKIN.brown);
    ctx.fillStyle = '#333';
    ctx.fillRect(-w * 0.36, -h * 0.09, w * 0.06, h * 0.02);
    ctx.beginPath();
    ctx.ellipse(-w * 0.42, -h * 0.08, w * 0.08, h * 0.025, 0, 0, TAU);
    ctx.fill();
    const up = Math.abs(Math.sin(p.t * 2.2));
    ctx.save();
    ctx.translate(-w * 0.42, -h * 0.11 - up * h * 0.16);
    ctx.rotate(p.t * 2.2 * Math.PI);
    ctx.fillStyle = '#e0a458';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.07, h * 0.018, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  },
  socks: (ctx, w, h, p, prop) => {
    // rocking in a rocking chair in red socks, flat cap, a chatty sock puppet on one hand, a SOCKS sign beside him
    ctx.save();
    ctx.translate(0, h * 0.45);
    ctx.rotate(Math.sin(p.t * 2) * 0.06);
    ctx.translate(0, -h * 0.45);
    ctx.strokeStyle = '#6b4226';
    ctx.lineWidth = Math.max(3, w * 0.06);
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, h * 0.42);
    ctx.quadraticCurveTo(0, h * 0.5, w * 0.4, h * 0.42);
    ctx.moveTo(-w * 0.25, h * 0.45);
    ctx.lineTo(-w * 0.25, h * 0.1);
    ctx.moveTo(w * 0.25, h * 0.45);
    ctx.lineTo(w * 0.25, -h * 0.3);
    ctx.stroke();
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(-w * 0.3, h * 0.06, w * 0.6, h * 0.07);
    const { hr: phr, tw } = person(ctx, w, h, p, { skin: SKIN.deep, shirt: '#8b6f47', pants: '#4a4a4a', hair: 'none', noLegs: true });
    // legs bent over the seat edge
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = Math.max(3, w * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-tw * 0.2, h * 0.12);
    ctx.lineTo(-w * 0.32, h * 0.14);
    ctx.lineTo(-w * 0.34, h * 0.38);
    ctx.stroke();
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.ellipse(-w * 0.38, h * 0.4, w * 0.08, w * 0.045, 0, 0, TAU);
    ctx.fill();
    // the sock puppet (red sock, googly eyes, it talks)
    arm(ctx, -tw * 0.5, -h * 0.12, -w * 0.36, -h * 0.2, w, '#8b6f47', SKIN.deep);
    const talk = Math.abs(Math.sin(p.t * 6)) * phr * 0.25;
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.ellipse(-w * 0.4, -h * 0.22, phr * 0.6, phr * 0.38, -0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#7a1020';
    ctx.beginPath();
    ctx.ellipse(-w * 0.4 - phr * 0.45, -h * 0.22 + phr * 0.1, phr * 0.2, talk + 1, 0, 0, TAU);
    ctx.fill();
    for (const dx of [-0.1, 0.12]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-w * 0.4 + dx * phr, -h * 0.22 - phr * 0.25, phr * 0.13, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(-w * 0.4 + dx * phr - 1, -h * 0.22 - phr * 0.25, phr * 0.06, 0, TAU);
      ctx.fill();
    }
    // flat cap
    const hr = Math.min(w * 0.22, h * 0.115);
    const hy = -h * 0.2 - hr * 0.85;
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath();
    ctx.ellipse(-w * 0.03, hy - hr * 0.55, hr * 1.1, hr * 0.5, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillRect(-w * 0.03 - hr * 1.5, hy - hr * 0.6, hr * 0.9, hr * 0.15);
    ctx.restore();
    ctx.strokeStyle = '#6b4226';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.42, h * 0.47);
    ctx.lineTo(w * 0.42, -h * 0.12);
    ctx.stroke();
    placard(ctx, prop, w * 0.22, -h * 0.3, w * 0.36, h * 0.12, '#d2a96a', '#5a3a1a');
  },
  yogan: (ctx, w, h, p, prop) => {
    // a calm host in a stretchy tee and headband, on a rolled-out yoga mat, behind a comically huge microphone
    ctx.fillStyle = '#9b5de5';
    rr(ctx, -w * 0.46, h * 0.44, w * 0.92, h * 0.05, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w * 0.44, h * 0.44, h * 0.04, 0, TAU);
    ctx.fill();
    const { hx, hy, hr } = person(ctx, w, h, p, { skin: SKIN.tan, shirt: '#2a9d8f', pants: '#3a3a5a', hair: 'short', hairColor: '#3a2a1a', torsoW: 0.5 });
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(hx - hr * 1.02, hy - hr * 0.6, hr * 2.04, hr * 0.22);
    placard(ctx, prop, w * 0.08, -h * 0.48, w * 0.4, h * 0.09, '#e63946', '#fff', '#7a1020');
    ctx.strokeStyle = '#444';
    ctx.lineWidth = Math.max(2, w * 0.04);
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -h * 0.47);
    ctx.lineTo(hx - hr * 1.55, hy + hr * 0.4);
    ctx.stroke();
    const mx = hx - hr * 1.55;
    const my = hy + hr * 0.9 + Math.sin(p.t * 3) * 2;
    ctx.fillStyle = '#9aa3ad';
    ctx.beginPath();
    ctx.ellipse(mx, my, hr * 0.55, hr * 0.8, -0.3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(mx - hr * 0.5, my + i * hr * 0.3);
      ctx.lineTo(mx + hr * 0.5, my + i * hr * 0.3);
      ctx.stroke();
    }
  },
  gigglegan: (ctx, w, h, p, prop) => {
    // a pocket snack in hand (still steaming), a SNACKS lunchbox, and a little giggle cloud overhead
    const { hx, hy, hr, tw } = person(ctx, w, h, p, { skin: SKIN.fair, shirt: '#6fa8dc', pants: '#34495e', hair: 'parted', hairColor: '#6b4a2b' });
    const gy = hy - hr * 2.1 + Math.sin(p.t * 3) * 2;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const [dx, dy, rr2] of [[-0.7, 0.1, 0.55], [0, -0.15, 0.7], [0.7, 0.1, 0.55]]) {
      ctx.beginPath();
      ctx.arc(hx + w * 0.12 + dx * hr, gy + dy * hr, rr2 * hr, 0, TAU);
      ctx.fill();
    }
    propText(ctx, 'HEE HEE', hx + w * 0.12, gy, hr * 2.2, Math.max(6, hr * 0.5), '#ff4ec8');
    arm(ctx, -tw * 0.5, -h * 0.12, -w * 0.4, -h * 0.05, w, '#6fa8dc', SKIN.fair);
    ctx.fillStyle = '#e8b062';
    rr(ctx, -w * 0.5, -h * 0.11, w * 0.18, h * 0.08, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, -h * 0.12);
    ctx.quadraticCurveTo(-w * 0.38 + Math.sin(p.t * 6) * 3, -h * 0.17, -w * 0.42, -h * 0.22);
    ctx.stroke();
    placard(ctx, prop, w * 0.14, h * 0.3, w * 0.34, h * 0.12, '#e63946', '#fff');
  },
  brooms: (ctx, w, h, p) => {
    // a royal robe with fluffy trim, a too-big crown that pops up when bonked, and a royal broom
    const { hx, hy, hr, tw } = person(ctx, w, h, p, { skin: SKIN.light, shirt: '#b22234', pants: '#333', hair: 'short', hairColor: '#8b6b4a', torsoW: 0.58 });
    ctx.fillStyle = '#fff';
    ctx.fillRect(-tw * 0.5, h * 0.18, tw, h * 0.06);
    ctx.fillRect(-tw * 0.5, -h * 0.2, tw, h * 0.05);
    ctx.fillStyle = '#222';
    for (let i = 0; i < 4; i++) ctx.fillRect(-tw * 0.4 + i * tw * 0.27, h * 0.2, 2, 3);
    const cy = hy - hr * 0.9 + p.lift * 4 - (p.hurt ? hr * 0.4 : 0);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(hx - hr * 0.9, cy + hr * 0.35);
    ctx.lineTo(hx - hr * 0.9, cy - hr * 0.35);
    ctx.lineTo(hx - hr * 0.45, cy);
    ctx.lineTo(hx, cy - hr * 0.5);
    ctx.lineTo(hx + hr * 0.45, cy);
    ctx.lineTo(hx + hr * 0.9, cy - hr * 0.35);
    ctx.lineTo(hx + hr * 0.9, cy + hr * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff4ec8';
    ctx.beginPath();
    ctx.arc(hx, cy + hr * 0.1, hr * 0.12, 0, TAU);
    ctx.fill();
    arm(ctx, tw * 0.5, -h * 0.12, w * 0.36, -h * 0.02, w, '#b22234', SKIN.light);
    const sw = Math.sin(p.t * 3) * 0.12;
    ctx.save();
    ctx.translate(w * 0.36, -h * 0.02);
    ctx.rotate(sw);
    ctx.strokeStyle = '#a0703c';
    ctx.lineWidth = Math.max(2, w * 0.035);
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.3);
    ctx.lineTo(0, h * 0.3);
    ctx.stroke();
    ctx.fillStyle = '#e9c46a';
    ctx.beginPath();
    ctx.moveTo(-w * 0.04, h * 0.28);
    ctx.lineTo(w * 0.04, h * 0.28);
    ctx.lineTo(w * 0.1, h * 0.46);
    ctx.lineTo(-w * 0.1, h * 0.46);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#b22234';
    ctx.fillRect(-w * 0.05, h * 0.28, w * 0.1, h * 0.03);
    ctx.restore();
  },
  elder: (ctx, w, h, p, prop) => {
    // the original reindeer (ROB REINDEER's dad): grey antlers, a red nose, a long robe, a fluffy white beard, a wobbly cane, a DAD sign
    const ehr = Math.min(w * 0.22, h * 0.115);
    antlers(ctx, -w * 0.03, -h * 0.2 - ehr * 0.85, ehr, '#b5a48a');
    const { hx, hy, hr, tw } = person(ctx, w, h, p, { skin: '#c89a6a', shirt: '#8b7355', pants: '#8b7355', hair: 'none', beard: '#f5f5f5', noLegs: true });
    nose(ctx, hx - hr * 0.1, hy + hr * 0.18, hr * 0.2);
    ctx.fillStyle = '#8b7355';
    ctx.beginPath();
    ctx.moveTo(-tw * 0.5, h * 0.1);
    ctx.lineTo(tw * 0.5, h * 0.1);
    ctx.lineTo(tw * 0.6, h * 0.44);
    ctx.lineTo(-tw * 0.6, h * 0.44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5a3a1a';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * w * 0.12 - w * 0.04, h * 0.46, w * 0.1, w * 0.04, 0, 0, TAU);
      ctx.fill();
    }
    const wob = Math.sin(p.t * 3) * w * 0.02;
    arm(ctx, -tw * 0.5, -h * 0.1, -w * 0.33 + wob, h * 0.0, w, '#8b7355', SKIN.light);
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = Math.max(2.5, w * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-w * 0.33 + wob, h * 0.0);
    ctx.lineTo(-w * 0.38, h * 0.47);
    ctx.moveTo(-w * 0.33 + wob, h * 0.0);
    ctx.quadraticCurveTo(-w * 0.3 + wob, -h * 0.07, -w * 0.24 + wob, -h * 0.02);
    ctx.stroke();
    ctx.strokeStyle = '#6b4226';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.4, h * 0.47);
    ctx.lineTo(w * 0.4, -h * 0.1);
    ctx.stroke();
    placard(ctx, prop, w * 0.2, -h * 0.28, w * 0.36, h * 0.12, '#f5e6c8', '#8b5a2b');
  },
  bridgetrolls: (ctx, w, h, p, prop) => drawBridgeTrolls(ctx, w, h, p, prop),
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
  // (BRIDGE TROLLS: the bridge stays put; they get bumped off it and splash, see drawBridgeTrolls)
  const splashy = design === 'bridgetrolls';
  const feetY = b.y + h / 2;
  let rot = 0;
  let alpha = 1;
  let dy = 0;
  if (splashy) {
    alpha = beaten > 0.88 ? 1 - (beaten - 0.88) / 0.12 : 1;
  } else if (beaten > 0) {
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
  if (beaten > 0 && !splashy) {
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
  if (beaten > 0.15 && beaten < 0.95) {
    const fall = words(design).fall;
    let sx = Math.max(60, Math.min(W - 60, b.x));
    if (splashy) {
      // the SPLASH line is a little longer: keep the whole bubble on screen
      ctx.save();
      ctx.font = `900 15px 'Orbitron', sans-serif`;
      const half = ctx.measureText(fall).width / 2 + 8;
      ctx.restore();
      sx = Math.max(half, Math.min(W - half, b.x));
    }
    speech(ctx, fall, sx, b.y - h / 2 - 12, 15, '#ffe14d');
  }
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
    case 'tissue':
      // a fluttering tissue
      ctx.rotate(Math.sin(s.t * 7) * 0.5);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#cfe8ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, -r * 0.6);
      ctx.quadraticCurveTo(0, -r * 0.9 + Math.sin(s.t * 12) * r * 0.2, r * 0.8, -r * 0.6);
      ctx.lineTo(r * 0.7, r * 0.7);
      ctx.quadraticCurveTo(0, r * 0.4, -r * 0.7, r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 'golf':
    case 'baseball':
      ctx.rotate(spin);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, TAU);
      ctx.fill();
      if (skin === 'golf') {
        ctx.fillStyle = '#d0d6dc';
        for (let i = 0; i < 6; i++) {
          const a = (i * TAU) / 6;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.1, 0, TAU);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = '#e63946';
        ctx.lineWidth = Math.max(1.5, r * 0.12);
        ctx.beginPath();
        ctx.arc(-r * 1.1, 0, r * 0.75, -Math.PI * 0.25, Math.PI * 0.25);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(r * 1.1, 0, r * 0.75, Math.PI * 0.75, Math.PI * 1.25);
        ctx.stroke();
      }
      break;
    case 'coffee':
      ctx.rotate(Math.sin(s.t * 7) * 0.4);
      ctx.fillStyle = '#fff';
      rr(ctx, -r * 0.55, -r * 0.6, r * 1.1, r * 1.3, r * 0.15);
      ctx.fill();
      ctx.fillStyle = '#6f4e37';
      ctx.fillRect(-r * 0.45, -r * 0.5, r * 0.9, r * 0.2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1.5, r * 0.15);
      ctx.beginPath();
      ctx.arc(r * 0.6, 0, r * 0.3, -1.3, 1.3);
      ctx.stroke();
      break;
    case 'moth': {
      // a friendly grey moth, wings flapping
      const flap = 0.35 + Math.abs(Math.sin(s.t * 20)) * 0.65;
      ctx.fillStyle = '#c8c0b0';
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sx * r * 0.5, 0, r * 0.55, r * 0.75 * flap, sx * 0.4, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#6b6050';
      ctx.fillRect(-r * 0.12, -r * 0.55, r * 0.24, r * 1.1);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-r * 0.08, -r * 0.45, r * 0.08, 0, TAU);
      ctx.fill();
      break;
    }
    case 'card':
      ctx.rotate(spin * 0.7);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-r * 0.9, -r * 0.6, r * 1.8, r * 1.2);
      ctx.fillStyle = '#ff3355';
      ctx.fillRect(-r * 0.9, -r * 0.4, r * 1.8, r * 0.1);
      ctx.fillStyle = '#7fb3ff';
      for (let i = 0; i < 3; i++) ctx.fillRect(-r * 0.75, -r * 0.1 + i * r * 0.25, r * 1.5, r * 0.07);
      break;
    case 'pencil':
      ctx.rotate(spin);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-r * 0.9, -r * 0.2, r * 1.4, r * 0.4);
      ctx.fillStyle = '#ff9ab0';
      ctx.fillRect(-r * 1.1, -r * 0.2, r * 0.25, r * 0.4);
      ctx.fillStyle = '#f5deb3';
      ctx.beginPath();
      ctx.moveTo(r * 0.5, -r * 0.2);
      ctx.lineTo(r * 1.05, 0);
      ctx.lineTo(r * 0.5, r * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'cap':
      ctx.rotate(Math.sin(s.t * 9) * 0.5);
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.arc(0, r * 0.2, r * 0.7, Math.PI, TAU);
      ctx.fill();
      ctx.fillRect(-r * 1.1, r * 0.1, r * 0.8, r * 0.2);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, -r * 0.5, r * 0.12, 0, TAU);
      ctx.fill();
      break;
    case 'egg':
      // a sunny-side-up egg, wobbling
      ctx.rotate(Math.sin(s.t * 6) * 0.3);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.95, r * 0.75, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffc93c';
      ctx.beginPath();
      ctx.arc(-r * 0.1, -r * 0.05, r * 0.38, 0, TAU);
      ctx.fill();
      break;
    case 'pancake':
      // a flipping pancake with a pat of butter
      ctx.rotate(spin);
      ctx.fillStyle = '#e0a458';
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#c47f32';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.12, r * 0.9, r * 0.25, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = '#fff3a0';
      ctx.fillRect(-r * 0.2, -r * 0.3, r * 0.4, r * 0.22);
      break;
    case 'sock':
      // a flying red sock
      ctx.rotate(Math.sin(s.t * 8) * 0.6);
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r);
      ctx.lineTo(r * 0.4, -r);
      ctx.lineTo(r * 0.4, r * 0.2);
      ctx.quadraticCurveTo(r * 0.4, r * 0.8, -r * 0.35, r * 0.75);
      ctx.quadraticCurveTo(-r, r * 0.7, -r * 0.8, r * 0.3);
      ctx.lineTo(-r * 0.2, r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-r * 0.2, -r, r * 0.6, r * 0.25);
      break;
    case 'hubcap':
    case 'wheel':
      ctx.rotate(spin);
      ctx.fillStyle = skin === 'hubcap' ? '#d6dde3' : '#9a8f80';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = skin === 'hubcap' ? '#8a959f' : '#6b6255';
      if (skin === 'hubcap') {
        for (let i = 0; i < 5; i++) {
          ctx.save();
          ctx.rotate((i * TAU) / 5);
          ctx.fillRect(0, -r * 0.08, r * 0.8, r * 0.16);
          ctx.restore();
        }
      } else {
        // a stone wheel with a square hole (very early model)
        ctx.fillRect(-r * 0.2, -r * 0.2, r * 0.4, r * 0.4);
      }
      break;
    case 'boot':
      ctx.rotate(Math.sin(s.t * 8) * 0.5);
      ctx.fillStyle = '#7a4b2a';
      ctx.fillRect(-r * 0.2, -r * 0.9, r * 0.6, r * 1.2);
      rr(ctx, -r * 0.9, r * 0.1, r * 1.3, r * 0.6, r * 0.25);
      ctx.fill();
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(-r * 0.9, r * 0.6, r * 1.3, r * 0.15);
      break;
    case 'mic':
      ctx.rotate(spin * 0.6);
      ctx.fillStyle = '#333';
      ctx.fillRect(-r * 0.15, 0, r * 0.3, r * 1.0);
      ctx.fillStyle = '#9aa3ad';
      ctx.beginPath();
      ctx.arc(0, -r * 0.25, r * 0.6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.55, -r * 0.25 + i * r * 0.25);
        ctx.lineTo(r * 0.55, -r * 0.25 + i * r * 0.25);
        ctx.stroke();
      }
      break;
    case 'dumbbell':
      ctx.rotate(spin);
      ctx.fillStyle = '#555';
      ctx.fillRect(-r * 0.7, -r * 0.12, r * 1.4, r * 0.24);
      ctx.fillStyle = '#333';
      for (const sx of [-1, 1]) {
        rr(ctx, sx * r * 0.7 - r * 0.25, -r * 0.55, r * 0.5, r * 1.1, r * 0.12);
        ctx.fill();
      }
      break;
    case 'pocket':
      // a pocket snack, crimped edges, a curl of steam
      ctx.rotate(Math.sin(s.t * 5) * 0.3);
      ctx.fillStyle = '#e8b062';
      rr(ctx, -r * 0.9, -r * 0.5, r * 1.8, r * 1.0, r * 0.3);
      ctx.fill();
      ctx.fillStyle = '#c98b3a';
      for (let i = 0; i < 5; i++) ctx.fillRect(-r * 0.75 + i * r * 0.35, r * 0.35, r * 0.15, r * 0.12);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.55);
      ctx.quadraticCurveTo(r * 0.3 * Math.sin(s.t * 8), -r * 0.9, 0, -r * 1.2);
      ctx.stroke();
      break;
    case 'bacon': {
      ctx.rotate(spin * 0.5);
      ctx.lineCap = 'round';
      const wave = (c: string, wdt: number, oy: number): void => {
        ctx.strokeStyle = c;
        ctx.lineWidth = wdt;
        ctx.beginPath();
        ctx.moveTo(-r, oy);
        ctx.quadraticCurveTo(-r * 0.5, oy - r * 0.5, 0, oy);
        ctx.quadraticCurveTo(r * 0.5, oy + r * 0.5, r, oy);
        ctx.stroke();
      };
      wave('#b5452b', Math.max(4, r * 0.7), 0);
      wave('#f4b6a0', Math.max(1.5, r * 0.18), 0);
      break;
    }
    case 'crown':
      ctx.rotate(Math.sin(s.t * 7) * 0.4);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, r * 0.5);
      ctx.lineTo(-r * 0.9, -r * 0.5);
      ctx.lineTo(-r * 0.45, 0);
      ctx.lineTo(0, -r * 0.7);
      ctx.lineTo(r * 0.45, 0);
      ctx.lineTo(r * 0.9, -r * 0.5);
      ctx.lineTo(r * 0.9, r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff4ec8';
      ctx.beginPath();
      ctx.arc(0, r * 0.15, r * 0.15, 0, TAU);
      ctx.fill();
      break;
    case 'tophat':
      ctx.rotate(Math.sin(s.t * 6) * 0.5);
      ctx.fillStyle = '#222';
      ctx.fillRect(-r * 0.55, -r * 0.9, r * 1.1, r * 1.3);
      ctx.fillRect(-r * 0.95, r * 0.35, r * 1.9, r * 0.25);
      ctx.fillStyle = '#e63946';
      ctx.fillRect(-r * 0.55, r * 0.1, r * 1.1, r * 0.2);
      break;
    case 'hourglass':
      ctx.rotate(spin * 0.5);
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(-r * 0.65, -r * 0.9, r * 1.3, r * 0.18);
      ctx.fillRect(-r * 0.65, r * 0.72, r * 1.3, r * 0.18);
      ctx.fillStyle = 'rgba(200,240,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.72);
      ctx.lineTo(r * 0.5, -r * 0.72);
      ctx.lineTo(0, 0);
      ctx.lineTo(r * 0.5, r * 0.72);
      ctx.lineTo(-r * 0.5, r * 0.72);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f0c040';
      ctx.beginPath();
      ctx.moveTo(-r * 0.32, r * 0.72);
      ctx.lineTo(r * 0.32, r * 0.72);
      ctx.lineTo(0, r * 0.28);
      ctx.closePath();
      ctx.fill();
      break;
    case 'cone':
      // an ice cream cone, tumbling (BRIDGE TROLLS)
      ctx.rotate(spin * 0.6);
      ctx.fillStyle = '#d9a35b';
      ctx.beginPath();
      ctx.moveTo(-r * 0.55, -r * 0.1);
      ctx.lineTo(r * 0.55, -r * 0.1);
      ctx.lineTo(0, r * 1.1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#a8742f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, -r * 0.1);
      ctx.lineTo(r * 0.15, r * 0.6);
      ctx.moveTo(r * 0.3, -r * 0.1);
      ctx.lineTo(-r * 0.15, r * 0.6);
      ctx.stroke();
      ctx.fillStyle = '#ff9ec7';
      ctx.beginPath();
      ctx.arc(0, -r * 0.35, r * 0.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.arc(r * 0.1, -r * 0.95, r * 0.16, 0, TAU);
      ctx.fill();
      break;
    case 'bobber':
      // a red-and-white fishing bobber (BRIDGE TROLLS)
      ctx.rotate(Math.sin(s.t * 8) * 0.4);
      bobber(ctx, 0, 0, r * 0.9);
      break;
    default:
      ctx.restore();
      return false;
  }
  void time;
  ctx.restore();
  return true;
}
