#!/usr/bin/env python3
"""Usage: emit_lang.py <lang> <partial.json> — merges partial over en order, validates, writes tools/langs/<lang>.json"""
import json, re, sys
from pathlib import Path
root = Path(__file__).resolve().parent
en = json.load(open(root/'en.json'))
lang, partial_path = sys.argv[1], sys.argv[2]
partial = json.load(open(partial_path))
missing = sorted(set(en)-set(partial))
if missing:
    print('MISSING', len(missing), missing[:40])
    sys.exit(1)
ph=re.compile(r'\{(\w+)\}')
bad=[k for k in en if set(ph.findall(en[k]))!=set(ph.findall(partial[k]))]
empty=[k for k in en if not str(partial[k]).strip()]
if bad or empty:
    print('BADPH', bad, 'EMPTY', empty)
    sys.exit(1)
ordered={k:partial[k] for k in en}
json.dump(ordered, open(root/'langs'/f'{lang}.json','w'), ensure_ascii=False, indent=2)
print(lang, 'OK', len(ordered))
