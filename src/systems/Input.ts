import { clamp } from '../utils/math';

export class Input {
  readonly keys = new Set<string>();
  private touchDirs = new Set<string>();
  /** Analog stick from virtual joystick (−1…1). Zero when unused. */
  private joyX = 0;
  private joyY = 0;
  boostHeld = false;
  private justPressed = new Set<string>();
  private unbound: Array<() => void> = [];
  private lastTouchEnd = 0;
  private readonly _axis = { x: 0, y: 0 };
  /** Reset in-flight pointer captures (iOS often skips pointerup after app switch). */
  private pointerCancels: Array<() => void> = [];

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.bindTouch();
    this.blockBrowserGestures();
    const dropStick = (): void => this.clearTouch();
    window.addEventListener('blur', dropStick);
    window.addEventListener('pagehide', dropStick);
    window.addEventListener('orientationchange', dropStick);
    document.addEventListener('visibilitychange', dropStick);
    this.unbound.push(() => {
      window.removeEventListener('blur', dropStick);
      window.removeEventListener('pagehide', dropStick);
      window.removeEventListener('orientationchange', dropStick);
      document.removeEventListener('visibilitychange', dropStick);
    });
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (
      ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'p', 'escape', 'm', 'enter'].includes(
        k,
      ) ||
      e.code === 'Space'
    ) {
      e.preventDefault();
    }
    const code = e.code === 'Space' ? ' ' : k;
    if (!this.keys.has(code)) this.justPressed.add(code);
    this.keys.add(code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const code = e.code === 'Space' ? ' ' : e.key.toLowerCase();
    this.keys.delete(code);
  };

  /** Reduce accidental Safari scroll/zoom/back-swipe while playing. */
  private blockBrowserGestures(): void {
    const prevent = (e: Event) => {
      e.preventDefault();
    };
    document.addEventListener('gesturestart', prevent, { passive: false });
    document.addEventListener('gesturechange', prevent, { passive: false });
    document.addEventListener('gestureend', prevent, { passive: false });

    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', onTouchMove, { passive: false });

    // Do NOT preventDefault on the 2nd finger — that blocks simultaneous
    // stick + BOOST. Pinch-zoom is already killed via gesture* + touchmove.
    const onTouchStart = (e: TouchEvent) => {
      const t = e.target as HTMLElement | null;
      const onChrome = !!t?.closest?.('#touch-controls, #hud-chrome, button');
      // Pinch outside controls; also stop bounce/callout on canvas shell.
      // Never block 2nd finger on chrome — stick + BOOST need simultaneous touches.
      if (!e.cancelable) return;
      if (e.touches.length > 1 && !onChrome) {
        e.preventDefault();
        return;
      }
      if (!onChrome && (t === document.body || t?.id === 'game' || t?.id === 'app' || t?.id === 'safe-probe')) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: false });

    // Always cancel double-tap zoom — including on START/BOOST. Pointer
    // events still deliver the tap; skipping preventDefault here used to
    // let Safari zoom when thumbs double-hit the controls.
    const onTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      if (now - this.lastTouchEnd <= 350 && e.cancelable) e.preventDefault();
      this.lastTouchEnd = now;
    };
    document.addEventListener('touchend', onTouchEnd, { passive: false });

    const onContextMenu = (e: Event) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', onContextMenu);
    const onSelectStart = (e: Event) => e.preventDefault();
    document.addEventListener('selectstart', onSelectStart);
    document.addEventListener('dblclick', prevent, { passive: false });
    const onWheel = (e: WheelEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('webkitmouseforcewillbegin', prevent, { passive: false });

    this.unbound.push(() => {
      document.removeEventListener('gesturestart', prevent);
      document.removeEventListener('gesturechange', prevent);
      document.removeEventListener('gestureend', prevent);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('selectstart', onSelectStart);
      document.removeEventListener('dblclick', prevent);
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('webkitmouseforcewillbegin', prevent);
    });
  }

  private bindTouch(): void {
    const root = document.getElementById('touch-controls');
    if (!root) return;

    this.bindJoystick(root);
    this.bindDpadFallback(root);

    const boost = root.querySelector<HTMLButtonElement>('[data-action="boost"]');
    if (boost) {
      this.bindHold(
        boost,
        () => {
          // START/RIDE reuses this button — only boost during a live run.
          if (!document.body.classList.contains('playing')) return;
          this.boostHeld = true;
          this.justPressed.add(' ');
        },
        () => {
          this.boostHeld = false;
        },
      );
    }
  }

  /**
   * Virtual analog stick: large thumb zone, deadzone, clamp to circle.
   * Prefer this over discrete D-pad on phones.
   */
  private bindJoystick(root: HTMLElement): void {
    const zone = root.querySelector<HTMLElement>('#joy-zone');
    const knob = root.querySelector<HTMLElement>('#joy-knob');
    const base = root.querySelector<HTMLElement>('#joy-base');
    if (!zone || !knob || !base) return;

    let activePointer: number | null = null;
    let originX = 0;
    let originY = 0;
    const maxR = () => {
      const r = base.clientWidth / 2;
      return Math.max(36, r - 8);
    };
    const dead = 0.16;

    const apply = (clientX: number, clientY: number) => {
      const dx = clientX - originX;
      const dy = clientY - originY;
      const r = maxR();
      const len = Math.hypot(dx, dy);
      const cl = len > r ? r / len : 1;
      const nx = (dx * cl) / r;
      const ny = (dy * cl) / r;
      knob.style.transform = `translate(calc(-50% + ${dx * cl}px), calc(-50% + ${dy * cl}px))`;
      const mag = Math.hypot(nx, ny);
      if (mag < dead) {
        this.joyX = 0;
        this.joyY = 0;
      } else {
        const scale = (mag - dead) / (1 - dead);
        this.joyX = (nx / mag) * scale;
        this.joyY = (ny / mag) * scale;
      }
    };

    const resetBasePos = () => {
      base.style.left = '';
      base.style.top = '';
      base.style.bottom = '';
      base.style.transform = '';
    };

    const reset = () => {
      this.joyX = 0;
      this.joyY = 0;
      knob.style.transform = 'translate(-50%, -50%)';
      zone.classList.remove('active');
      resetBasePos();
    };

    const start = (e: PointerEvent) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (activePointer !== null && activePointer !== e.pointerId) return;
      // Stick is play-only, plus initials entry (letter / slot nav)
      if (
        !document.body.classList.contains('playing') &&
        !document.body.classList.contains('initials')
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      activePointer = e.pointerId;
      const zoneRect = zone.getBoundingClientRect();
      const size = base.offsetWidth || 148;
      const half = size / 2;
      originX = clamp(e.clientX, zoneRect.left + half, zoneRect.right - half);
      originY = clamp(e.clientY, zoneRect.top + half, zoneRect.bottom - half);
      // Absolute place under thumb (clear CSS centering transform)
      base.style.transform = 'none';
      base.style.left = `${originX - zoneRect.left - half}px`;
      base.style.top = `${originY - zoneRect.top - half}px`;
      base.style.bottom = 'auto';
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      zone.classList.add('active');
      apply(e.clientX, e.clientY);
    };

    const move = (e: PointerEvent) => {
      if (activePointer === null || e.pointerId !== activePointer) return;
      e.preventDefault();
      apply(e.clientX, e.clientY);
    };

    const end = (e: PointerEvent) => {
      if (activePointer !== null && e.pointerId !== activePointer) return;
      e.preventDefault();
      activePointer = null;
      try {
        if (zone.hasPointerCapture(e.pointerId)) zone.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      reset();
    };

    const ptrOpts: AddEventListenerOptions = { passive: false };

    const onWinMove = (e: PointerEvent) => {
      move(e);
    };
    const onWinEnd = (e: PointerEvent) => {
      if (activePointer !== null && e.pointerId !== activePointer) return;
      end(e);
      window.removeEventListener('pointermove', onWinMove, ptrOpts);
      window.removeEventListener('pointerup', onWinEnd, ptrOpts);
      window.removeEventListener('pointercancel', onWinEnd, ptrOpts);
    };

    const startTracked = (e: PointerEvent) => {
      const before = activePointer;
      start(e);
      if (activePointer !== null && before !== activePointer) {
        window.addEventListener('pointermove', onWinMove, ptrOpts);
        window.addEventListener('pointerup', onWinEnd, ptrOpts);
        window.addEventListener('pointercancel', onWinEnd, ptrOpts);
      }
    };

    // Window-level up/move: iOS Safari often drops setPointerCapture / lostpointercapture
    // spuriously, which used to cancel the stick mid-drag.
    zone.addEventListener('pointerdown', startTracked, ptrOpts);
    zone.addEventListener('pointermove', move, ptrOpts);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());

    this.pointerCancels.push(() => {
      if (activePointer === null) return;
      const id = activePointer;
      activePointer = null;
      window.removeEventListener('pointermove', onWinMove, ptrOpts);
      window.removeEventListener('pointerup', onWinEnd, ptrOpts);
      window.removeEventListener('pointercancel', onWinEnd, ptrOpts);
      try {
        if (zone.hasPointerCapture(id)) zone.releasePointerCapture(id);
      } catch {
        /* ignore */
      }
      reset();
    });
  }

  /** Optional discrete arrows (kept in DOM for a11y / landscape fallback). */
  private bindDpadFallback(root: HTMLElement): void {
    const setDir = (dir: string, on: boolean) => {
      if (on) this.touchDirs.add(dir);
      else this.touchDirs.delete(dir);
    };

    root.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach((btn) => {
      const dir = btn.dataset.dir!;
      this.bindHold(
        btn,
        () => setDir(dir, true),
        () => setDir(dir, false),
      );
    });
  }

  private bindHold(btn: HTMLButtonElement, onStart: () => void, onEnd: () => void): void {
    let activePointer: number | null = null;
    const ptrOpts: AddEventListenerOptions = { passive: false };

    const end = (e: PointerEvent) => {
      if (activePointer === null || e.pointerId !== activePointer) return;
      if (e.cancelable) e.preventDefault();
      activePointer = null;
      btn.classList.remove('active');
      window.removeEventListener('pointermove', move, ptrOpts);
      window.removeEventListener('pointerup', end, ptrOpts);
      window.removeEventListener('pointercancel', end, ptrOpts);
      try {
        if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      onEnd();
    };
    const move = (e: PointerEvent) => {
      if (activePointer === null || e.pointerId !== activePointer) return;
      if (e.cancelable) e.preventDefault();
    };
    const start = (e: PointerEvent) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (activePointer !== null && activePointer !== e.pointerId) return;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      activePointer = e.pointerId;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      btn.classList.add('active');
      window.addEventListener('pointermove', move, ptrOpts);
      window.addEventListener('pointerup', end, ptrOpts);
      window.addEventListener('pointercancel', end, ptrOpts);
      onStart();
    };
    btn.addEventListener('pointerdown', start, ptrOpts);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());

    this.pointerCancels.push(() => {
      if (activePointer === null) return;
      const id = activePointer;
      activePointer = null;
      btn.classList.remove('active');
      window.removeEventListener('pointermove', move, ptrOpts);
      window.removeEventListener('pointerup', end, ptrOpts);
      window.removeEventListener('pointercancel', end, ptrOpts);
      try {
        if (btn.hasPointerCapture(id)) btn.releasePointerCapture(id);
      } catch {
        /* ignore */
      }
      onEnd();
    });
  }

  consume(key: string): boolean {
    if (this.justPressed.has(key)) {
      this.justPressed.delete(key);
      return true;
    }
    return false;
  }

  /** True if any key was just pressed (consumes all). Used on title / game-over. */
  consumeAny(): boolean {
    if (this.justPressed.size === 0) return false;
    this.justPressed.clear();
    return true;
  }

  clearJustPressed(): void {
    this.justPressed.clear();
  }

  /** Clear sticky touch / stick (e.g. after pause / game over). */
  clearTouch(): void {
    for (const c of this.pointerCancels) c();
    this.touchDirs.clear();
    this.boostHeld = false;
    this.joyX = 0;
    this.joyY = 0;
    document.querySelectorAll('.touch-btn.active, #joy-zone.active').forEach((el) => el.classList.remove('active'));
    const knob = document.getElementById('joy-knob');
    if (knob) knob.style.transform = 'translate(-50%, -50%)';
    const baseEl = document.getElementById('joy-base');
    if (baseEl) {
      baseEl.style.left = '';
      baseEl.style.top = '';
      baseEl.style.bottom = '';
      baseEl.style.transform = '';
    }
  }

  get axis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (Math.abs(this.joyX) > 0.01 || Math.abs(this.joyY) > 0.01) {
      x = this.joyX;
      y = this.joyY;
    } else {
      if (this.keys.has('arrowleft') || this.keys.has('a') || this.touchDirs.has('left')) x -= 1;
      if (this.keys.has('arrowright') || this.keys.has('d') || this.touchDirs.has('right')) x += 1;
      if (this.keys.has('arrowup') || this.keys.has('w') || this.touchDirs.has('up')) y -= 1;
      if (this.keys.has('arrowdown') || this.keys.has('s') || this.touchDirs.has('down')) y += 1;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
    }
    this._axis.x = x;
    this._axis.y = y;
    return this._axis;
  }

  get boosting(): boolean {
    return this.keys.has(' ') || this.boostHeld;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    for (const u of this.unbound) u();
    this.unbound = [];
  }
}
