/** Lightweight Web Audio SFX + optional looping music bed. Unlocks on first gesture. */

/** Tiny WAV so HTMLAudio.play() can unlock the iOS audio session in-gesture. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private htmlAudio: HTMLAudioElement | null = null;
  private muted = false;
  private unlocked = false;
  private unlocking: Promise<void> | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private hatBuffer: AudioBuffer | null = null;
  private htmlAudioKicking = false;

  get isMuted(): boolean {
    return this.muted;
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /**
   * Must be called from a user-gesture handler on iOS Safari.
   * Creates AudioContext, resumes, and plays a near-silent blip *synchronously*
   * in the same turn as the tap — awaiting resume() first is what mutes iOS.
   */
  async unlock(): Promise<void> {
    this.ensureContext();
    this.kickSession();
    if (this.unlocked && this.ctx?.state === 'running') return;
    if (this.unlocking) return this.unlocking;
    this.unlocking = this.finishUnlock();
    try {
      await this.unlocking;
    } finally {
      this.unlocking = null;
    }
  }

  private ensureContext(): void {
    if (this.ctx) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.35;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.master);
    this.ctx.addEventListener('statechange', this.onContextState);
  }

  /** Sync work that must happen inside the iOS user-gesture turn. */
  private kickSession(): void {
    if (!this.ctx || !this.master) return;
    const st = this.ctx.state as string;
    if (st === 'suspended' || st === 'interrupted') {
      void this.ctx.resume();
    }
    if (!this.htmlAudio) {
      const a = new Audio(SILENT_WAV);
      a.loop = true;
      a.volume = 0.01;
      a.setAttribute('playsinline', '');
      a.setAttribute('webkit-playsinline', 'true');
      (a as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      a.preload = 'auto';
      a.addEventListener('pause', () => {
        if (document.visibilityState !== 'visible' || this.htmlAudioKicking) return;
        this.htmlAudioKicking = true;
        const retry = a.play();
        if (retry) {
          void retry.finally(() => {
            this.htmlAudioKicking = false;
          });
        } else {
          this.htmlAudioKicking = false;
        }
      });
      this.htmlAudio = a;
    }
    const play = this.htmlAudio.play();
    if (play) void play.catch(() => { /* retry on next gesture */ });
    this.primeSilent();
  }

  private async finishUnlock(): Promise<void> {
    if (!this.ctx) return;
    const st = this.ctx.state as string;
    if (st === 'suspended' || st === 'interrupted') {
      try {
        await this.ctx.resume();
      } catch {
        return;
      }
    }
    if (!this.unlocked) {
      this.unlocked = true;
      this.startMusic();
      document.addEventListener('visibilitychange', this.onVisibility);
      window.addEventListener('pageshow', this.onVisibility);
      window.addEventListener('focus', this.onVisibility);
    }
  }

  private primeSilent(): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.value = 440;
    g.gain.value = 0.0001;
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.01);
  }

  private onContextState = (): void => {
    const st = this.ctx?.state as string | undefined;
    if ((st === 'suspended' || st === 'interrupted') && document.visibilityState === 'visible') {
      void this.ctx?.resume();
    }
  };

  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') return;
    // Safari often suspends AudioContext after lock / tab switch; also
    // re-kick the silent HTMLAudio so the media session stays alive.
    const st = this.ctx?.state as string | undefined;
    if (st === 'suspended' || st === 'interrupted') {
      void this.ctx?.resume();
    }
    if (this.htmlAudio) {
      const play = this.htmlAudio.play();
      if (play) void play.catch(() => { /* next gesture */ });
    }
  };

  /** Run SFX after the context is actually running (iOS may resume a tick late). */
  private whenRunning(fn: () => void): void {
    if (!this.ctx || !this.master) return;
    if (this.ctx.state === 'running') {
      fn();
      return;
    }
    void this.ctx.resume().then(() => {
      if (this.ctx?.state === 'running') fn();
    });
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    dest: AudioNode,
    slideTo?: number,
    delay = 0,
  ): void {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  playCollect(): void {
    this.whenRunning(() => {
      if (!this.master) return;
      this.tone(660, 0.08, 'sine', 0.25, this.master);
      this.tone(990, 0.12, 'triangle', 0.18, this.master);
    });
  }

  playHit(): void {
    this.whenRunning(() => {
      if (!this.master) return;
      this.tone(180, 0.2, 'sawtooth', 0.22, this.master, 60);
      this.tone(90, 0.25, 'square', 0.12, this.master, 40);
    });
  }

  playBoost(): void {
    this.whenRunning(() => {
      if (!this.master) return;
      this.tone(220, 0.15, 'sawtooth', 0.15, this.master, 440);
    });
  }

  /** Slapstick SFX for the character bosses: bulb-horn HONK, spring BOING, slide whistle up / down. */
  playComic(kind: 'honk' | 'boing' | 'whistleUp' | 'whistleDown'): void {
    this.whenRunning(() => {
      if (!this.master) return;
      const m = this.master;
      if (kind === 'honk') {
        this.tone(330, 0.12, 'square', 0.12, m, 300);
        this.tone(415, 0.12, 'sawtooth', 0.06, m, 380);
        this.tone(330, 0.16, 'square', 0.12, m, 290, 0.16);
      } else if (kind === 'boing') {
        this.tone(160, 0.35, 'sine', 0.22, m, 620);
        this.tone(620, 0.25, 'triangle', 0.08, m, 240, 0.12);
      } else if (kind === 'whistleUp') {
        this.tone(500, 0.45, 'sine', 0.16, m, 1800);
      } else {
        this.tone(1800, 1.1, 'sine', 0.16, m, 180);
      }
    });
  }

  /**
   * ON A MISSION slapstick: CLANG (a panel hits the road), TINKLE (a mirror), the siren's sad
   * WEE-OOO, a SPUTTERing engine and a cork POP (the trunk lid). Respects mute like every SFX.
   */
  playMission(kind: 'clang' | 'tinkle' | 'siren' | 'sputter' | 'pop' | 'squeal'): void {
    this.whenRunning(() => {
      if (!this.master) return;
      const m = this.master;
      if (kind === 'clang') {
        this.tone(880, 0.09, 'square', 0.12, m, 760);
        this.tone(1320, 0.35, 'triangle', 0.1, m, 1180);
        this.tone(523, 0.45, 'sine', 0.12, m, 500, 0.02);
        this.tone(180, 0.12, 'sawtooth', 0.1, m, 90, 0.05);
      } else if (kind === 'tinkle') {
        this.tone(2637, 0.12, 'sine', 0.1, m);
        this.tone(3136, 0.12, 'sine', 0.08, m, undefined, 0.07);
        this.tone(2349, 0.16, 'sine', 0.08, m, undefined, 0.14);
        this.tone(3520, 0.2, 'triangle', 0.05, m, undefined, 0.2);
      } else if (kind === 'siren') {
        this.tone(960, 0.28, 'sine', 0.14, m, 640);
        this.tone(640, 0.28, 'sine', 0.14, m, 960, 0.3);
        this.tone(900, 0.7, 'sine', 0.12, m, 200, 0.6);
      } else if (kind === 'squeal') {
        // PA feedback: a thin whine that climbs and wobbles, then a dull clunk.
        this.tone(1800, 0.42, 'sine', 0.07, m, 3400);
        this.tone(1830, 0.42, 'triangle', 0.035, m, 3300, 0.02);
        this.tone(3300, 0.12, 'sine', 0.05, m, 2600, 0.42);
        this.tone(160, 0.1, 'square', 0.08, m, 90, 0.5);
      } else if (kind === 'sputter') {
        for (let i = 0; i < 5; i++) {
          this.tone(70 + (i % 2) * 18, 0.07, 'square', 0.14, m, 50, i * 0.11);
        }
        this.tone(1400, 0.06, 'triangle', 0.05, m, 900, 0.58);
      } else {
        this.tone(920, 0.09, 'sine', 0.2, m, 220);
        this.tone(2200, 0.05, 'triangle', 0.06, m, 1500, 0.02);
      }
    });
  }

  playUi(): void {
    this.whenRunning(() => {
      if (!this.master) return;
      this.tone(520, 0.06, 'triangle', 0.2, this.master);
      this.tone(780, 0.1, 'sine', 0.15, this.master);
    });
  }

  playGameOver(): void {
    this.whenRunning(() => {
      if (!this.master) return;
      this.tone(440, 0.2, 'triangle', 0.2, this.master, 220);
      this.tone(330, 0.35, 'sine', 0.18, this.master, 110);
      this.tone(165, 0.5, 'sawtooth', 0.1, this.master, 55);
    });
  }

  /** Gate boost: a bright upward sweep with a sparkle on top (distinct from the circle pickup). */
  private tromboneTimer = 0;
  private tromboneNodes: OscillatorNode[] = [];
  /** Sad trombone (wah wah wah waaah), looping until stopSadTrombone(). Respects mute. */
  startSadTrombone(): void {
    this.stopSadTrombone();
    const loop = (): void => {
      this.whenRunning(() => {
        if (!this.ctx || !this.master || this.muted) return;
        const c = this.ctx;
        const notes: [number, number, number][] = [
          [233.08, 0, 0.42],
          [220, 0.5, 0.42],
          [207.65, 1.0, 0.42],
          [196, 1.5, 1.3],
        ];
        for (const [f, at, dur] of notes) {
          const t0 = c.currentTime + at;
          const o = c.createOscillator();
          const lp = c.createBiquadFilter();
          const g = c.createGain();
          const lfo = c.createOscillator();
          const lg = c.createGain();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(f, t0);
          if (dur > 1) o.frequency.linearRampToValueAtTime(f * 0.94, t0 + dur);
          lfo.frequency.value = 5.5;
          lg.gain.value = dur > 1 ? f * 0.025 : 0;
          lfo.connect(lg);
          lg.connect(o.frequency);
          lp.type = 'lowpass';
          lp.frequency.value = 900;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.06);
          g.gain.setValueAtTime(0.22, t0 + dur - 0.08);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
          o.connect(lp);
          lp.connect(g);
          g.connect(this.master);
          o.start(t0);
          lfo.start(t0);
          o.stop(t0 + dur + 0.02);
          lfo.stop(t0 + dur + 0.02);
          this.tromboneNodes.push(o, lfo);
        }
      });
      this.tromboneTimer = window.setTimeout(loop, 3600);
    };
    loop();
  }

  get tromboneOn(): boolean {
    return this.tromboneTimer !== 0;
  }

  stopSadTrombone(): void {
    if (this.tromboneTimer) window.clearTimeout(this.tromboneTimer);
    this.tromboneTimer = 0;
    for (const n of this.tromboneNodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.tromboneNodes = [];
  }

  playGate(): void {
    this.whenRunning(() => {
      if (!this.master) return;
      this.tone(440, 0.18, 'triangle', 0.2, this.master, 1320);
      this.tone(1320, 0.1, 'sine', 0.14, this.master, undefined, 0.12);
      this.tone(1760, 0.14, 'sine', 0.12, this.master, undefined, 0.2);
    });
  }

  /** Promotion interstitial: a short rising square-wave fanfare (arcade level-clear). */
  playPromote(): void {
    this.whenRunning(() => {
      if (!this.master) return;
      const notes = [523, 659, 784, 1047, 784, 1047];
      notes.forEach((f, i) => this.tone(f, i === notes.length - 1 ? 0.32 : 0.11, 'square', 0.1, this.master!, undefined, i * 0.1));
    });
  }

  playStart(): void {
    this.whenRunning(() => {
      if (!this.master) return;
      this.tone(330, 0.1, 'square', 0.12, this.master);
      this.tone(440, 0.12, 'square', 0.12, this.master);
      this.tone(660, 0.2, 'triangle', 0.16, this.master);
    });
  }

  private startMusic(): void {
    if (!this.ctx || !this.musicGain) return;
    const bpm = 96;
    const beat = 60 / bpm;
    const notes = [55, 55, 82.5, 55, 73.5, 55, 98, 82.5];
    const lead = [330, 0, 392, 330, 440, 0, 494, 392];

    const tick = () => {
      if (!this.ctx || !this.musicGain || this.muted) {
        this.musicTimer = window.setTimeout(tick, beat * 1000);
        this.musicStep++;
        return;
      }
      const i = this.musicStep % notes.length;
      const bass = notes[i];
      this.tone(bass, beat * 0.85, 'triangle', 0.14, this.musicGain);
      const l = lead[i];
      if (l > 0) this.tone(l, beat * 0.4, 'sine', 0.06, this.musicGain);
      this.noiseHat(beat * 0.08, 0.04);
      this.musicStep++;
      this.musicTimer = window.setTimeout(tick, beat * 1000);
    };
    tick();
  }

  private noiseHat(dur: number, vol: number): void {
    if (!this.ctx || !this.musicGain) return;
    const t0 = this.ctx.currentTime;
    if (!this.hatBuffer) {
      const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * 0.08));
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      this.hatBuffer = buffer;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.hatBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.musicGain);
    src.start(t0);
    src.stop(t0 + dur);
  }

  dispose(): void {
    if (this.musicTimer !== null) clearTimeout(this.musicTimer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pageshow', this.onVisibility);
    window.removeEventListener('focus', this.onVisibility);
    this.ctx?.removeEventListener('statechange', this.onContextState);
    if (this.htmlAudio) {
      this.htmlAudio.pause();
      this.htmlAudio.src = '';
      this.htmlAudio = null;
    }
    void this.ctx?.close();
  }
}
