/**
 * Build a complete Record<Lang, T> from a partial map. Missing languages use `en`
 * so adding a Lang never crashes; prefer filling every language so nothing reads English by surprise.
 */
import { LANGS, type Lang } from '../i18n';

export function fillLangs<T>(table: Partial<Record<Lang, T>> & { en: T }): Record<Lang, T> {
  const out = { ...table } as Record<Lang, T>;
  for (const { id } of LANGS) {
    if (out[id] === undefined) out[id] = table.en;
  }
  return out;
}
