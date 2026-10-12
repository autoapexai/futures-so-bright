/**
 * Tester copy only (built with VITE_TESTER_GC=1 by the tester-gate deploy): one GoatCounter hit per
 * page load once the game has been unlocked, logged under the fixed path '/tester-game' with a blank
 * referrer, so the hidden tester URL is never sent. Normal builds never call this.
 */
const ENDPOINT = 'https://autoapexai.goatcounter.com/count';

export function testerCount(): void {
  const w = window as unknown as { goatcounter?: Record<string, unknown> & { count?: (v: object) => void }; __fsbTesterCounted?: boolean };
  if (w.__fsbTesterCounted) return;
  w.__fsbTesterCounted = true;
  const settings = { path: '/tester-game', title: 'Tester game', referrer: '', no_onload: true, no_events: true };
  w.goatcounter = Object.assign(w.goatcounter ?? {}, settings, { endpoint: ENDPOINT });
  const s = document.createElement('script');
  s.async = true;
  s.referrerPolicy = 'no-referrer';
  s.dataset.goatcounter = ENDPOINT;
  s.dataset.goatcounterSettings = JSON.stringify(settings);
  s.src = 'https://gc.zgo.at/count.js';
  s.onload = () => w.goatcounter?.count?.({ path: '/tester-game', title: 'Tester game', referrer: '', event: false });
  document.head.appendChild(s);
}
