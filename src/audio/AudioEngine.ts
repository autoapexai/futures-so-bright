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
