import re
# tut1_a* : hazards send a pet home to Earth (no "cost/lose" wording).
D = {
'en': ('Beams, flares and neon bars send a dog home to Earth', 'Beams, flares and neon bars send a cat home to Earth', 'Beams, flares and neon bars send a pet home to Earth'),
'es': ('Rayos, destellos y neones mandan un perro a casa, a la Tierra', 'Rayos, destellos y neones mandan un gato a casa, a la Tierra', 'Rayos, destellos y neones mandan una mascota a casa, a la Tierra'),
'vi': ('Tia sáng, pháo sáng, đèn neon: một chú chó bay về Trái Đất', 'Tia sáng, pháo sáng, đèn neon: một chú mèo bay về Trái Đất', 'Tia sáng, pháo sáng, đèn neon: một thú cưng bay về Trái Đất'),
'zh': ('光束、闪光和霓虹灯条会让一只狗飞回地球', '光束、闪光和霓虹灯条会让一只猫飞回地球', '光束、闪光和霓虹灯条会让一只宠物飞回地球'),
'fr': ('Rayons, fusées et barres néon renvoient un chien sur Terre', 'Rayons, fusées et barres néon renvoient un chat sur Terre', 'Rayons, fusées et barres néon renvoient un animal sur Terre'),
'de': ('Strahlen, Flares und Neon schicken einen Hund heim zur Erde', 'Strahlen, Flares und Neon schicken eine Katze heim zur Erde', 'Strahlen, Flares und Neon schicken ein Tier heim zur Erde'),
'pt': ('Raios, flares e barras neon mandam um cão de volta à Terra', 'Raios, flares e barras neon mandam um gato de volta à Terra', 'Raios, flares e barras neon mandam um pet de volta à Terra'),
'it': ('Raggi, flare e barre neon rimandano un cane sulla Terra', 'Raggi, flare e barre neon rimandano un gatto sulla Terra', 'Raggi, flare e barre neon rimandano un animale sulla Terra'),
'nl': ('Stralen, flares en neon sturen een hond terug naar de Aarde', 'Stralen, flares en neon sturen een kat terug naar de Aarde', 'Stralen, flares en neon sturen een huisdier terug naar de Aarde'),
'pl': ('Promienie, flary i neon odsyłają psa na Ziemię', 'Promienie, flary i neon odsyłają kota na Ziemię', 'Promienie, flary i neon odsyłają zwierzaka na Ziemię'),
'tr': ('Işınlar, flare’ler ve neon bir köpeği Dünyaya geri yollar', 'Işınlar, flare’ler ve neon bir kediyi Dünyaya geri yollar', 'Işınlar, flare’ler ve neon bir dostu Dünyaya geri yollar'),
'id': ('Sinar, flare, dan batang neon memulangkan seekor anjing ke Bumi', 'Sinar, flare, dan batang neon memulangkan seekor kucing ke Bumi', 'Sinar, flare, dan batang neon memulangkan seekor hewan ke Bumi'),
'fil': ('Ang beam, flare, at neon bar ay nagpapauwi ng aso sa Earth', 'Ang beam, flare, at neon bar ay nagpapauwi ng pusa sa Earth', 'Ang beam, flare, at neon bar ay nagpapauwi ng alaga sa Earth'),
'sv': ('Strålar, flares och neon skickar hem en hund till Jorden', 'Strålar, flares och neon skickar hem en katt till Jorden', 'Strålar, flares och neon skickar hem ett husdjur till Jorden'),
'ru': ('Лучи, вспышки и неон отправляют пса домой на Землю', 'Лучи, вспышки и неон отправляют кота домой на Землю', 'Лучи, вспышки и неон отправляют питомца домой на Землю'),
'uk': ('Промені, спалахи і неон відправляють пса додому на Землю', 'Промені, спалахи і неон відправляють кота додому на Землю', 'Промені, спалахи і неон відправляють улюбленця додому на Землю'),
'ja': ('ビームやフレアやネオンに当たると犬が地球に帰る', 'ビームやフレアやネオンに当たると猫が地球に帰る', 'ビームやフレアやネオンに当たるとペットが地球に帰る'),
'ko': ('빔·플레어·네온에 맞으면 강아지가 지구로 돌아가요', '빔·플레어·네온에 맞으면 고양이가 지구로 돌아가요', '빔·플레어·네온에 맞으면 반려동물이 지구로 돌아가요'),
'hi': ('बीम, फ्लेयर और नियॉन से एक कुत्ता धरती लौट जाता है', 'बीम, फ्लेयर और नियॉन से एक बिल्ली धरती लौट जाती है', 'बीम, फ्लेयर और नियॉन से एक पालतू धरती लौट जाता है'),
'th': ('ลำแสง แฟลร์ และนีออนส่งน้องหมากลับโลก', 'ลำแสง แฟลร์ และนีออนส่งน้องแมวกลับโลก', 'ลำแสง แฟลร์ และนีออนส่งสัตว์เลี้ยงกลับโลก'),
}
p = '/workspace/cat-mode/src/i18n.ts'
L = open(p, encoding='utf-8').read().split('\n')
starts = {}
for i, l in enumerate(L):
    m = re.match(r'^const (\w+)(?:: Record<Key, string>)? = \{$', l)
    if m: starts[m.group(1)] = i
q = lambda v: "'" + v.replace('\\', '\\\\').replace("'", "\\'") + "'"
miss = []
for lang, (a, c, t) in D.items():
    i0 = starts[lang]; i1 = i0 + 1
    while L[i1] != '};': i1 += 1
    for k, v in (('tut1_a', a), ('tut1_a_cats', c), ('tut1_a_together', t)):
        for j in range(i0, i1):
            if L[j].startswith(f'  {k}: '):
                L[j] = f'  {k}: {q(v)},'; break
        else: miss.append((lang, k))
open(p, 'w', encoding='utf-8').write('\n'.join(L))
print('missing', miss)
