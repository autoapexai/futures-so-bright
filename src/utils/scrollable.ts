/**
 * True when a touch starts inside a panel that can actually scroll (MODES card, SETTINGS card,
 * boards, level select grid...). The document blocks touchmove to stop page bounce / pinch, which
 * also froze these panels on phones; touch moves inside them are let through so they scroll.
 */
export function inScrollable(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}
