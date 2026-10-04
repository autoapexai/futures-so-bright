/**
 * MINI-BOSSES: a short, punchy fight at the end of every level that has no big boss (1-9, 11-19,
 * ... 101-109). The big bosses on 10, 20, ... 110 and 111 are untouched (see Boss.ts).
 *
 * GATE: the level timer ends in the mini-boss fight and the level is only passed once it is
 * beaten. Mini-bosses never get bored and leave (big bosses still do), however long you survive.
 * Beating one is worth 1,000 x level points, times the GAME SPEED (scalePoints), still capped.
 *
 * THE COMEDIANS (Mr. Dan's list): every mini-boss is a gentle, G-rated cartoon tribute to a
 * comedian, labelled "MINI-BOSS: NAME", with a signature prop and Airplane!/Naked Gun-style
 * deadpan sight gags (pratfalls, literal-minded signs, props that misbehave). All lines are
 * original (no quotes from their material). Level 1 is ROB REINER; then, in order and repeating:
 * Jerry Seinfeld, Larry David, Norm Macdonald, David Letterman, Brody Stevens, Richard Pryor,
 * Redd Foxx, Joe Rogan, Jim Gaffigan, Mel Brooks, Carl Reiner. Drawn smaller than any big boss.
 * Difficulty rises smoothly with the level (miniTuning) and always stays well below the big
 * bosses, including the eased L60 and L90 fights, so there is no spike next to them.
 * The fight itself reuses BossFight (barks, weak spot, stun rings, shots) with a def.mini spec.
 */
import type { Board, BossDef, BossFight, BossShot, BossTuning, Pattern, PopSfx } from './Boss';
import { fmtNum, lang, type Lang } from '../i18n';
import { eyes, glow, mouth, speech, star, type Pose } from './bossToons';

export interface MiniSpec {
  design: Design;
  /** 0 on the comedian's first appearance, 1 on the second, ... (fresh gags each time). */
  appearance: number;
  /** Shot costume per attack pattern (drawn by drawMiniShot). */
  skins: Record<string, string>;
  /** Weak-spot hit bursts and the stun burst, in the current language. */
  pops: () => [string, PopSfx][];
  stunPop: () => string;
}

type Design = 'reiner' | 'seinfeld' | 'larry' | 'norm' | 'letterman' | 'brody' | 'pryor' | 'foxx' | 'rogan' | 'gaffigan' | 'brooks' | 'carl';

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
  seinfeld: { name: 'JERRY SEINFELD', tint: '#fff3d6', sig: 'spray', skins: { spray: 'cereal', aimed: 'cereal', wall: 'puffy' }, sfx: ['boing', 'honk', 'whistleUp'] },
  larry: { name: 'LARRY DAVID', tint: '#d8c59a', sig: 'dots', skins: { dots: 'golf', aimed: 'golf', wall: 'coffee', spray: 'golf' }, sfx: ['honk', 'whistleDown', 'boing'] },
  norm: { name: 'NORM MACDONALD', tint: '#b8c7d6', sig: 'homing', skins: { homing: 'moth', aimed: 'moth', wall: 'moth', spray: 'moth' }, sfx: ['whistleDown', 'honk', 'boing'] },
  letterman: { name: 'DAVID LETTERMAN', tint: '#8fc1ff', sig: 'tumble', skins: { tumble: 'card', aimed: 'pencil', wall: 'card', spray: 'pencil' }, sfx: ['whistleUp', 'honk', 'boing'] },
  brody: { name: 'BRODY STEVENS', tint: '#ff6b6b', sig: 'spray', skins: { spray: 'baseball', aimed: 'baseball', wall: 'cap' }, sfx: ['whistleUp', 'boing', 'honk'] },
  pryor: { name: 'RICHARD PRYOR', tint: '#ffb347', sig: 'buckles', skins: { buckles: 'windup', aimed: 'duck', wall: 'windup', spray: 'duck' }, sfx: ['boing', 'whistleUp', 'honk'] },
  foxx: { name: 'REDD FOXX', tint: '#d9b98c', sig: 'rain', skins: { rain: 'hubcap', aimed: 'boot', wall: 'hubcap', spray: 'boot' }, sfx: ['honk', 'boing', 'whistleDown'] },
  rogan: { name: 'JOE ROGAN', tint: '#9be39b', sig: 'homing', skins: { homing: 'mic', aimed: 'dumbbell', wall: 'dumbbell', spray: 'mic' }, sfx: ['honk', 'whistleUp', 'boing'] },
  gaffigan: { name: 'JIM GAFFIGAN', tint: '#ffd6a5', sig: 'rain', skins: { rain: 'pocket', aimed: 'bacon', wall: 'pocket', spray: 'bacon' }, sfx: ['boing', 'honk', 'whistleDown'] },
  brooks: { name: 'MEL BROOKS', tint: '#e3b5ff', sig: 'tumble', skins: { tumble: 'crown', aimed: 'tophat', wall: 'tophat', spray: 'crown' }, sfx: ['honk', 'boing', 'whistleUp'] },
  carl: { name: 'CARL REINER', tint: '#e6e6e6', sig: 'dots', skins: { dots: 'wheel', aimed: 'hourglass', wall: 'wheel', spray: 'hourglass' }, sfx: ['whistleDown', 'boing', 'honk'] },
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
 * THE COMEDIANS (Mr. Dan's list). Level 1 is ROB REINER; every later mini-boss level takes the
 * next comedian in this order and the list repeats (11 comedians over mini-bosses #2-#99, so each
 * shows up 9 times). Each repeat is a later level, so it is harder (miniTuning), and it opens
 * with a fresh set of gags (miniTaunt picks from a different window of the comedian's lines).
 */
const ROTATION: Design[] = ['seinfeld', 'larry', 'norm', 'letterman', 'brody', 'pryor', 'foxx', 'rogan', 'gaffigan', 'brooks', 'carl'];

interface Words {
  /** Six original G-rated lines (three for Rob Reiner); each appearance uses a different three. */
  taunts: string[];
  pops: [string, string, string];
  stun: string;
  /** Said during the pratfall. */
  fall: string;
  /** Prop text drawn on the character (a sign, a card, a cap), if any. */
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
      seinfeld: { taunts: ['WHAT IS THE DEAL WITH DOGS IN SUNGLASSES? WHO ARE THEY HIDING FROM?', 'YOU EVER NOTICE DOGS ALWAYS RUN TO THE RIGHT? WHY NOT THE LEFT?', 'THIS SHIRT HAS RUFFLES. I DID NOT ASK FOR RUFFLES.', 'CEREAL FOR DINNER IS NOT A PHASE. IT IS A LIFESTYLE.', "WHY DO THEY CALL IT A BOSS FIGHT? I'M MORE OF A MANAGER.", "AND WHAT'S WITH THE SUN? UP THERE ALL DAY. GET A HOBBY!"], pops: ['WHAT?!', 'RUFFLES!', 'OH, COME ON!'], stun: 'WHAT IS THE DEAL?!', fall: 'NOT THE SHIRT!' },
      larry: { taunts: ['IS THIS A SOCIAL RULE NOW? DOGS JUST RUNNING AT PEOPLE?', "I'M NOT SAYING YOU'RE WRONG. I'M SAYING I'M RIGHT.", "YOU WAVED AT ME. I DIDN'T WAVE BACK. NOW IT'S A WHOLE THING.", 'THIS IS SO-SO. MAYBE EVEN SO-SO-SO.', "I'LL DODGE WHEN I'M READY. I HAVE A SYSTEM.", 'DID YOU JUST STAND IN MY SPOT? THAT WAS MY SPOT.'], pops: ['HEY!', 'COME ON!', 'REALLY?!'], stun: '*SHRUG*', fall: 'UNBELIEVABLE!', prop: 'SO-SO' },
      norm: { taunts: ["I HAVE A MOTH FRIEND. HE'S MOSTLY HERE FOR THE LAMP.", "SO A DOG WALKS INTO A LEVEL. THAT'S IT. THAT'S THE WHOLE THING.", "I'M GOING TO STAND HERE AND NOT BLINK. THAT'S THE PLAN.", "THE MOTH SAYS HI. HE DOESN'T. HE'S A MOTH.", "SOME SAY I'M DEADPAN. I SAY NOTHING. SEE?", "THAT WAS A GOOD DODGE. I'M NOT GOING TO CLAP, BUT IT WAS."], pops: ['HM.', 'OKAY.', 'WELL.'], stun: 'HUH.', fall: 'WELL, THAT HAPPENED.' },
      letterman: { taunts: ["TONIGHT'S TOP TEN: NUMBER TEN, DOGS. NUMBER NINE, ALSO DOGS.", "WE'LL BE RIGHT BACK AFTER I THROW THIS PENCIL.", 'NUMBER FOUR: SUNGLASSES INDOORS. SUNGLASSES OUTDOORS. ALL THE SUNGLASSES.', 'TONIGHT ON THE DESK: ONE PENCIL, ONE MUG, ZERO PATIENCE.', "AND THE NUMBER ONE REASON YOU WON'T PASS: ME. I HAVE A DESK.", "HOLD ON, THE BAND IS PLAYING. NO, IT'S JUST THE DOGS."], pops: ['NUMBER TEN!', 'DING!', 'ZING!'], stun: 'COMMERCIAL BREAK!', fall: 'GOOD NIGHT, EVERYBODY!', prop: 'TOP 10' },
      brody: { taunts: ["POSITIVE ENERGY! YOU'RE DOING GREAT! NOW STOP!", "LET'S GO, TEAM! WAIT, WHICH TEAM AM I ON?", 'HIGH FIVES FOR EVERYONE! EXCEPT THE DOGS. THEY HAVE PAWS.', 'WARMING UP THE ARM! THIS PITCH HAS FEELINGS!', "BIG HUG FROM THE PITCHER'S MOUND! IT'S A LONG-DISTANCE HUG!", "YOU CAN DO IT! I BELIEVE IN YOU! DON'T TELL MY BOSS."], pops: ["LET'S GO!", 'YEAH!', 'STRIKE!'], stun: 'TIME OUT!', fall: 'GOOD GAME, GOOD GAME!', prop: 'HYPE' },
      pryor: { taunts: ['I GOT A WHOLE TOY CHEST AND NOBODY TO PLAY WITH. YOU WANT A TURN?', "WIND IT UP, LET IT GO, AND RUN! THAT'S THE WHOLE GAME!", 'THIS RUBBER DUCK HAS SEEN THINGS. MOSTLY BATHTUBS.', "HOLD ON, I'M LAUGHING AT MY OWN JOKE. GIVE ME A SECOND.", 'THESE DOGS ARE FAST! SOMEBODY CALL THEIR MOMS!', "CAREFUL! THAT TOY ROBOT DOESN'T KNOW WHERE IT'S GOING. NEITHER DO I."], pops: ['SQUEAK!', 'WHEE!', 'HA HA!'], stun: 'ALL WOUND UP!', fall: 'OKAY, OKAY, YOU WIN!', prop: 'TOYS' },
      foxx: { taunts: ['WELCOME TO THE JUNKYARD! EVERYTHING IS FOR SALE. EVEN THE DUST.', 'THIS HUBCAP? GENUINE. GENUINELY ROUND.', 'HOLD ON, LET ME SIT DOWN. THIS ROCKING CHAIR WAS A BARGAIN.', "I'VE GOT A BOOT, HALF A LAMP, AND A WHOLE LOT OF OPINIONS.", 'YOU DOGS ARE TRACKING MUD ON MY NICE JUNK!', "ONE PERSON'S TRASH IS ANOTHER PERSON'S... STILL TRASH. BUT SHINY."], pops: ['CLUNK!', 'CLANG!', 'RATTLE!'], stun: 'HOLD ON NOW!', fall: 'SOLD! TO THE DOGS!', prop: 'JUNK' },
      rogan: { taunts: ['WHOA. DOGS IN SUNGLASSES. HAVE YOU EVER REALLY THOUGHT ABOUT THAT?', "THIS MICROPHONE IS HUGE. I DON'T KNOW WHO ORDERED IT.", 'THREE-HOUR EPISODE TODAY. TOPIC: WHY ARE YOU STILL DODGING?', 'LOOK IT UP. NO, LOOK IT UP AGAIN. THE ONE WITH THE DOGS.', 'I JUST DID A HUNDRED PUSH-UPS. ONE HUNDRED. ASK THE MIC.', "THAT'S WILD. NO, REALLY. THAT IS SO WILD."], pops: ['WHOA!', 'WILD!', 'BOOM!'], stun: 'MIND BLOWN!', fall: "AND THAT'S THE SHOW!", prop: 'ON AIR' },
      gaffigan: { taunts: ['I WAS GOING TO EXERCISE TODAY. THEN I SAW A SNACK.', 'THIS POCKET SNACK IS FROZEN ON THE OUTSIDE AND LAVA IN THE MIDDLE.', 'BACON IS JUST BREAKFAST WITH A DRUMROLL.', "ARE THOSE DOGS RUNNING? ON PURPOSE? I'M SO TIRED FOR THEM.", "I'LL DODGE AFTER SECOND LUNCH. OR THIRD.", 'THEY SAY BREAKFAST IS THE MOST IMPORTANT MEAL. I SAY ALL OF THEM ARE.'], pops: ['MMM!', 'CRUNCH!', 'NOM!'], stun: 'FOOD COMA!', fall: 'NAP TIME!', prop: 'SNACKS' },
      brooks: { taunts: ['HEAR YE! THE KING DECLARES: NO RUNNING IN THE KINGDOM!', 'I HAVE A HAT FOR EVERY OCCASION. THIS IS MY THROWING HAT.', 'BRING ME MY CROWN! NO, THE SILLY ONE!', 'ROYAL DECREE: ALL DOGS MUST WEAR SUNGLASSES. OH. THEY DO.', "I'VE BEEN A KING, A COWBOY AND A CHEF. TODAY I'M A WALL.", 'HALT, IN THE NAME OF THE CROWN! ALSO, LOVELY BARKING.'], pops: ['OY!', 'MY HAT!', 'HUZZAH!'], stun: 'THE CROWN SLIPPED!', fall: 'EXIT, STAGE LEFT!' },
      carl: { taunts: ["I'M TWO THOUSAND YEARS OLD. I'VE SEEN FASTER DOGS. NOT MANY.", "BACK IN MY DAY, WE DIDN'T HAVE LEVELS. WE HAD ROCKS.", 'THIS CANE IS OLDER THAN THE WHEEL. I CHECKED.', 'I REMEMBER WHEN THE SUN WAS A LITTLE SMALLER.', 'SLOW DOWN, YOUNG PUPS! SOME OF US ARE ANCIENT!', 'I INVENTED THE NAP. NOBODY EVER GIVES ME CREDIT.'], pops: ['OOF!', 'HMPH!', 'TAP TAP!'], stun: "WHERE'S MY CANE?", fall: 'TIME FOR A NAP!', prop: '2000' },
    },
  },
  es: {
    tag: 'MINIJEFE',
    gate: '¡VÉNCELO PARA PASAR EL NIVEL {n}!',
    beaten: 'MINIJEFE K.O.  ·  +{p}',
    words: {
      reiner: { taunts: ['¡ACCIÓN! ESPERA, ¿QUIÉN CONTRATÓ A TANTOS PERROS?', 'DESDE EL PRINCIPIO. ESTA VEZ CON MENOS LADRIDOS.', 'DIJE «CORTEN», NO «GUAU».'], pops: ['¡CORTEN!', '¡TOMA DOS!', '¡ACCIÓN!'], stun: '¡SILENCIO EN EL SET!', fall: '¡FIN DEL RODAJE!', prop: 'ROB' },
      seinfeld: { taunts: ['¿CUÁL ES EL ROLLO CON LOS PERROS CON GAFAS DE SOL? ¿DE QUIÉN SE ESCONDEN?', '¿NO HAS NOTADO QUE LOS PERROS SIEMPRE CORREN A LA DERECHA? ¿POR QUÉ NO A LA IZQUIERDA?', 'ESTA CAMISA TIENE VOLANTES. YO NO PEDÍ VOLANTES.', 'CEREAL PARA CENAR NO ES UNA ETAPA. ES UN ESTILO DE VIDA.', '¿POR QUÉ LE DICEN PELEA DE JEFE? YO SOY MÁS BIEN GERENTE.', '¿Y QUÉ PASA CON EL SOL? AHÍ ARRIBA TODO EL DÍA. ¡BÚSCATE UN PASATIEMPO!'], pops: ['¡¿QUÉ?!', '¡VOLANTES!', '¡AY, POR FAVOR!'], stun: '¡¿CUÁL ES EL ROLLO?!', fall: '¡LA CAMISA NO!' },
      larry: { taunts: ['¿AHORA ES UNA REGLA SOCIAL? ¿PERROS CORRIENDO HACIA LA GENTE?', 'NO DIGO QUE ESTÉS EQUIVOCADO. DIGO QUE YO TENGO RAZÓN.', 'ME SALUDASTE. NO TE DEVOLVÍ EL SALUDO. AHORA ES TODO UN TEMA.', 'ESTO ESTÁ MÁS O MENOS. TAL VEZ MÁS O MENOS O MENOS.', 'ESQUIVARÉ CUANDO ESTÉ LISTO. TENGO UN SISTEMA.', '¿TE PARASTE EN MI LUGAR? ESE ERA MI LUGAR.'], pops: ['¡OYE!', '¡VAMOS!', '¡¿EN SERIO?!'], stun: '¿Y QUÉ?', fall: '¡INCREÍBLE!', prop: 'MÁS O MENOS' },
      norm: { taunts: ['TENGO UN AMIGO POLILLA. VIENE MÁS QUE NADA POR LA LÁMPARA.', 'ENTONCES UN PERRO ENTRA A UN NIVEL. YA. ESO ES TODO.', 'ME VOY A QUEDAR AQUÍ SIN PARPADEAR. ESE ES EL PLAN.', 'LA POLILLA TE SALUDA. NO ES CIERTO. ES UNA POLILLA.', 'DICEN QUE SOY INEXPRESIVO. YO NO DIGO NADA. ¿VES?', 'BUENA ESQUIVADA. NO VOY A APLAUDIR, PERO LO FUE.'], pops: ['MM.', 'BUENO.', 'PUES.'], stun: 'AJÁ.', fall: 'BUENO, ESO PASÓ.' },
      letterman: { taunts: ['EL TOP 10 DE HOY: NÚMERO DIEZ, PERROS. NÚMERO NUEVE, TAMBIÉN PERROS.', 'VOLVEMOS DESPUÉS DE QUE LANCE ESTE LÁPIZ.', 'NÚMERO CUATRO: GAFAS DE SOL ADENTRO. GAFAS DE SOL AFUERA. TODAS LAS GAFAS.', 'HOY EN EL ESCRITORIO: UN LÁPIZ, UNA TAZA, CERO PACIENCIA.', 'Y LA RAZÓN NÚMERO UNO POR LA QUE NO PASARÁS: YO. TENGO UN ESCRITORIO.', 'UN MOMENTO, ESTÁ TOCANDO LA BANDA. NO, SON LOS PERROS.'], pops: ['¡NÚMERO DIEZ!', '¡DING!', '¡ZAS!'], stun: '¡PAUSA COMERCIAL!', fall: '¡BUENAS NOCHES A TODOS!', prop: 'TOP 10' },
      brody: { taunts: ['¡ENERGÍA POSITIVA! ¡LO ESTÁS HACIENDO GENIAL! ¡AHORA PARA!', '¡VAMOS, EQUIPO! ESPERA, ¿EN QUÉ EQUIPO ESTOY?', '¡CHOCA ESOS CINCO TODO EL MUNDO! MENOS LOS PERROS. TIENEN PATAS.', '¡CALENTANDO EL BRAZO! ¡ESTE LANZAMIENTO TIENE SENTIMIENTOS!', '¡UN GRAN ABRAZO DESDE EL MONTÍCULO! ¡ES UN ABRAZO A DISTANCIA!', '¡TÚ PUEDES! ¡CREO EN TI! NO SE LO DIGAS A MI JEFE.'], pops: ['¡VAMOS!', '¡SÍ!', '¡STRIKE!'], stun: '¡TIEMPO FUERA!', fall: '¡BUEN JUEGO, BUEN JUEGO!', prop: 'ÁNIMO' },
      pryor: { taunts: ['TENGO UN BAÚL LLENO DE JUGUETES Y NADIE CON QUIEN JUGAR. ¿QUIERES UN TURNO?', '¡DALE CUERDA, SUÉLTALO Y CORRE! ¡ESE ES TODO EL JUEGO!', 'ESTE PATITO DE GOMA HA VISTO COSAS. SOBRE TODO BAÑERAS.', 'ESPERA, ME ESTOY RIENDO DE MI PROPIO CHISTE. DAME UN SEGUNDO.', '¡ESTOS PERROS SON RÁPIDOS! ¡QUE ALGUIEN LLAME A SUS MAMÁS!', '¡CUIDADO! ESE ROBOT DE JUGUETE NO SABE A DÓNDE VA. YO TAMPOCO.'], pops: ['¡ÑIQUI!', '¡IUJU!', '¡JA, JA!'], stun: '¡CON TODA LA CUERDA!', fall: '¡VALE, VALE, TÚ GANAS!', prop: 'JUGUETES' },
      foxx: { taunts: ['¡BIENVENIDOS AL DESHUESADERO! TODO ESTÁ A LA VENTA. HASTA EL POLVO.', '¿ESTE TAPACUBOS? AUTÉNTICO. AUTÉNTICAMENTE REDONDO.', 'ESPERA, DÉJAME SENTARME. ESTA MECEDORA FUE UNA GANGA.', 'TENGO UNA BOTA, MEDIA LÁMPARA Y UN MONTÓN DE OPINIONES.', '¡PERROS, ESTÁN LLENANDO DE LODO MI CHATARRA BONITA!', 'LO QUE UNO TIRA ES EL TESORO DE OTRO... BUENO, SIGUE SIENDO BASURA. PERO BRILLA.'], pops: ['¡CLONC!', '¡CLANC!', '¡TRAC, TRAC!'], stun: '¡UN MOMENTO!', fall: '¡VENDIDO A LOS PERROS!', prop: 'CHATARRA' },
      rogan: { taunts: ['UAU. PERROS CON GAFAS DE SOL. ¿ALGUNA VEZ LO HAS PENSADO EN SERIO?', 'ESTE MICRÓFONO ES ENORME. NO SÉ QUIÉN LO PIDIÓ.', 'EPISODIO DE TRES HORAS HOY. TEMA: ¿POR QUÉ SIGUES ESQUIVANDO?', 'BÚSCALO. NO, BÚSCALO OTRA VEZ. EL DE LOS PERROS.', 'ACABO DE HACER CIEN LAGARTIJAS. CIEN. PREGÚNTALE AL MICRÓFONO.', 'QUÉ LOCURA. NO, EN SERIO. QUÉ LOCURA TAN GRANDE.'], pops: ['¡UAU!', '¡LOCURA!', '¡BUM!'], stun: '¡ALUCINANTE!', fall: '¡Y ESO FUE TODO EL PROGRAMA!', prop: 'AL AIRE' },
      gaffigan: { taunts: ['HOY IBA A HACER EJERCICIO. LUEGO VI UNA BOTANA.', 'ESTA EMPANADA DE BOLSILLO ESTÁ CONGELADA POR FUERA Y ES LAVA POR DENTRO.', 'EL TOCINO ES SOLO DESAYUNO CON REDOBLE DE TAMBOR.', '¿ESOS PERROS ESTÁN CORRIENDO? ¿A PROPÓSITO? QUÉ CANSANCIO ME DAN.', 'ESQUIVARÉ DESPUÉS DEL SEGUNDO ALMUERZO. O DEL TERCERO.', 'DICEN QUE EL DESAYUNO ES LA COMIDA MÁS IMPORTANTE. YO DIGO QUE TODAS LO SON.'], pops: ['¡MMM!', '¡CRUNCH!', '¡ÑAM!'], stun: '¡SIESTA DIGESTIVA!', fall: '¡HORA DE LA SIESTA!', prop: 'BOTANAS' },
      brooks: { taunts: ['¡OÍD, OÍD! EL REY DECLARA: ¡PROHIBIDO CORRER EN EL REINO!', 'TENGO UN SOMBRERO PARA CADA OCASIÓN. ESTE ES MI SOMBRERO PARA LANZAR.', '¡TRAEDME MI CORONA! ¡NO, LA CHISTOSA!', 'DECRETO REAL: TODOS LOS PERROS DEBEN USAR GAFAS DE SOL. AH. YA LAS USAN.', 'HE SIDO REY, VAQUERO Y CHEF. HOY SOY UNA PARED.', '¡ALTO, EN NOMBRE DE LA CORONA! POR CIERTO, QUÉ LINDOS LADRIDOS.'], pops: ['¡AY!', '¡MI SOMBRERO!', '¡HURRA!'], stun: '¡SE ME RESBALÓ LA CORONA!', fall: '¡MUTIS POR LA IZQUIERDA!' },
      carl: { taunts: ['TENGO DOS MIL AÑOS. HE VISTO PERROS MÁS RÁPIDOS. NO MUCHOS.', 'EN MIS TIEMPOS NO HABÍA NIVELES. HABÍA PIEDRAS.', 'ESTE BASTÓN ES MÁS VIEJO QUE LA RUEDA. LO COMPROBÉ.', 'RECUERDO CUANDO EL SOL ERA UN POQUITO MÁS PEQUEÑO.', '¡MÁS DESPACIO, CACHORROS! ¡ALGUNOS SOMOS ANTIQUÍSIMOS!', 'YO INVENTÉ LA SIESTA. NADIE ME DA EL CRÉDITO.'], pops: ['¡UF!', '¡HMPF!', '¡TOC, TOC!'], stun: '¿DÓNDE ESTÁ MI BASTÓN?', fall: '¡HORA DE LA SIESTA!', prop: '2000' },
    },
  },
  vi: {
    tag: 'TRÙM NHỎ',
    gate: 'HẠ NÓ ĐỂ QUA CẤP {n}',
    beaten: 'HẠ TRÙM NHỎ  ·  +{p}',
    words: {
      reiner: { taunts: ['DIỄN! KHOAN, AI MỜI CẢ ĐÀN CHÓ NÀY VẬY?', 'LÀM LẠI TỪ ĐẦU. LẦN NÀY BỚT SỦA GIÙM.', 'TÔI BẢO «CẮT», CHỨ ĐÂU BẢO «GÂU».'], pops: ['CẮT!', 'QUAY LẠI!', 'DIỄN!'], stun: 'IM LẶNG!', fall: 'ĐÓNG MÁY!', prop: 'ROB' },
      seinfeld: { taunts: ['CHUYỆN GÌ VỚI MẤY CON CHÓ ĐEO KÍNH RÂM VẬY? CHÚNG TRỐN AI THẾ?', 'BẠN CÓ ĐỂ Ý LÀ CHÓ LUÔN CHẠY SANG PHẢI KHÔNG? SAO KHÔNG SANG TRÁI?', 'CÁI ÁO NÀY CÓ DIỀM XẾP NẾP. TÔI ĐÂU CÓ ĐẶT DIỀM.', 'ĂN NGŨ CỐC BUỔI TỐI KHÔNG PHẢI MỘT GIAI ĐOẠN. ĐÓ LÀ LỐI SỐNG.', 'SAO GỌI LÀ ĐÁNH TRÙM? TÔI GIỐNG QUẢN LÝ HƠN.', 'CÒN MẶT TRỜI THÌ SAO? Ở TRÊN ĐÓ CẢ NGÀY. KIẾM SỞ THÍCH ĐI CHỨ!'], pops: ['HẢ?!', 'DIỀM!', 'THÔI MÀ!'], stun: 'CHUYỆN GÌ VẬY?!', fall: 'ĐỪNG LÀM HỎNG ÁO!' },
      larry: { taunts: ['GIỜ ĐÂY LÀ PHÉP LỊCH SỰ À? CHÓ CỨ CHẠY THẲNG VÀO NGƯỜI TA?', 'TÔI KHÔNG NÓI BẠN SAI. TÔI NÓI TÔI ĐÚNG.', 'BẠN VẪY TAY VỚI TÔI. TÔI KHÔNG VẪY LẠI. GIỜ THÀNH CẢ MỘT CHUYỆN.', 'CÁI NÀY TẠM ĐƯỢC. CÓ KHI TẠM TẠM ĐƯỢC.', 'KHI NÀO SẴN SÀNG TÔI SẼ NÉ. TÔI CÓ HỆ THỐNG.', 'BẠN VỪA ĐỨNG VÀO CHỖ CỦA TÔI À? ĐÓ LÀ CHỖ CỦA TÔI.'], pops: ['NÀY!', 'THÔI NÀO!', 'THẬT HẢ?!'], stun: '*NHÚN VAI*', fall: 'KHÔNG THỂ TIN NỔI!', prop: 'TẠM ĐƯỢC' },
      norm: { taunts: ['TÔI CÓ MỘT NGƯỜI BẠN BƯỚM ĐÊM. NÓ ĐẾN CHỦ YẾU VÌ CÁI ĐÈN.', 'RỒI MỘT CON CHÓ BƯỚC VÀO MÀN CHƠI. HẾT. CHUYỆN CHỈ CÓ VẬY.', 'TÔI SẼ ĐỨNG ĐÂY VÀ KHÔNG CHỚP MẮT. KẾ HOẠCH LÀ VẬY.', 'CON BƯỚM ĐÊM GỬI LỜI CHÀO. KHÔNG ĐÂU. NÓ LÀ BƯỚM ĐÊM MÀ.', 'NGƯỜI TA BẢO TÔI MẶT LẠNH. TÔI KHÔNG NÓI GÌ. THẤY CHƯA?', 'NÉ HAY ĐẤY. TÔI SẼ KHÔNG VỖ TAY, NHƯNG HAY THẬT.'], pops: ['Ừ.', 'ĐƯỢC.', 'CHÀ.'], stun: 'HỬM.', fall: 'CHÀ, CHUYỆN ĐÓ ĐÃ XẢY RA.' },
      letterman: { taunts: ['TOP 10 TỐI NAY: SỐ MƯỜI, CHÓ. SỐ CHÍN, CŨNG LÀ CHÓ.', 'CHÚNG TÔI SẼ TRỞ LẠI SAU KHI TÔI NÉM CÂY BÚT CHÌ NÀY.', 'SỐ BỐN: KÍNH RÂM TRONG NHÀ. KÍNH RÂM NGOÀI TRỜI. TẤT CẢ KÍNH RÂM.', 'TRÊN BÀN TỐI NAY: MỘT CÂY BÚT CHÌ, MỘT CÁI CỐC, KHÔNG CHÚT KIÊN NHẪN.', 'VÀ LÝ DO SỐ MỘT BẠN KHÔNG QUA ĐƯỢC: TÔI. TÔI CÓ CÁI BÀN.', 'KHOAN, BAN NHẠC ĐANG CHƠI. À KHÔNG, LÀ ĐÀN CHÓ.'], pops: ['SỐ MƯỜI!', 'DING!', 'VÚT!'], stun: 'QUẢNG CÁO!', fall: 'CHÚC MỌI NGƯỜI NGỦ NGON!', prop: 'TOP 10' },
      brody: { taunts: ['NĂNG LƯỢNG TÍCH CỰC! BẠN ĐANG LÀM RẤT TỐT! GIỜ DỪNG LẠI ĐI!', 'CỐ LÊN CẢ ĐỘI! KHOAN, TÔI Ở ĐỘI NÀO NHỈ?', 'ĐẬP TAY VỚI MỌI NGƯỜI! TRỪ ĐÀN CHÓ. CHÚNG CÓ CHÂN.', 'KHỞI ĐỘNG CÁNH TAY! CÚ NÉM NÀY CÓ CẢM XÚC ĐẤY!', 'ÔM THẬT CHẶT TỪ GÒ NÉM BÓNG! LÀ CÁI ÔM TỪ XA!', 'BẠN LÀM ĐƯỢC! TÔI TIN BẠN! ĐỪNG MÁCH SẾP TÔI NHÉ.'], pops: ['CỐ LÊN!', 'YEAH!', 'STRIKE!'], stun: 'TẠM DỪNG!', fall: 'TRẬN HAY, TRẬN HAY!', prop: 'CỔ VŨ' },
      pryor: { taunts: ['TÔI CÓ CẢ RƯƠNG ĐỒ CHƠI MÀ KHÔNG AI CHƠI CÙNG. BẠN MUỐN CHƠI KHÔNG?', 'LÊN DÂY CÓT, THẢ RA, RỒI CHẠY! TRÒ CHƠI CHỈ CÓ VẬY!', 'CON VỊT CAO SU NÀY TỪNG TRẢI LẮM. CHỦ YẾU LÀ BỒN TẮM.', 'KHOAN, TÔI ĐANG CƯỜI CHUYỆN CỦA CHÍNH MÌNH. CHỜ TÔI CHÚT.', 'ĐÀN CHÓ NÀY NHANH QUÁ! AI GỌI MẸ CHÚNG ĐI!', 'CẨN THẬN! CON ROBOT ĐỒ CHƠI ĐÓ KHÔNG BIẾT NÓ ĐI ĐÂU. TÔI CŨNG VẬY.'], pops: ['CHÍT!', 'WIII!', 'HA HA!'], stun: 'LÊN DÂY CÓT!', fall: 'THÔI ĐƯỢC, BẠN THẮNG!', prop: 'ĐỒ CHƠI' },
      foxx: { taunts: ['CHÀO MỪNG ĐẾN BÃI ĐỒ CŨ! MỌI THỨ ĐỀU BÁN. CẢ BỤI CŨNG BÁN.', 'CÁI MÂM XE NÀY À? HÀNG THẬT. TRÒN THẬT.', 'KHOAN, ĐỂ TÔI NGỒI ĐÃ. CÁI GHẾ BẬP BÊNH NÀY MUA RẺ LẮM.', 'TÔI CÓ MỘT CHIẾC ỦNG, NỬA CÁI ĐÈN, VÀ CẢ ĐỐNG Ý KIẾN.', 'ĐÀN CHÓ KIA LÀM DÍNH BÙN LÊN ĐỐNG ĐỒ CŨ XỊN CỦA TÔI!', 'ĐỒ BỎ CỦA NGƯỜI NÀY LÀ... VẪN LÀ ĐỒ BỎ. NHƯNG BÓNG LOÁNG.'], pops: ['CẠCH!', 'KENG!', 'LỌC CỌC!'], stun: 'KHOAN ĐÃ NÀO!', fall: 'BÁN! CHO ĐÀN CHÓ!', prop: 'ĐỒ CŨ' },
      rogan: { taunts: ['CHÀ. CHÓ ĐEO KÍNH RÂM. BẠN ĐÃ BAO GIỜ THẬT SỰ NGHĨ VỀ ĐIỀU ĐÓ CHƯA?', 'CÁI MICRO NÀY TO QUÁ. TÔI KHÔNG BIẾT AI ĐẶT NÓ.', 'TẬP HÔM NAY DÀI BA TIẾNG. CHỦ ĐỀ: SAO BẠN VẪN CÒN NÉ?', 'TRA THỬ ĐI. KHÔNG, TRA LẠI ĐI. CÁI CÓ ĐÀN CHÓ ẤY.', 'TÔI VỪA HÍT ĐẤT MỘT TRĂM CÁI. MỘT TRĂM. HỎI CÁI MICRO MÀ XEM.', 'KHÓ TIN THẬT. KHÔNG, THẬT ĐẤY. KHÓ TIN QUÁ ĐI.'], pops: ['CHÀ!', 'ĐỈNH!', 'BÙM!'], stun: 'CHOÁNG VÁNG!', fall: 'VÀ CHƯƠNG TRÌNH KẾT THÚC!', prop: 'ĐANG PHÁT' },
      gaffigan: { taunts: ['HÔM NAY TÔI ĐỊNH TẬP THỂ DỤC. RỒI TÔI THẤY ĐỒ ĂN VẶT.', 'CÁI BÁNH KẸP NÀY NGOÀI THÌ ĐÔNG ĐÁ, TRONG THÌ NÓNG NHƯ DUNG NHAM.', 'THỊT XÔNG KHÓI CHỈ LÀ BỮA SÁNG CÓ TIẾNG TRỐNG DẠO ĐẦU.', 'MẤY CON CHÓ ĐÓ ĐANG CHẠY À? CỐ Ý LUÔN? TÔI MỆT THAY CHO CHÚNG.', 'ĂN TRƯA LẦN HAI XONG TÔI SẼ NÉ. HOẶC LẦN BA.', 'NGƯỜI TA BẢO BỮA SÁNG QUAN TRỌNG NHẤT. TÔI THẤY BỮA NÀO CŨNG QUAN TRỌNG.'], pops: ['NGON!', 'RỘP!', 'MĂM!'], stun: 'NO QUÁ BUỒN NGỦ!', fall: 'GIỜ NGỦ TRƯA!', prop: 'ĐỒ ĂN VẶT' },
      brooks: { taunts: ['NGHE ĐÂY! NHÀ VUA TUYÊN BỐ: CẤM CHẠY TRONG VƯƠNG QUỐC!', 'TÔI CÓ MŨ CHO MỌI DỊP. ĐÂY LÀ MŨ ĐỂ NÉM.', 'MANG VƯƠNG MIỆN RA ĐÂY! KHÔNG, CÁI NGỘ NGHĨNH CƠ!', 'CHIẾU CHỈ: MỌI CON CHÓ PHẢI ĐEO KÍNH RÂM. Ồ. CHÚNG ĐEO RỒI.', 'TÔI TỪNG LÀ VUA, CAO BỒI VÀ ĐẦU BẾP. HÔM NAY TÔI LÀ BỨC TƯỜNG.', 'ĐỨNG LẠI, NHÂN DANH VƯƠNG MIỆN! À, SỦA HAY LẮM.'], pops: ['ÔI!', 'MŨ CỦA TA!', 'HOAN HÔ!'], stun: 'VƯƠNG MIỆN TUỘT RỒI!', fall: 'XIN LUI VÀO CÁNH GÀ!' },
      carl: { taunts: ['TÔI HAI NGHÌN TUỔI RỒI. TÔI TỪNG THẤY CHÓ NHANH HƠN. KHÔNG NHIỀU.', 'HỒI XƯA LÀM GÌ CÓ MÀN CHƠI. CHỈ CÓ ĐÁ THÔI.', 'CÂY GẬY NÀY CÒN GIÀ HƠN CẢ BÁNH XE. TÔI KIỂM TRA RỒI.', 'TÔI CÒN NHỚ HỒI MẶT TRỜI NHỎ HƠN MỘT CHÚT.', 'CHẬM LẠI NÀO, MẤY CÚN CON! CÓ NGƯỜI CỔ XƯA LẮM RỒI!', 'TÔI PHÁT MINH RA GIẤC NGỦ TRƯA. CHẲNG AI GHI CÔNG TÔI CẢ.'], pops: ['ỐI!', 'HỪM!', 'CỘC CỘC!'], stun: 'GẬY CỦA TÔI ĐÂU?', fall: 'ĐẾN GIỜ NGỦ TRƯA!', prop: '2000' },
    },
  },
  zh: {
    tag: '小头目',
    gate: '打败它才能通过第 {n} 关',
    beaten: '击败小头目  ·  +{p}',
    words: {
      reiner: { taunts: ['开拍！等等，这么多狗是谁请来的？', '从头再来。这次少叫几声。', '我说的是“咔”，不是“汪”。'], pops: ['咔！', '再来一条！', '开拍！'], stun: '现场安静！', fall: '杀青！', prop: 'ROB' },
      seinfeld: { taunts: ['戴墨镜的狗是怎么回事？它们在躲谁？', '你有没有发现，狗总是往右跑？为什么不往左？', '这件衬衫有荷叶边。我可没要荷叶边。', '晚饭吃麦片不是一时兴起，是一种生活方式。', '为什么叫打头目？我更像个经理。', '还有太阳是怎么回事？整天挂在上面。找点爱好吧！'], pops: ['什么？！', '荷叶边！', '拜托！'], stun: '到底怎么回事？！', fall: '别弄坏我的衬衫！' },
      larry: { taunts: ['现在这算社交礼仪吗？狗直接冲着人跑？', '我没说你错。我是说我对。', '你冲我挥手，我没挥回去。现在成了一件大事。', '这个嘛，马马虎虎。也许马马虎虎虎。', '我准备好了自然会躲。我有一套方法。', '你刚才站在我的位置上了？那是我的位置。'], pops: ['喂！', '拜托！', '真的假的？！'], stun: '*耸肩*', fall: '难以置信！', prop: '马马虎虎' },
      norm: { taunts: ['我有个飞蛾朋友。它主要是冲着台灯来的。', '一只狗走进了一关。就这样。完了。', '我就站在这儿，不眨眼。这就是计划。', '飞蛾向你问好。其实没有。它是飞蛾。', '有人说我面无表情。我什么也不说。看到没？', '躲得不错。我不会鼓掌，但确实不错。'], pops: ['嗯。', '好吧。', '这样啊。'], stun: '哈？', fall: '好吧，发生了。' },
      letterman: { taunts: ['今晚十大排行：第十名，狗。第九名，还是狗。', '等我扔完这支铅笔，马上回来。', '第四名：室内戴墨镜。室外戴墨镜。所有墨镜。', '今晚桌上：一支铅笔，一个杯子，零耐心。', '你过不了关的头号原因：我。我有一张桌子。', '等等，乐队在演奏。不对，是狗在叫。'], pops: ['第十名！', '叮！', '嗖！'], stun: '插播广告！', fall: '大家晚安！', prop: 'TOP 10' },
      brody: { taunts: ['正能量！你做得很棒！现在停下！', '加油，队友们！等等，我是哪一队的？', '大家击个掌！狗除外。它们只有爪子。', '热身胳膊！这一球是有感情的！', '投手丘送上大大的拥抱！远距离拥抱！', '你能行！我相信你！别告诉我老板。'], pops: ['加油！', '耶！', '好球！'], stun: '暂停！', fall: '好比赛，好比赛！', prop: '加油' },
      pryor: { taunts: ['我有一整箱玩具，却没人陪我玩。你想玩一下吗？', '上好发条，一松手，快跑！游戏就这么简单！', '这只橡皮鸭见过大世面。主要是浴缸。', '等等，我在笑我自己的笑话。给我一秒钟。', '这些狗跑得真快！快叫它们的妈妈来！', '小心！那个玩具机器人不知道要去哪儿。我也不知道。'], pops: ['吱吱！', '呜呼！', '哈哈！'], stun: '发条上满了！', fall: '好啦好啦，你赢了！', prop: '玩具' },
      foxx: { taunts: ['欢迎来到旧货场！什么都卖。连灰尘都卖。', '这个轮毂盖？正品。货真价实地圆。', '等等，让我坐下。这把摇椅可是捡了便宜。', '我有一只靴子、半盏灯，还有一大堆意见。', '你们这些狗，把泥巴踩到我的好旧货上了！', '别人的垃圾是另一个人的……还是垃圾。不过亮晶晶的。'], pops: ['哐当！', '叮当！', '咔啦咔啦！'], stun: '等一下！', fall: '成交！卖给狗狗！', prop: '旧货' },
      rogan: { taunts: ['哇。戴墨镜的狗。你有没有认真想过这件事？', '这个麦克风太大了。我不知道是谁订的。', '今天这期三小时。主题：你为什么还在躲？', '查一下。不，再查一遍。有狗的那个。', '我刚做了一百个俯卧撑。一百个。不信问麦克风。', '太离谱了。不，真的。太离谱了。'], pops: ['哇！', '离谱！', '砰！'], stun: '大开眼界！', fall: '本期节目到此结束！', prop: '直播中' },
      gaffigan: { taunts: ['我今天本来要去锻炼。然后我看到了零食。', '这个口袋点心外面冻得硬邦邦，里面烫得像岩浆。', '培根就是配了鼓声的早餐。', '那些狗在跑步？主动跑？我替它们累。', '等我吃完第二顿午饭再躲。或者第三顿。', '人们说早餐是最重要的一餐。我说每一餐都是。'], pops: ['嗯——！', '咔嚓！', '吧唧！'], stun: '吃撑犯困！', fall: '午睡时间！', prop: '零食' },
      brooks: { taunts: ['听着！国王宣布：王国里禁止奔跑！', '我每种场合都有一顶帽子。这顶是用来扔的。', '把我的王冠拿来！不，要那顶搞笑的！', '皇家法令：所有狗都必须戴墨镜。哦，它们戴了。', '我当过国王、牛仔和厨师。今天我是一堵墙。', '以王冠之名，站住！另外，叫得真好听。'], pops: ['哎哟！', '我的帽子！', '万岁！'], stun: '王冠滑下来了！', fall: '从舞台左侧退场！' },
      carl: { taunts: ['我两千岁了。见过跑得更快的狗。不多。', '想当年，我们没有关卡。我们只有石头。', '这根拐杖比轮子还老。我查过。', '我记得太阳以前还小一点。', '慢点，小狗们！我们有些人可是老古董！', '午睡是我发明的。可从来没人记得我的功劳。'], pops: ['哎哟！', '哼！', '笃笃！'], stun: '我的拐杖呢？', fall: '该打盹了！', prop: '2000' },
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

/** The comedian fighting at the end of this level (null on big-boss levels). */
export function miniDesignForLevel(level: number): Design | null {
  const n = Math.floor(level);
  if (!Number.isFinite(n) || n < 1 || n >= 111 || n % 10 === 0) return null;
  const k = miniIndex(n);
  return k === 1 ? 'reiner' : ROTATION[(k - 2) % ROTATION.length];
}

/** Which appearance of that comedian this is (0 = first). */
export function miniAppearance(level: number): number {
  const k = miniIndex(Math.floor(level));
  return k <= 1 ? 0 : Math.floor((k - 2) / ROTATION.length);
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
      appearance: miniAppearance(level),
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

/** A taunt from this appearance's window of three lines (repeat visits open with fresh gags). */
export function miniTaunt(def: BossDef, rng: () => number): string {
  const spec = def.mini;
  const ts = spec ? words(spec.design).taunts : TEXT.en.words.reiner.taunts;
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
    case 'seinfeld':
    case 'rogan':
      // a stand-up microphone (Rogan's is comically big)
      ctx.fillStyle = '#333';
      ctx.fillRect(r * 0.05, -r * 0.12, r * 0.95, r * 0.24);
      ctx.fillStyle = design === 'rogan' ? '#c0c6cc' : '#9aa3ad';
      ctx.beginPath();
      ctx.arc(-r * 0.25, 0, r * (design === 'rogan' ? 0.75 : 0.55), 0, TAU);
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
    case 'larry': {
      // the SO-SO meter: the needle never leaves the middle
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath();
      ctx.arc(0, r * 0.3, r * 0.85, Math.PI, TAU);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.arc(0, r * 0.3, r * 0.85, Math.PI, Math.PI * 1.25);
      ctx.lineTo(0, r * 0.3);
      ctx.fill();
      ctx.fillStyle = '#5ad35a';
      ctx.beginPath();
      ctx.arc(0, r * 0.3, r * 0.85, Math.PI * 1.75, TAU);
      ctx.lineTo(0, r * 0.3);
      ctx.fill();
      ctx.strokeStyle = '#222';
      ctx.lineWidth = Math.max(2, r * 0.12);
      ctx.beginPath();
      ctx.moveTo(0, r * 0.3);
      ctx.lineTo(Math.sin(p.t * 9) * r * 0.08, -r * 0.45);
      ctx.stroke();
      break;
    }
    case 'norm':
      // the lamp bulb his moth friend visits
      ctx.fillStyle = '#fff3a0';
      ctx.beginPath();
      ctx.arc(0, -r * 0.15, r * 0.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#9aa3ad';
      ctx.fillRect(-r * 0.3, r * 0.4, r * 0.6, r * 0.35);
      break;
    case 'letterman':
      // a TOP TEN index card
      ctx.fillStyle = '#fff';
      rr(ctx, -r * 0.85, -r * 0.55, r * 1.7, r * 1.1, r * 0.1);
      ctx.fill();
      ctx.fillStyle = '#ff3355';
      ctx.fillRect(-r * 0.85, -r * 0.35, r * 1.7, r * 0.08);
      ctx.fillStyle = '#7fb3ff';
      for (let i = 0; i < 3; i++) ctx.fillRect(-r * 0.7, -r * 0.1 + i * r * 0.22, r * 1.4, r * 0.05);
      break;
    case 'brody':
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
    case 'pryor':
      // a big wind-up key (it turns)
      ctx.rotate(p.t * 3);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-r * 0.1, -r * 0.1, r * 0.9, r * 0.2);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(-r * 0.35, s * r * 0.35, r * 0.3, r * 0.4, 0, 0, TAU);
        ctx.fill();
      }
      break;
    case 'foxx':
      // a shiny hubcap
      ctx.rotate(p.t * 2);
      ctx.fillStyle = '#d6dde3';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#8a959f';
      ctx.lineWidth = Math.max(1.5, r * 0.1);
      for (let i = 0; i < 5; i++) {
        const a = (i * TAU) / 5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
        ctx.stroke();
      }
      break;
    case 'gaffigan':
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
    case 'brooks':
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
    case 'carl':
      // an hourglass (two thousand years of sand)
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

/** A gentle cartoon person (the comedian minis): legs, torso, head, hair and face details. */
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
    ctx.quadraticCurveTo(hx, hy + hr * 2.2, hx + hr * 0.85, hy + hr * 0.1);
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
  if (k.deadpan) {
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

const SKIN = { light: '#f2c7a5', fair: '#ffe0cc', tan: '#e8b896', brown: '#8d5524', deep: '#6b4423' };

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
  seinfeld: (ctx, w, h, p) => {
    // the puffy shirt (ruffles, balloon sleeves) and a bowl of cereal held out to the dogs
    const { tw } = person(ctx, w, h, p, { skin: SKIN.light, shirt: '#fffaf0', pants: '#2d3a5a', hair: 'pompadour', hairColor: '#2a1d14' });
    ctx.fillStyle = '#fffaf0';
    ctx.strokeStyle = '#e3d5b5';
    ctx.lineWidth = 1;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * tw * 0.5, -h * 0.14, w * 0.13, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, -h * 0.15 + i * h * 0.08, w * 0.06, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    arm(ctx, -tw * 0.5, -h * 0.1, -w * 0.4, -h * 0.03 + Math.sin(p.t * 3) * 2, w, '#fffaf0', SKIN.light);
    ctx.fillStyle = '#4aa3ff';
    ctx.beginPath();
    ctx.arc(-w * 0.4, -h * 0.05, w * 0.11, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#ffb347';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(-w * 0.4 + i * w * 0.05, -h * 0.06, w * 0.025, 0, TAU);
      ctx.fill();
    }
  },
  larry: (ctx, w, h, p, prop) => {
    // glasses, a sweater, and a big shrug (both palms up, bobbing)
    const { tw } = person(ctx, w, h, p, { skin: SKIN.light, shirt: '#8a9a5b', pants: '#c2b280', hair: 'fringe', hairColor: '#cfcfcf', glasses: true });
    const bob = Math.sin(p.t * 4) * h * 0.02;
    for (const s of [-1, 1]) arm(ctx, s * tw * 0.5, -h * 0.15, s * w * 0.44, -h * 0.3 + bob, w, '#8a9a5b', SKIN.light);
    placard(ctx, prop, -w * 0.2, -h * 0.06, w * 0.4, h * 0.1, '#fffbe0', '#555');
  },
  norm: (ctx, w, h, p) => {
    // a plain suit, a perfectly straight face, and his moth friend fluttering by
    const { hx, hy, hr } = person(ctx, w, h, p, { skin: SKIN.light, shirt: '#4a5568', pants: '#2d3748', hair: 'parted', hairColor: '#6b4a2b', deadpan: true });
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(-w * 0.03, -h * 0.19);
    ctx.lineTo(w * 0.02, -h * 0.02);
    ctx.lineTo(-w * 0.08, -h * 0.02);
    ctx.closePath();
    ctx.fill();
    const mx = hx + hr * 1.7 + Math.sin(p.t * 2.3) * w * 0.08;
    const my = hy - hr * 1.1 + Math.cos(p.t * 3.1) * h * 0.04;
    const flap = 0.4 + Math.abs(Math.sin(p.t * 18)) * 0.6;
    ctx.fillStyle = '#b8b0a0';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(mx + s * w * 0.04, my, w * 0.05, w * 0.035 * flap, s * 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#6b6050';
    ctx.fillRect(mx - 1, my - w * 0.03, 2, w * 0.06);
  },
  letterman: (ctx, w, h, p, prop) => {
    // behind the late-night desk with a mug, holding up tonight's TOP 10 card
    person(ctx, w, h, p, { skin: SKIN.light, shirt: '#2c3e70', pants: '#2c3e70', hair: 'swept', hairColor: '#d8d8d8', glasses: true, noLegs: true });
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
  brody: (ctx, w, h, p, prop) => {
    // a baseball cap (brim to the dogs), a HYPE jersey, and a big fist pump
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
  pryor: (ctx, w, h, p, prop) => {
    // a bright shirt, a warm smile, and his toy chest (a teddy peeking out)
    ctx.fillStyle = '#a0522d';
    rr(ctx, w * 0.2, h * 0.12, w * 0.32, h * 0.3, 4);
    ctx.fill();
    ctx.fillStyle = '#8b4513';
    ctx.save();
    ctx.translate(w * 0.2, h * 0.12);
    ctx.rotate(-0.25 - Math.abs(Math.sin(p.t * 2)) * 0.15);
    ctx.fillRect(0, -h * 0.06, w * 0.32, h * 0.06);
    ctx.restore();
    ctx.fillStyle = '#c68642';
    ctx.beginPath();
    ctx.arc(w * 0.38, h * 0.1, w * 0.07, 0, TAU);
    ctx.arc(w * 0.32, h * 0.04, w * 0.03, 0, TAU);
    ctx.arc(w * 0.44, h * 0.04, w * 0.03, 0, TAU);
    ctx.fill();
    propText(ctx, prop, w * 0.36, h * 0.28, w * 0.28, Math.max(7, w * 0.11), '#ffd23f');
    const { tw } = person(ctx, w, h, p, { skin: SKIN.brown, shirt: '#ff8c42', pants: '#3b2f2f', hair: 'short', hairColor: '#1a1a1a', mustache: '#1a1a1a' });
    ctx.fillStyle = '#ffd23f';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(-tw * 0.2 + i * tw * 0.2, -h * 0.05 + (i % 2) * h * 0.08, w * 0.025, 0, TAU);
      ctx.fill();
    }
  },
  foxx: (ctx, w, h, p, prop) => {
    // rocking in a junkyard rocking chair, flat cap and grey beard, a JUNK sign beside him
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
    const { tw } = person(ctx, w, h, p, { skin: SKIN.deep, shirt: '#8b6f47', pants: '#4a4a4a', hair: 'none', beard: '#cfcfcf', mustache: '#d9d9d9', noLegs: true });
    // legs bent over the seat edge
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = Math.max(3, w * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-tw * 0.2, h * 0.12);
    ctx.lineTo(-w * 0.32, h * 0.14);
    ctx.lineTo(-w * 0.34, h * 0.38);
    ctx.stroke();
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
  rogan: (ctx, w, h, p, prop) => {
    // a stocky host in a black tee behind a comically huge microphone on a boom arm
    const { hx, hy, hr } = person(ctx, w, h, p, { skin: SKIN.tan, shirt: '#222', pants: '#3a3a5a', hair: 'bald', torsoW: 0.6 });
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
  gaffigan: (ctx, w, h, p, prop) => {
    // a round belly, a pocket snack in hand (still steaming) and a lunchbox at his feet
    const { tw } = person(ctx, w, h, p, { skin: SKIN.fair, shirt: '#6fa8dc', pants: '#34495e', hair: 'light', hairColor: '#f0dc9a', torsoW: 0.56 });
    ctx.fillStyle = '#6fa8dc';
    ctx.beginPath();
    ctx.ellipse(-w * 0.04, h * 0.08, tw * 0.55, h * 0.16, 0, 0, TAU);
    ctx.fill();
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
  brooks: (ctx, w, h, p) => {
    // a royal robe with fluffy trim, a too-big crown that pops up when bonked, and a sceptre
    const { hx, hy, hr, tw } = person(ctx, w, h, p, { skin: SKIN.light, shirt: '#b22234', pants: '#333', hair: 'fringe', hairColor: '#bdbdbd', glasses: true, torsoW: 0.58 });
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
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = Math.max(2, w * 0.04);
    ctx.beginPath();
    ctx.moveTo(w * 0.36, h * 0.12);
    ctx.lineTo(w * 0.36, -h * 0.3);
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(w * 0.36, -h * 0.32, w * 0.05, 0, TAU);
    ctx.fill();
  },
  carl: (ctx, w, h, p, prop) => {
    // the two-thousand-year-old man: a long robe, a long white beard, a wobbly cane, a 2000 sign
    const { tw } = person(ctx, w, h, p, { skin: SKIN.light, shirt: '#8b7355', pants: '#8b7355', hair: 'fringe', hairColor: '#f2f2f2', beard: '#f5f5f5', noLegs: true });
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
    case 'cereal':
      // a little cereal ring
      ctx.strokeStyle = ['#ffb347', '#ff6b6b', '#7bd389'][Math.floor(s.t * 3) % 3];
      ctx.lineWidth = Math.max(2.5, r * 0.45);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.65, 0, TAU);
      ctx.stroke();
      break;
    case 'puffy':
      // a flying puffy shirt (ruffles flapping)
      ctx.rotate(Math.sin(s.t * 6) * 0.3);
      ctx.fillStyle = '#fffaf0';
      ctx.strokeStyle = '#d9c9a3';
      ctx.lineWidth = 1;
      rr(ctx, -r * 0.6, -r * 0.7, r * 1.2, r * 1.4, r * 0.25);
      ctx.fill();
      ctx.stroke();
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * r * 0.8, -r * 0.45, r * 0.4, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, -r * 0.4 + i * r * 0.4, r * 0.18, 0, TAU);
        ctx.stroke();
      }
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
    case 'windup':
      // a wind-up toy mouse, key turning
      ctx.fillStyle = '#9aa3ad';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.85, r * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffb6c1';
      ctx.beginPath();
      ctx.arc(-r * 0.45, -r * 0.45, r * 0.22, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(-r * 0.6, -r * 0.1, r * 0.08, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(r * 0.85, 0);
      ctx.rotate(s.t * 12);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-r * 0.05, -r * 0.35, r * 0.1, r * 0.7);
      ctx.restore();
      break;
    case 'duck':
      ctx.rotate(Math.sin(s.t * 6) * 0.3);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.ellipse(r * 0.1, r * 0.2, r * 0.8, r * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.35, r * 0.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.4);
      ctx.lineTo(-r * 1.05, -r * 0.3);
      ctx.lineTo(-r * 0.7, -r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(-r * 0.4, -r * 0.45, r * 0.07, 0, TAU);
      ctx.fill();
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
    default:
      ctx.restore();
      return false;
  }
  void time;
  ctx.restore();
  return true;
}
