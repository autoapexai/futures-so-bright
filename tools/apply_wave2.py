#!/usr/bin/env python3
"""Inject wave-2 languages into src/i18n.ts (assumes wave-1 already present)."""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WAVE2 = [
    ('ru', 'Русский', 'ru', 'FLAG_RU'),
    ('uk', 'Українська', 'uk', 'FLAG_UA'),
    ('ja', '日本語', 'ja', 'FLAG_JP'),
    ('ko', '한국어', 'ko', 'FLAG_KR'),
    ('hi', 'हिन्दी', 'hi', 'FLAG_IN'),
    ('th', 'ไทย', 'th', 'FLAG_TH'),
]

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

# Import flags
imp_m = re.search(r"import \{[^}]+\} from '\./flags';", text)
if not imp_m:
    raise SystemExit('flags import missing')
imps = [x.strip() for x in imp_m.group(0)[imp_m.group(0).index('{')+1:imp_m.group(0).index('}')].split(',') if x.strip()]
for f in ['FLAG_RU','FLAG_UA','FLAG_JP','FLAG_KR','FLAG_IN','FLAG_TH']:
    if f not in imps:
        imps.append(f)
text = text[:imp_m.start()] + "import { " + ', '.join(imps) + " } from './flags';" + text[imp_m.end():]

# Lang type
lang_m = re.search(r"export type Lang = ([^;]+);", text)
if not lang_m:
    raise SystemExit('Lang type missing')
parts = [p.strip().strip("'") for p in lang_m.group(1).split('|')]
for code, *_ in WAVE2:
    if code not in parts:
        parts.append(code)
text = text[:lang_m.start()] + "export type Lang = " + ' | '.join(f"'{p}'" for p in parts) + ';' + text[lang_m.end():]

# LANGS array — append before ];
langs_re = re.compile(
    r"(export const LANGS: \{ id: Lang; name: string; html: string; flag: string \}\[] = \[)(.*?)(\n\];)",
    re.S,
)
m = langs_re.search(text)
if not m:
    raise SystemExit('LANGS not found')
body = m.group(2)
for code, name, html, flag in WAVE2:
    if f"id: '{code}'" not in body:
        body += f"\n  {{ id: '{code}', name: '{name}', html: '{html}', flag: {flag} }},"
text = text[:m.start()] + m.group(1) + body + m.group(3) + text[m.end():]

# detectLang — insert before return 'en'
detect_re = re.compile(r"(export function detectLang\(nav: string\): Lang \{.*?)(  return 'en';\n\})", re.S)
dm = detect_re.search(text)
if not dm:
    raise SystemExit('detectLang missing')
extra_det = """  if (n.startsWith('ru')) return 'ru';
  if (n.startsWith('uk')) return 'uk';
  if (n.startsWith('ja')) return 'ja';
  if (n.startsWith('ko')) return 'ko';
  if (n.startsWith('hi')) return 'hi';
  if (n.startsWith('th')) return 'th';
"""
if "startsWith('ru')" not in dm.group(1):
    text = text[:dm.start()] + dm.group(1) + extra_det + dm.group(2) + text[dm.end():]

# fmtNum — add ru/uk space; hi comma (simple); ja/ko/th comma (default)
fmt_re = re.compile(r"export function fmtNum\(n: number\): string \{.*?\n\}", re.S)
fm = fmt_re.search(text)
if not fm:
    raise SystemExit('fmtNum missing')
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
  if (current === 'fr') return s.replace(/,/g, '\u202f');
  // Space thousands: pl, sv, ru, uk
  if (current === 'pl' || current === 'sv' || current === 'ru' || current === 'uk') return s.replace(/,/g, ' ');
  // Indian grouping (hi): keep simple comma groups (en-US style)
  // Comma thousands (en, zh, fil, ja, ko, th, hi, ar, he): leave as-is
  return s;
}'''
text = text[:fm.start()] + fmt_body + text[fm.end():]

# Insert const blocks before STRINGS export
strings_re = re.compile(r"export const STRINGS: Record<Lang, Record<Key, string>> = \{([^}]+)\};")
sm = strings_re.search(text)
if not sm:
    raise SystemExit('STRINGS export missing')
existing = sm.group(1)
blocks = []
codes_add = []
for code, *_ in WAVE2:
    if f' {code}' in existing or existing.strip().endswith(code) or f', {code}' in existing or existing.startswith(code):
        continue
    data = json.load(open(ROOT / 'tools' / 'langs' / f'{code}.json', encoding='utf-8'))
    # place const before export
    blocks.append(f'const {code}: Record<Key, string> = {{\n{emit_obj(data)}\n}};\n')
    codes_add.append(code)
if blocks:
    # avoid duplicating const if already present
    blocks = [b for b in blocks if f"const {b.split(':')[0].split()[-1]}" not in text[:sm.start()][-5000:] and f"const {codes_add[blocks.index(b)]}" not in text]
    # simpler check:
    real_blocks = []
    real_codes = []
    for code, *_ in WAVE2:
        if f'const {code}:' in text:
            continue
        data = json.load(open(ROOT / 'tools' / 'langs' / f'{code}.json', encoding='utf-8'))
        real_blocks.append(f'const {code}: Record<Key, string> = {{\n{emit_obj(data)}\n}};\n')
        real_codes.append(code)
    new_export_codes = [c.strip() for c in existing.split(',')]
    for c in real_codes:
        if c not in new_export_codes:
            new_export_codes.append(c)
    text = text[:sm.start()] + ''.join(real_blocks) + f"export const STRINGS: Record<Lang, Record<Key, string>> = {{ {', '.join(new_export_codes)} }};" + text[sm.end():]

# PHRASES append
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
for code, *_ in WAVE2:
    if f'\n  {code}:' in old_phrases_block:
        continue
    pdata = json.load(open(ROOT / 'tools' / 'phrases' / f'{code}.json', encoding='utf-8'))
    extra_ph.append(f'  {code}: {{\n{emit_phrases(pdata)}\n  }},')
if extra_ph:
    inserted_ph = old_phrases_block[:-2] + '\n' + '\n'.join(extra_ph) + '\n};'
    text = text[:ph_start] + text[ph_start:].replace(old_phrases_block, inserted_ph, 1)

# GROCERIES append
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
for code, *_ in WAVE2:
    if f'\n  {code}:' in old_g:
        continue
    gdata = json.load(open(ROOT / 'tools' / 'groceries' / f'{code}.json', encoding='utf-8'))
    extra_g.append(f'  {code}: {{\n{emit_groceries(gdata)}\n  }},')
if extra_g:
    inserted_g = old_g[:-2] + '\n' + '\n'.join(extra_g) + '\n};'
    text = text[:g_start] + text[g_start:].replace(old_g, inserted_g, 1)

# localFont fallbacks for wave2 scripts
# Replace CJK / localFont body with extended version
local_fn = re.search(r"const CJK = .*?^export function localFont\(font: string\): string \{.*?\n\}", text, re.S | re.M)
if not local_fn:
    raise SystemExit('localFont block missing')
new_local = r'''const CJK = "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', 'Source Han Sans SC', 'WenQuanYi Micro Hei'";
const VI_FALLBACK = "'Be Vietnam Pro', 'Segoe UI', Roboto, 'Noto Sans', Arial";
const CYR = "'Roboto', 'Segoe UI', Arial, 'Noto Sans', 'DejaVu Sans'";
const JP = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', 'Noto Sans CJK JP'";
const KR = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans CJK KR'";
const DEV = "'Noto Sans Devanagari', 'Kohinoor Devanagari', 'Nirmala UI', 'Mangal', Arial";
const THAI = "'Noto Sans Thai', 'Thonburi', 'Leelawadee UI', 'Tahoma', Arial";
const LATIN = new Set(['en','es','fr','de','pt','it','nl','pl','tr','id','fil','sv']);
const fontCache = new Map<string, string>();
export function localFont(font: string): string {
  if (LATIN.has(current)) return font;
  const k = current + font;
  let f = fontCache.get(k);
  if (f === undefined) {
    f = font;
    if (current === 'vi') f = f.replace(/'Orbitron'/g, "'Exo 2'").replace(/'Rajdhani'/g, "'Chakra Petch'");
    const extra =
      current === 'vi' ? VI_FALLBACK :
      current === 'ru' || current === 'uk' ? CYR :
      current === 'ja' ? JP :
      current === 'ko' ? KR :
      current === 'hi' ? DEV :
      current === 'th' ? THAI :
      CJK; // zh and any future CJK
    f = /,\s*(sans-serif|serif|monospace|cursive|system-ui)\s*$/.test(f)
      ? f.replace(/,\s*(sans-serif|serif|monospace|cursive|system-ui)\s*$/, `, ${extra}, $1`)
      : `${f}, ${extra}`;
    fontCache.set(k, f);
  }
  return f;
}'''
text = text[:local_fn.start()] + new_local + text[local_fn.end():]

# Patch canvas font setter to use LATIN set
text = re.sub(
    r"set\.call\(this, \([^)]+\) \? v : localFont\(v\)\);",
    "set.call(this, LATIN.has(current) ? v : localFont(v));",
    text,
    count=1,
)

i18n_path.write_text(text, encoding='utf-8')
print('i18n.ts wave2 patched; size', i18n_path.stat().st_size)
