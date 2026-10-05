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
import { fillLangs } from '../utils/fillLangs';
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

/** One-line G-rated blurbs (preview card), by boss id / mini-boss character. */
const BLURB: Record<Lang, Record<string, string>> = fillLangs({
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
  fr: {
    mime: 'Un mime sur un petit tricycle qui copie tes mouvements à l’envers.',
    calvin: 'Deux chevaux de pantomime au long cou en parachute, qui lancent fers et carottes.',
    decoy: 'Un magicien du bonneteau et son double en carton qui échangent leurs places avec un POUF.',
    buckle: 'Sort d’un gâteau avec des boucles qui sautent et des pas de boule disco.',
    daly: 'Un cow-boy en audition qui arrive en lasso, avec des buissons roulants et un poulet en caoutchouc.',
    toosuccessful: 'Un robot trophée doré sur bottes-fusées qui fait pleuvoir pièces et lingots.',
    alw: 'Un lustre diva d’opéra avec un chœur de masques et une note très haute.',
    slackerman: 'Un fantôme de drap dans un fauteuil à la séance de minuit, qui lance du pop-corn.',
    cbb: 'Un clown sur un canon dont les bombes de confettis éclatent en canards en caoutchouc.',
    curry: 'Un VJ des années 80 avec une télé en tête, qui envoie des murs de parasites et des cassettes.',
    dvorak: 'Un chérubin grincheux sur un nuage qui envoie des plumes dans ton dos.',
    itm: 'Un énorme cerveau aux yeux exorbités avec un bonnet à hélice : le boss final du niveau 111.',
    reindeer: 'Un renne réalisateur qui crie COUPEZ ! et lance des clapets.',
    sneezefeld: 'Remarque tout, éternue pour tout, et lance des mouchoirs.',
    divot: 'Un golfeur pointilleux qui envoie des balles et renverse son café.',
    macdoodle: 'Gribouille des mites qui volent droit vers ta meute.',
    lettuceman: 'Un animateur de salade de nuit qui lance des cartes et des crayons.',
    rowdy: 'Le cheerleader le plus bruyant du baseball : balles rapides et casquettes volantes.',
    fryer: 'Un cuisinier express qui fait voler œufs et pancakes vers toi.',
    socks: 'Le roi du linge sale : il pleut chaussettes et vieilles bottes.',
    yogan: 'Un podcasteur de yoga super-étiré avec micros et haltères volants.',
    gigglegan: 'Un grignoteur somnolent qui fait pleuvoir collations et bacon.',
    brooms: 'Un roi farceur avec un balai qui lance couronnes et hauts-de-forme.',
    elder: 'Le renne original, 2 000 ans de jeunesse, qui fait rouler roues et sabliers.',
  },
  de: {
    mime: 'Ein Mime auf einem Mini-Dreirad, der deine Bewegungen kopfüber nachmacht.',
    calvin: 'Zwei dehnbare Pantomime-Pferde an Fallschirmen, die Hufeisen und Karotten werfen.',
    decoy: 'Ein Bechertrick-Zauberer und sein Papp-Doppelgänger, die mit einem PUFF die Plätze tauschen.',
    buckle: 'Platzt aus einem Kuchen mit abspringenden Schnallen und Diskokugel-Moves.',
    daly: 'Ein vorsprechender Cowboy, der an einem Lasso reinswingt, mit Steppenläufern und Gummihuhn.',
    toosuccessful: 'Ein goldener Trophäen-Roboter auf Raketenstiefeln, der Münzen und Goldbarren regnet.',
    alw: 'Ein Opern-Diva-Kronleuchter mit einer Masken-Chor und einer sehr hohen Note.',
    slackerman: 'Ein Bettlaken-Geist im Liegesessel beim Mitternachtsfilm, der Popcorn wirft.',
    cbb: 'Ein Clown auf einer Kanone, deren Konfetti-Bomben zu Gummienten werden.',
    curry: 'Ein 80er-VJ mit TV-Kopf, der Rauschwände und Kassetten abfeuert.',
    dvorak: 'Ein mürrischer Putto auf einer Wolke, der Federn von hinten schickt.',
    itm: 'Ein riesiges Glubschaugen-Hirn mit Propellerkappe: Endboss von Level 111.',
    reindeer: 'Ein Film-Rentier-Regisseur, der SCHNITT! ruft und Filmklappen wirft.',
    sneezefeld: 'Bemerk alles, niest bei allem und wirft Taschentücher.',
    divot: 'Ein wählerischer Golfer, der Bälle chippt und seinen Kaffee verschüttet.',
    macdoodle: 'Kritzelt Motten, die geradewegs auf dein Rudel zu flattern.',
    lettuceman: 'Ein Nacht-Salat-Moderator, der Cue-Karten und Stifte wirft.',
    rowdy: 'Der lauteste Baseball-Cheerleader: Fastballs und fliegende Caps.',
    fryer: 'Ein Kurzkoch, der Eier und Pfannkuchen zu dir flippt.',
    socks: 'Herrscher über den Wäscheberg: es regnet Socken und alte Stiefel.',
    yogan: 'Ein superdehnbarer Yoga-Podcaster mit fliegenden Mikros und Hanteln.',
    gigglegan: 'Ein schläfriger Snacker, der Taschen-Snacks und Speck regnet.',
    brooms: 'Ein alberner König mit Besen, der Kronen und Zylinder wirft.',
    elder: 'Das Original-Rentier, 2000 Jahre jung, das Räder und Sanduhren rollt.',
  },
  pt: {
    mime: 'Um mimo num triciclo minúsculo que copia seus movimentos de cabeça para baixo.',
    calvin: 'Dois cavalos de pantomima de pescoço elástico de paraquedas, jogando ferraduras e cenouras.',
    decoy: 'Um mágico de jogo de copos e seu sósia de papelão que trocam de lugar com um PUF.',
    buckle: 'Sai de um bolo com fivelas estourando e passos de bola disco.',
    daly: 'Um caubói de teste que chega no laço, com tumbleweeds e uma galinha de borracha.',
    toosuccessful: 'Um robô troféu dourado de botas-foguete que chove moedas e barras de ouro.',
    alw: 'Um lustre diva de ópera com um coro de máscaras e uma nota altíssima.',
    slackerman: 'Um fantasma de lençol numa poltrona na sessão da meia-noite, jogando pipoca.',
    cbb: 'Um palhaço num canhão cujas bombas de confete viram patinhos de borracha.',
    curry: 'Um VJ dos anos 80 com TV na cabeça, lançando muros de estática e fitas cassete.',
    dvorak: 'Um querubim rabugento numa nuvem que manda penas pelas suas costas.',
    itm: 'Um cérebro gigante de olhos saltados com chapéu de hélice: o chefão do nível 111.',
    reindeer: 'Uma rena diretora que grita CORTA! e joga claquetes.',
    sneezefeld: 'Repara em tudo, espirra por tudo e joga lenços.',
    divot: 'Um golfista exigente que lança bolas e derrama o café.',
    macdoodle: 'Rabisca mariposas que voam direto para sua matilha.',
    lettuceman: 'Um apresentador noturno de salada que joga cartões e lápis.',
    rowdy: 'O torcedor mais barulhento do beisebol: bolas rápidas e bonés voadores.',
    fryer: 'Um cozinheiro rápido que lança ovos e panquecas na sua direção.',
    socks: 'Rei da pilha de roupa: chovem meias e botas velhas.',
    yogan: 'Um podcaster de ioga superelástico com micros e pesos voadores.',
    gigglegan: 'Um petisqueiro sonolento que chove lanches de bolso e bacon.',
    brooms: 'Um rei engraçado com vassoura que joga coroas e cartolas.',
    elder: 'A rena original, 2.000 anos jovem, rolando rodas e ampulhetas.',
  },
  it: {
    mime: 'Un mimo su un triciclo minuscolo che copia i tuoi movimenti al contrario.',
    calvin: 'Due cavalli di pantomima dal collo elastico col paracadute, che lanciano ferri e carote.',
    decoy: 'Un mago del gioco dei bicchieri e il suo doppio di cartone che si scambiano con un PUF.',
    buckle: 'Esce da una torta con fibbie che saltano e passi da palla disco.',
    daly: 'Un cowboy in audizione che arriva col lazo, con cespugli rotolanti e un pollo di gomma.',
    toosuccessful: 'Un robot trofeo d’oro con stivali razzo che fa piovere monete e lingotti.',
    alw: 'Un lampadario diva d’opera con un coro di maschere e una nota altissima.',
    slackerman: 'Un fantasma di lenzuolo in poltrona al cinema di mezzanotte, che lancia popcorn.',
    cbb: 'Un clown su un cannone le cui bombe di coriandoli diventano paperelle di gomma.',
    curry: 'Un VJ anni ’80 con una TV per testa, che spara muri di statica e musicassette.',
    dvorak: 'Un cherubino scontroso su una nuvola che manda piume alle tue spalle.',
    itm: 'Un cervello gigante dagli occhi sporgenti con cappello a elica: il boss finale del livello 111.',
    reindeer: 'Una renna regista che grida CIACK! e lancia ciak.',
    sneezefeld: 'Nota tutto, starnutisce per tutto e lancia fazzoletti.',
    divot: 'Un golfista pignolo che tira palline e rovescia il caffè.',
    macdoodle: 'Scarabbocchia falene che volano dritte verso il tuo branco.',
    lettuceman: 'Un presentatore notturno di insalate che lancia cartoncini e matite.',
    rowdy: 'Il cheerleader più rumoroso del baseball: palle veloci e cappellini volanti.',
    fryer: 'Un cuoco veloce che ti lancia uova e pancake.',
    socks: 'Il re del bucato: piovono calzini e stivali vecchi.',
    yogan: 'Un podcaster di yoga superelastico con microfoni e pesi volanti.',
    gigglegan: 'Uno spiluzzicatore assonnato che fa piovere snack e bacon.',
    brooms: 'Un re buffo con scopa che lancia corone e cilindri.',
    elder: 'La renna originale, 2000 anni giovane, che fa rotolare ruote e clessidre.',
  },
  nl: {
    mime: 'Een mime op een mini-driewieler die jouw moves ondersteboven kopieert.',
    calvin: 'Twee rekbare pantomimepaarden aan parachutes die hoefijzers en wortels gooien.',
    decoy: 'Een dopjesgoochelaar en zijn kartonnen dubbelganger die met een POEF van plaats wisselen.',
    buckle: 'Barst uit een taart met knallende gespen en discobal-moves.',
    daly: 'Een auditie-cowboy die binnenkomt aan een lasso, met tumbleweeds en een rubberen kip.',
    toosuccessful: 'Een gouden trofee-robot op raketlaarzen die munten en goudstaven regent.',
    alw: 'Een opera-diva-kroonluchter met een koor van maskers en een hele hoge noot.',
    slackerman: 'Een lakenspook in een ligstoel bij de middernachtfilm, die popcorn gooit.',
    cbb: 'Een clown op een kanon wiens confettibommen in rubberen eendjes barsten.',
    curry: 'Een jaren-80-vj met een tv als hoofd, die statische muren en cassettes afvuurt.',
    dvorak: 'Een chagrijnige cherubijn op een wolk die veren vanaf je rug stuurt.',
    itm: 'Een gigantisch glurende hersenen met propellermuts: de eindbaas van level 111.',
    reindeer: 'Een filmregisseur-rendier dat CUT! roept en klappers gooit.',
    sneezefeld: 'Ziet alles, niest om alles en gooit tissues.',
    divot: 'Een kieskeurige golfer die golfballen chipt en zijn koffie mors.',
    macdoodle: 'Krabbelen motten die recht op jouw roedel afladderen.',
    lettuceman: 'Een late-night salade-host die cuekaarten en potloden gooit.',
    rowdy: 'De luidste honkbal-cheerleader: fastballs en vliegende petten.',
    fryer: 'Een snelle kok die eieren en pannenkoeken jouw kant op gooit.',
    socks: 'Heerser van de wasberg: het regent sokken en oude laarzen.',
    yogan: 'Een superrekbare yoga-podcaster met vliegende mics en gewichten.',
    gigglegan: 'Een slaperige snacker die zak-snacks en spek regent.',
    brooms: 'Een malle koning met een bezem die kronen en hoge hoeden gooit.',
    elder: 'Het originele rendier, 2000 jaar jong, dat wielen en zandlopers rol.',
  },
  pl: {
    mime: 'Mim na malutkim rowerku, który kopiuje twoje ruchy do góry nogami.',
    calvin: 'Dwa rozciągliwe konie pantomimy na spadochronach, rzucające podkowami i marchewkami.',
    decoy: 'Magik od skorupek i jego tekturowy sobowtór, którzy zamieniają się miejscami z PUF.',
    buckle: 'Wybucha z tortu z odlatującymi klamrami i ruchami kuli disco.',
    daly: 'Kowboj na przesłuchaniu, który wlatuje na lasso, z tumbleweedami i gumowym kurczakiem.',
    toosuccessful: 'Złoty robot-puchar na rakietowych butach, który zrzuca monety i sztabki złota.',
    alw: 'Żyrandol-diva operowa z chórem masek i bardzo wysoką nutą.',
    slackerman: 'Duch z prześcieradła w fotelu na seansie o północy, rzucający popcornem.',
    cbb: 'Klaun na armacie, której bomby konfetti pękają w gumowe kaczki.',
    curry: 'VJ lat 80. z telewizorem zamiast głowy, strzelający ścianami szumu i kasetami.',
    dvorak: 'Marudny cherubin na chmurze, który zrzuca pióra zza twoich pleców.',
    itm: 'Gigantyczny mózg z wyłupiastymi oczami w czapce ze śmigłem: boss finałowy poziomu 111.',
    reindeer: 'Renifer-reżyser, który krzyczy CIĘCIE! i rzuca klapsami.',
    sneezefeld: 'Zauważa wszystko, kicha na wszystko i rzuca chusteczkami.',
    divot: 'Wybredny golfista, który odbija piłki i rozlewa kawę.',
    macdoodle: 'Bazgroli ćmy, które lecą prosto na twoje stado.',
    lettuceman: 'Nocny prowadzący o sałatkach, który rzuca kartkami i ołówkami.',
    rowdy: 'Najgłośniejszy cheerleader baseballu: szybkie piłki i latające czapki.',
    fryer: 'Szybki kucharz, który rzuca jajkami i naleśnikami w twoją stronę.',
    socks: 'Władca prania: deszcz skarpetek i starych butów.',
    yogan: 'Superelastyczny podcaster jogi z latającymi mikami i hantlami.',
    gigglegan: 'Śpiący przekąskowicz, który zrzuca kieszonkowe przekąski i bekon.',
    brooms: 'Zabawny król z miotłą, który rzuca koronami i cylindrami.',
    elder: 'Oryginalny renifer, 2000 lat młodości, toczący koła i klepsydry.',
  },
  tr: {
    mime: 'Hareketlerini ters çevirerek kopyalayan minik üç tekerlekli bisikletli bir mim.',
    calvin: 'Paraşütlü iki esnek boyunlu pantomim atı; nal ve havuç fırlatır.',
    decoy: 'Bardak oyunu sihirbazı ve karton ikizi, PUFF ile yer değiştirir.',
    buckle: 'Tokaları patlayan ve disk topu adımlarıyla pastadan fırlar.',
    daly: 'Denemeye gelen kovboy; kementle sallanır, savrulan çalılar ve kauçuk tavukla.',
    toosuccessful: 'Roket botlu altın kupa robotu; bozuk para ve külçe yağdırır.',
    alw: 'Maske korolu opera divası avize; çok yüksek bir nota.',
    slackerman: 'Gece yarısı filmde koltukta çarşaf hayalet; patlamış mısır atar.',
    cbb: 'Top üzerindeki palyaço; konfeti bombaları kauçuk ördeğe dönüşür.',
    curry: 'Kafası TV olan 80’ler VJ’si; parazit duvarları ve kasetler yollar.',
    dvorak: 'Buluttaki huysuz melek; arkandan tüy yollar.',
    itm: 'Pervaneli şapkalı kocaman gözlü beyin: 111. seviyenin final boss’u.',
    reindeer: 'CUT! diye bağıran film yönetmeni ren geyiği; klaket fırlatır.',
    sneezefeld: 'Her şeyi fark eder, her şeye hapşırır, mendil atar.',
    divot: 'Titiz golfçü; topları yollar ve kahvesini döker.',
    macdoodle: 'Sürüne doğru uçan güveler çizer.',
    lettuceman: 'Gece salata sunucusu; kart ve kalem fırlatır.',
    rowdy: 'Beyzbolun en gürültülü cheerleader’ı: hızlı toplar ve uçan şapkalar.',
    fryer: 'Hızlı aşçı; yumurta ve pankek fırlatır.',
    socks: 'Çamaşır yığınının hükümdarı: çorap ve eski bot yağmuru.',
    yogan: 'Süper esnek yoga podcaster’ı; uçan mikrofon ve dambıllar.',
    gigglegan: 'Uykulu atıştırmacı; cep atıştırmalıkları ve pastırma yağdırır.',
    brooms: 'Süpürgeli komik kral; taç ve silindir şapka atar.',
    elder: 'Orijinal ren geyiği, 2000 yaşında genç; tekerlek ve kum saati yuvarlar.',
  },
  id: {
    mime: 'Mime di sepeda roda tiga mungil yang meniru gerakmu terbalik.',
    calvin: 'Dua kuda pantomim berleher elastis bertandu parasut, melempar ladam dan wortel.',
    decoy: 'Pesulap permainan cangkir dan kembarannya dari kardus yang bertukar tempat dengan PUF.',
    buckle: 'Meledak dari kue dengan gesper yang meletus dan langkah bola disko.',
    daly: 'Koboi audisi yang masuk dengan lasso, bersama semak bergulir dan ayam karet.',
    toosuccessful: 'Robot piala emas bersepatu roket yang menurunkan hujan koin dan batangan emas.',
    alw: 'Lampu gantung diva opera dengan paduan suara topeng dan nada sangat tinggi.',
    slackerman: 'Hantu seprai di kursi malas di bioskop tengah malam, melempar popcorn.',
    cbb: 'Badut di meriam yang bom konfetinya meledak jadi bebek karet.',
    curry: 'VJ 80-an berkepala TV, menembakkan dinding statis dan kaset.',
    dvorak: 'Kerub pemarah di awan yang mengirim bulu dari belakangmu.',
    itm: 'Otak raksasa bermata melotot bertopi baling-baling: bos akhir level 111.',
    reindeer: 'Rusa kutub sutradara yang berteriak CUT! dan melempar klaketik.',
    sneezefeld: 'Memperhatikan segalanya, bersin karena segalanya, dan melempar tisu.',
    divot: 'Pemain golf cerewet yang memukul bola dan menumpahkan kopi.',
    macdoodle: 'Menggambar ngengat yang terbang lurus ke kawananmu.',
    lettuceman: 'Pembawa acara salad malam yang melempar kartu dan pensil.',
    rowdy: 'Cheerleader bisbol paling bising: bola cepat dan topi terbang.',
    fryer: 'Koki cepat yang melempar telur dan panekuk ke arahmu.',
    socks: 'Raja tumpukan cucian: hujan kaos kaki dan sepatu boot tua.',
    yogan: 'Podcaster yoga superelastis dengan mikrofon dan barbel terbang.',
    gigglegan: 'Perokok camilan mengantuk yang menurunkan camilan saku dan bacon.',
    brooms: 'Raja konyol dengan sapu yang melempar mahkota dan topi tinggi.',
    elder: 'Rusa kutub asli, 2.000 tahun muda, menggelindingkan roda dan jam pasir.',
  },
  fil: {
    mime: 'Isang mime sa maliit na traysikel na kinokopya ang galaw mo nang baligtad.',
    calvin: 'Dalawang stretchy-neck na pantomime horse sa parachute, naghahagis ng horseshoe at carrot.',
    decoy: 'Isang shell-game magician at cardboard double na nagpapalit ng lugar nang may POOF.',
    buckle: 'Sumabog mula sa cake na may tilting buckle at disco-ball moves.',
    daly: 'Isang auditioning cowboy na dumadating sa lasso, may tumbleweed at rubber chicken.',
    toosuccessful: 'Isang gold trophy robot sa rocket boots na umuulan ng barya at gold bar.',
    alw: 'Isang opera-diva chandelier na may chorus ng mask at napakataas na nota.',
    slackerman: 'Isang bedsheet ghost sa recliner sa midnight movie, naghahagis ng popcorn.',
    cbb: 'Isang clown sa kanyon na ang confetti bombs ay nagiging rubber duck.',
    curry: 'Isang 80s VJ na TV ang ulo, nagpapaputok ng static wall at cassette.',
    dvorak: 'Isang grumpy cherub sa ulap na nagsusuyo ng balahibo mula sa likod mo.',
    itm: 'Isang higanteng googly-eyed brain na may propeller cap: final boss ng level 111.',
    reindeer: 'Isang movie-directing reindeer na sumisigaw ng CUT! at naghahagis ng clapperboard.',
    sneezefeld: 'Napapansin ang lahat, bumabahing sa lahat, at naghahagis ng tissue.',
    divot: 'Isang maselan na golfer na nagchi-chip ng bola at natatapon ang kape.',
    macdoodle: 'Nagdo-doodle ng moth na lumilipad diretso sa kawan mo.',
    lettuceman: 'Isang late-night salad host na naghahagis ng cue card at lapis.',
    rowdy: 'Ang pinakamaingay na baseball cheerleader: mabilis na bola at lumilipad na cap.',
    fryer: 'Isang mabilis na cook na naghahagis ng itlog at pancake palapit sa’yo.',
    socks: 'Hari ng laundry pile: umuulan ng medyas at lumang bota.',
    yogan: 'Isang super-stretchy yoga podcaster na may lumilipad na mic at dumbbell.',
    gigglegan: 'Isang antok na snacker na umuulan ng pocket snack at bacon.',
    brooms: 'Isang katawa-tawang hari na may walis na naghahagis ng korona at top hat.',
    elder: 'Ang orihinal na reindeer, 2,000 taong bata, nagpapagulong ng gulong at hourglass.',
  },
  sv: {
    mime: 'En mim på en mini-trehjuling som kopierar dina rörelser uppochner.',
    calvin: 'Två töjbara pantomimhästar i fallskärm som kastar hästskor och morötter.',
    decoy: 'En skalspelsmagiker och hans kartongdubbelgångare som byter plats med en PUFF.',
    buckle: 'Spricker ut ur en tårta med knäppande spännen och diskoklotsrörelser.',
    daly: 'En auditionerande cowboy som svingar in på lasso, med tumbleweeds och en gummikyckling.',
    toosuccessful: 'En guldtroférobot på raketstövlar som regnar mynt och guldtackor.',
    alw: 'En operadivakrona med maskkör och en mycket hög ton.',
    slackerman: 'Ett lakan-spöke i en vilstol på midnattsfilmen som kastar popcorn.',
    cbb: 'En clown på en kanon vars konfettibomber blir gummiankor.',
    curry: 'En 80-tals-VJ med TV till huvud som skjuter brusväggar och kassetter.',
    dvorak: 'En sur mulen putti på ett moln som skickar fjädrar bakifrån.',
    itm: 'En jättehjärna med stirrögon och propellerkeps: slutbossen på nivå 111.',
    reindeer: 'En filmregisserande ren som ropar KLIPP! och kastar klaffor.',
    sneezefeld: 'Lägger märke till allt, nyser åt allt och kastar näsdukar.',
    divot: 'En petig golfare som chippar bollar och spiller sitt kaffe.',
    macdoodle: 'Klottrar nattfjärilar som fladdrar rakt mot din flock.',
    lettuceman: 'En nattlig salladsprogramledare som kastar cue-kort och pennor.',
    rowdy: 'Basebollens högljuddaste cheerleader: snabba bollar och flygande kepsar.',
    fryer: 'En snabbkock som flippar ägg och pannkakor mot dig.',
    socks: 'Härskare över tvättberget: det regnar sockor och gamla stövlar.',
    yogan: 'En superfjädrande yoga-poddare med flygande mickar och hantlar.',
    gigglegan: 'En sömnig snacksare som regnar ficksnacks och bacon.',
    brooms: 'En knasig kung med kvast som kastar kronor och cylinderhattar.',
    elder: 'Originalrenen, 2000 år ung, som rullar hjul och timglas.',
  },
});

function designOf(n: number): string {
  return miniDesignForLevel(n) ?? '';
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
    if (live) out = { n, kind: 'mini', def: live, name: live.name, key: `m-${design}`, design };
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
  let openedAt = 0;
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
      tile.querySelector('.ls-tname')!.textContent = i.kind === 'soon' ? tr('ls_soon_tile') : nameOf(i);
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
    // The tap that opened the picker can land a ghost click on whatever is now under the finger.
    root.addEventListener(
      'click',
      (e) => {
        if (performance.now() - openedAt < 450) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      true,
    );
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
    openedAt = performance.now();
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
