# Future’s So Bright

A slick synthwave endless runner.

Dodge blinding light beams, solar flares, and neon bars while collecting spare sunglasses to keep your **Shade Charge** from washing out.

**Mobile-first** for Safari on iPhone / iPad (tuned for **iPhone 14 Pro Max** + iPad). **Portrait is primary** on phones; landscape still works. Touch controls are primary; keyboard is secondary.

## Run

```bash
cd futures-so-bright
npm install
npm run dev
```

Then open the URL Vite prints. For a **phone**, serve the production build over **public HTTPS** (Safari will not treat a laptop `localhost` as the phone).

Production build (preview binds **0.0.0.0:4173** so a later HTTPS tunnel can reach it):

```bash
npm run build
npm run preview
```

## Play

- **Move:** Virtual thumb stick (touch, while playing) · WASD / arrows (keyboard)
- **Boost:** BOOST button · Space — extra speed and score, drains charge faster
- **Mute:** Speaker button · M
- **Pause:** ⏸ button (touch, while playing) · P / Esc (keyboard)
- **Start / restart:** Tap anywhere, large START / RIDE thumb button, Enter, or Space

Score is distance plus collectibles. High score is saved in `localStorage`.

Low charge floods the screen with glare; empty charge ends the run. Game over riff: *Too bright! Shoulda worn shades…*

## Mobile notes

- `viewport-fit=cover` + live `env(safe-area-inset-*)` (CSS) and `#safe-probe` (JS) so notch / Dynamic Island / home indicator update on rotate
- Full-viewport lock (`position: fixed`, `touch-action: none`, `overflow: hidden`, overscroll blocked, `--vvh` from `visualViewport`) to avoid rubber-band / pinch-zoom fighting the game
- `#app` pinned to `visualViewport` via transform; canvas sized in CSS px to fill it (no 16:9 letterbox). CSS `(any-pointer: coarse)` fills on first paint before JS, including iPad + Magic Keyboard
- Stick / BOOST sizes use `%` of the pinned app (not `vh`/`vw`, which include Safari URL-bar chrome)
- Large dynamic thumb stick (window-level pointer tracking; recenters under finger) + circular BOOST / START / RIDE with expanded hit slop; pause/mute clear of the island
- Stick hidden on title / game over so one-handed START / RIDE is the focus; menus keep copy above the control band
- Canvas title / game-over / HUD copy auto-fits narrow widths; landscape menus use compact lines so START/RIDE stays clear
- HUD, spawn lane, and craft all respect safe-area + thumb reserves (hazards spawn in the reachable band)
- World aspect locked per orientation (Safari URL-bar jitter does not rebuild the city every frame)
- Canvas DPR capped on touch (≈1.15 phone / 1.25–1.35 iPad); buffer realloc is hysteresis-deferred so URL-bar animation does not wipe the canvas every frame
- Lite path skips scanlines, shadowBlur, per-frame obstacle gradients, vignette radials; half-res baked sky; particles are pooled
- If Safari misses ~60fps, the perspective grid drops automatically; playing requests Screen Wake Lock (Safari 16.4+)
- Web Audio unlocks on first tap (`pointerdown` / `pointerup` / `touchstart` / `touchend` / `click`) via AudioContext + silent `playsInline` HTMLAudio; re-resumes after Safari suspends
- Mute / pause fire on `pointerup` (Safari sometimes drops `click` after `preventDefault`)
- Switching apps auto-pauses; Add to Home Screen supported (`apple-mobile-web-app-capable`, theme-color, icons, web manifest)

## Stack

Vite + TypeScript + Canvas 2D. Web Audio for procedural SFX and a looping bass bed (unlocked on first tap).

## Remaining limits / Safari caveats

- Landscape phones have less vertical play space; controls stay usable but denser
- iOS may still mute briefly after a long background until the next tap
- Best on iPhone / iPad Safari; desktop keyboard still works but chrome is phone-oriented
- Simultaneous stick + BOOST needs two thumbs (standard twin-thumb layout)
- iOS 10+ can ignore `user-scalable=no` for accessibility; pinch is also blocked via `touch-action: none` + `gesture*` `preventDefault`
- Left-edge swipe-back can still steal a stick drag; the stick zone is padded in from the left
- Silent Switch: HTMLAudio keeps the media session alive, but a first tap is still required to unlock Web Audio
- Screen Wake Lock needs Safari 16.4+ and may be denied without a prior tap
