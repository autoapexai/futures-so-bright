#!/usr/bin/env python3
"""Assert every language JSON has every en key, non-empty, and placeholders match."""
import json, re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent
en = json.load(open(root/'en.json'))
ph = re.compile(r'\{(\w+)\}')
ok = True
for path in sorted((root/'langs').glob('*.json')):
    lang = json.load(open(path))
    missing = sorted(set(en)-set(lang))
    extra = sorted(set(lang)-set(en))
    empty = sorted(k for k,v in lang.items() if not str(v).strip())
    badph = []
    for k,v in lang.items():
        if k not in en: continue
        if set(ph.findall(en[k])) != set(ph.findall(v)):
            badph.append(k)
    if missing or extra or empty or badph:
        ok = False
        print(path.name, 'MISSING', missing, 'EXTRA', extra, 'EMPTY', empty, 'BADPH', badph[:20])
    else:
        print(path.name, 'OK', len(lang))
sys.exit(0 if ok else 1)
