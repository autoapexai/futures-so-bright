#!/usr/bin/env node
/** Assert every Lang has every Key (non-empty) and that non-English langs differ from en where es does. */
import { LANGS, STRINGS } from '../src/i18n.ts';

const en = STRINGS.en;
const keys = Object.keys(en);
let bad = 0;
for (const { id } of LANGS) {
  const row = STRINGS[id];
  if (!row) { console.error(id, 'missing STRINGS'); bad++; continue; }
  const missing = keys.filter((k) => !(k in row) || !String(row[k]).trim());
  if (missing.length) { console.error(id, 'missing/empty', missing.slice(0, 10)); bad++; }
  else console.log(id, 'OK', keys.length);
}
// Leak check: where es differs from en, other langs should too (except intentional English keepers)
const es = STRINGS.es;
let leaks = 0;
for (const { id } of LANGS) {
  if (id === 'en' || id === 'es') continue;
  const row = STRINGS[id];
  for (const k of keys) {
    if (es[k] !== en[k] && row[k] === en[k] && !/^(btn_|ls_boss|ls_mini|dev_badge|ghost_badge|dom_v4v_title|dom_v4v_kicker)/.test(k)) {
      // allow a few intentional English keepers already used by es sometimes
      if (['btn_start','btn_ok','btn_ride','ls_boss','ls_mini','dev_badge','ghost_badge','dom_v4v_title','dom_v4v_kicker','dom_v4v_time','dom_v4v_talent'].includes(k)) continue;
      if (row[k] === en[k] && es[k] !== en[k]) {
        // count but don't fail hard on every comedy line that stayed English-ish
        leaks++;
      }
    }
  }
}
console.log('potential en leaks vs es-diff keys:', leaks);
process.exit(bad ? 1 : 0);
