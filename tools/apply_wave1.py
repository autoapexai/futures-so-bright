#!/usr/bin/env python3
"""Inject wave-1 languages into src/i18n.ts from tools/langs|phrases|groceries JSON."""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WAVE1 = [
    ('fr', 'Français', 'fr'),
    ('de', 'Deutsch', 'de'),
    ('pt', 'Português', 'pt'),
    ('it', 'Italiano', 'it'),
    ('nl', 'Nederlands', 'nl'),
    ('pl', 'Polski', 'pl'),
    ('tr', 'Türkçe', 'tr'),
    ('id', 'Bahasa Indonesia', 'id'),
    ('fil', 'Filipino', 'fil'),
    ('sv', 'Svenska', 'sv'),
]
FLAG_IMPORT = {
    'fr': 'FLAG_FR', 'de': 'FLAG_DE', 'pt': 'FLAG_BR', 'it': 'FLAG_IT', 'nl': 'FLAG_NL',
    'pl': 'FLAG_PL', 'tr': 'FLAG_TR', 'id': 'FLAG_ID', 'fil': 'FLAG_PH', 'sv': 'FLAG_SE',
}

def esc(s: str) -> str:
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n') + "'"

def emit_obj(d: dict, indent=2) -> str:
    sp = ' ' * indent
    return '\n'.join(f'{sp}{k}: {esc(v)},' for k, v in d.items())

def emit_phrases(d: dict, indent=4) -> str:
    sp = ' ' * indent
    return '\n'.join(f'{sp}{esc(k)}: {esc(v)},' for k, v in d.items())

def emit_groceries(d: dict, indent=4) -> str:
    sp = ' ' * indent
    lines = []
    for mode, items in d.items():
        arr = ', '.join(esc(x) for x in items)
        lines.append(f'{sp}{mode}: [{arr}],')
    return '\n'.join(lines)

i18n_path = ROOT / 'src' / 'i18n.ts'
text = i18n_path.read_text(encoding='utf-8')

old_imp = "import { FLAG_CN, FLAG_MX, FLAG_US, FLAG_VN } from './flags';"
new_flags = ['FLAG_US', 'FLAG_MX', 'FLAG_VN', 'FLAG_CN'] + [FLAG_IMPORT[c] for c, _, __ in WAVE1]
new_imp = "import { " + ', '.join(new_flags) + " } from './flags';"
if old_imp not in text:
    raise SystemExit('import line missing')
text = text.replace(old_imp, new_imp)

old_lang = "export type Lang = 'en' | 'es' | 'vi' | 'zh';"
new_lang = "export type Lang = 'en' | 'es' | 'vi' | 'zh' | " + ' | '.join(f"'{c}'" for c, _, __ in WAVE1) + ';'
text = text.replace(old_lang, new_lang)

langs_re = re.compile(
    r'export const LANGS: \{ id: Lang; name: string; html: string; flag: string \}\[] = \[(.*?)\];',
    re.S,
)
m = langs_re.search(text)
if not m:
    raise SystemExit('LANGS not found')
lang_rows = [
    "  { id: 'en', name: 'English', html: 'en', flag: FLAG_US },",
    "  { id: 'es', name: 'Español', html: 'es', flag: FLAG_MX },",
    "  { id: 'vi', name: 'Tiếng Việt', html: 'vi', flag: FLAG_VN },",
    "  { id: 'zh', name: '简体中文', html: 'zh-Hans', flag: FLAG_CN },",
]
for code, name, html in WAVE1:
    lang_rows.append(
        f"  {{ id: '{code}', name: '{name}', html: '{html}', flag: {FLAG_IMPORT[code]} }},"
    )
new_langs = (
    "export const LANGS: { id: Lang; name: string; html: string; flag: string }[] = [\n"
    + '\n'.join(lang_rows)
    + "\n];"
)
text = langs_re.sub(new_langs, text, count=1)

detect_re = re.compile(r'export function detectLang\(nav: string\): Lang \{.*?\n\}', re.S)
detect_body = r'''export function detectLang(nav: string): Lang {
  const n = nav.toLowerCase();
  // Longer / special prefixes first.
  if (n.startsWith('zh')) return 'zh';
  if (n.startsWith('fil') || n.startsWith('tl')) return 'fil';
  if (n.startsWith('pt')) return 'pt';
  if (n.startsWith('es')) return 'es';
  if (n.startsWith('vi')) return 'vi';
  if (n.startsWith('fr')) return 'fr';
  if (n.startsWith('de')) return 'de';
  if (n.startsWith('it')) return 'it';
  if (n.startsWith('nl')) return 'nl';
  if (n.startsWith('pl')) return 'pl';
  if (n.startsWith('tr')) return 'tr';
  if (n.startsWith('id') || n.startsWith('in')) return 'id';
  if (n.startsWith('sv')) return 'sv';
  return 'en';
}'''
text = detect_re.sub(lambda _m: detect_body, text, count=1)

fmt_re = re.compile(r'export function fmtNum\(n: number\): string \{.*?\n\}', re.S)
fmt_body = r'''export function fmtNum(n: number): string {
  const s = Math.floor(n).toLocaleString('en-US'); // never scientific notation
  // Dot thousands: es, vi, de, nl, it, pt, id, tr
  if (
    current === 'es' ||
    current === 'vi' ||
    current === 'de' ||
    current === 'nl' ||
    current === 'it' ||
    current === 'pt' ||
    current === 'id' ||
    current === 'tr'
  ) {
    return s.replace(/,/g, '.');
  }
  // Narrow no-break space (U+202F): fr
  if (current === 'fr') return s.replace(/,/g, '\u202f');  // narrow no-break space
  // Space thousands: pl, sv
  if (current === 'pl' || current === 'sv') return s.replace(/,/g, ' ');
  // Comma thousands (en, zh, fil): leave as-is
  return s;
}'''
text = fmt_re.sub(lambda _m: fmt_body, text, count=1)

strings_marker = 'export const STRINGS: Record<Lang, Record<Key, string>> = { en, es, vi, zh };'
if strings_marker not in text:
    raise SystemExit('STRINGS marker missing')

blocks = []
for code, _name, _html in WAVE1:
    data = json.load(open(ROOT / 'tools' / 'langs' / f'{code}.json', encoding='utf-8'))
    blocks.append(f'const {code}: Record<Key, string> = {{\n{emit_obj(data)}\n}};\n')
insert = '\n'.join(blocks)
codes = ', '.join(c for c, _, __ in WAVE1)
text = text.replace(
    strings_marker,
    insert + f'export const STRINGS: Record<Lang, Record<Key, string>> = {{ en, es, vi, zh, {codes} }};',
)

ph_start = text.index('const PHRASES:')
ph_m = re.search(
    r"const PHRASES: Record<Exclude<Lang, 'en'>, Record<string, string>> = \{(.*?)\n\};",
    text[ph_start:],
    re.S,
)
if not ph_m:
    raise SystemExit('PHRASES not found')
old_phrases_block = ph_m.group(0)
extra_ph = []
for code, _n, _h in WAVE1:
    pdata = json.load(open(ROOT / 'tools' / 'phrases' / f'{code}.json', encoding='utf-8'))
    extra_ph.append(f'  {code}: {{\n{emit_phrases(pdata)}\n  }},')
inserted_ph = old_phrases_block[:-2] + '\n' + '\n'.join(extra_ph) + '\n};'
text = text[:ph_start] + text[ph_start:].replace(old_phrases_block, inserted_ph, 1)

g_start = text.index('export const GROCERIES_I18N:')
g_m = re.search(
    r"export const GROCERIES_I18N: Record<Exclude<Lang, 'en'>, Record<string, string\[]>> = \{(.*?)\n\};",
    text[g_start:],
    re.S,
)
if not g_m:
    raise SystemExit('GROCERIES not found')
old_g = g_m.group(0)
extra_g = []
for code, _n, _h in WAVE1:
    gdata = json.load(open(ROOT / 'tools' / 'groceries' / f'{code}.json', encoding='utf-8'))
    extra_g.append(f'  {code}: {{\n{emit_groceries(gdata)}\n  }},')
inserted_g = old_g[:-2] + '\n' + '\n'.join(extra_g) + '\n};'
text = text[:g_start] + text[g_start:].replace(old_g, inserted_g, 1)

latin_codes = ['en', 'es'] + [c for c, _, __ in WAVE1]
latin = ' || '.join(f"current === '{c}'" for c in latin_codes)
text = text.replace(
    "if (current === 'en' || current === 'es') return font;",
    f'if ({latin}) return font;',
)
text = text.replace(
    "set.call(this, current === 'en' || current === 'es' ? v : localFont(v));",
    f'set.call(this, ({latin}) ? v : localFont(v));',
)

text = text.replace(
    'Player-facing strings (English, Spanish, Vietnamese, Simplified Chinese) and the language preference.',
    'Player-facing strings (many languages) and the language preference.',
)

i18n_path.write_text(text, encoding='utf-8')
print('i18n.ts patched; size', i18n_path.stat().st_size)
