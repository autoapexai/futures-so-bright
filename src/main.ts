import { Game } from './systems/Game';
import { applyHandPreference } from './utils/storage';
import { trackPageView } from './utils/track';

const canvas = document.getElementById('game') as HTMLCanvasElement;
if (!canvas) throw new Error('#game canvas missing');

/** Phones, tablets, and iPad-with-pencil still expose touch points. */
function isTouchPrimary(): boolean {
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  if (window.matchMedia('(hover: none)').matches) return true;
  if (window.matchMedia('(any-pointer: coarse)').matches) return true;
  if (navigator.maxTouchPoints > 0) return true;
  return 'ontouchstart' in window;
}

const touchPrimary = isTouchPrimary();
document.body.classList.toggle('touch-device', touchPrimary);
applyHandPreference();
const standalone =
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches;
document.body.classList.toggle('standalone', standalone);

document.documentElement.style.touchAction = 'none';
document.body.style.touchAction = 'none';
canvas.style.touchAction = 'none';

const touch = document.getElementById('touch-controls');
if (touch && touchPrimary) {
  touch.classList.add('visible');
  touch.setAttribute('aria-hidden', 'false');
}

const chrome = document.getElementById('hud-chrome');
if (chrome) chrome.setAttribute('aria-hidden', 'false');

const pinScroll = (): void => {
  if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
  const vv = window.visualViewport;
  if (vv && (vv.offsetTop !== 0 || vv.pageTop !== 0)) {
    window.scrollTo(0, 0);
  }
};

const syncOrient = (): void => {
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  document.body.classList.toggle('portrait', portrait);
  document.body.classList.toggle('landscape', !portrait);
};
syncOrient();
window.addEventListener('orientationchange', () => {
  // iOS fires before layout settles
  window.setTimeout(syncOrient, 100);
  window.setTimeout(syncOrient, 300);
  window.setTimeout(pinScroll, 50);
  window.setTimeout(pinScroll, 280);
});
window.addEventListener('resize', syncOrient);
window.visualViewport?.addEventListener('resize', syncOrient);

// Keep document scrolled to 0 — Safari can nudge after URL-bar show/hide
window.addEventListener('scroll', pinScroll, { passive: true });
window.visualViewport?.addEventListener('scroll', pinScroll, { passive: true });
window.addEventListener('focus', pinScroll);
document.addEventListener('dblclick', (e) => e.preventDefault());
window.addEventListener('pageshow', pinScroll);

const syncVvh = (): void => {
  const vv = window.visualViewport;
  const h = vv && vv.height > 1 ? vv.height : window.innerHeight || document.documentElement.clientHeight;
  document.documentElement.style.setProperty('--vvh', `${h}px`);
};

// Kill bounce / pinch as early as possible (before Game/Input bind).
const blockNav = (e: Event): void => {
  if (e.cancelable) e.preventDefault();
};
document.addEventListener('touchmove', blockNav, { passive: false, capture: true });
document.addEventListener('gesturestart', blockNav, { passive: false });
document.addEventListener('gesturechange', blockNav, { passive: false });
document.addEventListener('gestureend', blockNav, { passive: false });

syncVvh();
window.addEventListener('resize', syncVvh);
window.addEventListener('pageshow', syncVvh);
window.visualViewport?.addEventListener('resize', syncVvh);
window.visualViewport?.addEventListener('scroll', syncVvh);

const game = new Game(canvas, { touchPrimary });
trackPageView();
game.start();
