// Web Audio API engine — all sounds synthesized, zero external files.
export class AudioEngine {
  constructor() {
    this.ctx        = null;
    this.masterGain = null;

    this.sfxEnabled   = localStorage.getItem('dz3d_sfx')   !== 'off';
    this.musicEnabled = localStorage.getItem('dz3d_music') !== 'off';

    // Pitch escalation state — increments per consecutive pop, resets after silence
    this.popPitchIdx = 0;
    this.lastPopTime = 0;

    // Adaptive music state
    this._musicActive = false;
    this._musicGain   = null;
    this._musicOscs   = [];
    this._layer2On    = false;
    this._layer3On    = false;
    this._layer2Timer = null;
    this._layer3Timer = null;
  }

  setMusicEnabled(enabled) {
    this.musicEnabled = enabled;
    if (!enabled) this.stopMusic();
  }

  setSFXEnabled(enabled) {
    this.sfxEnabled = enabled;
  }

  /** Must be called inside a user-gesture handler to unlock AudioContext. */
  resume() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.65;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ── SFX ────────────────────────────────────────────────────

  /** Deep sub-thump on shoot. */
  shoot() {
    if (!this.ctx || !this.sfxEnabled) return;
    const now = this.ctx.currentTime;

    // Sine drop 90→40 Hz — body of the thump
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.13);
    env.gain.setValueAtTime(0.55, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);

    // Transient click
    this._noiseAt(now, 0.03, 300, 1600, 0.30, this.masterGain);
  }

  /**
   * Glass tink with pitch escalation.
   * delayOffset (seconds) lets callers stagger chain pops musically.
   */
  pop(delayOffset = 0) {
    if (!this.ctx || !this.sfxEnabled) return;
    const now = this.ctx.currentTime;

    // Reset pitch ladder after 1.5s of silence
    if (now - this.lastPopTime > 1.5) this.popPitchIdx = 0;
    this.lastPopTime = now;

    // C major pentatonic, 2 octaves
    const SCALE = [523, 659, 784, 880, 1047, 1319, 1568, 1760];
    const freq  = SCALE[this.popPitchIdx % SCALE.length];
    this.popPitchIdx++;

    const t = now + delayOffset;

    // Primary tink — sine with fast attack, glass-like ring
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.55, t + 0.007);
    env.gain.setValueAtTime(0.001, t);
    env.gain.linearRampToValueAtTime(0.30, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.26);

    // Shimmer at 2× frequency
    const osc2 = this.ctx.createOscillator();
    const env2 = this.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2, t);
    env2.gain.setValueAtTime(0.09, t);
    env2.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc2.connect(env2);
    env2.connect(this.masterGain);
    osc2.start(t);
    osc2.stop(t + 0.13);
  }

  /** C major chord swell — plays on row clear / combo. */
  combo() {
    if (!this.ctx || !this.sfxEnabled) return;
    const now = this.ctx.currentTime;
    [523, 659, 784].forEach((freq, i) => {
      const t   = now + i * 0.07;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0.001, t);
      env.gain.linearRampToValueAtTime(0.20, t + 0.07);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(env);
      env.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  /** Ascending arpeggio — level complete fanfare. */
  levelComplete() {
    if (!this.ctx || !this.sfxEnabled) return;
    const now = this.ctx.currentTime;
    [523, 659, 784, 1047, 1568].forEach((freq, i) => {
      const t   = now + i * 0.11;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0.001, t);
      env.gain.linearRampToValueAtTime(0.28, t + 0.05);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(env);
      env.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  }

  /** Distorted descending sweep — game over. */
  gameOver() {
    if (!this.ctx || !this.sfxEnabled) return;
    const now  = this.ctx.currentTime;
    const osc  = this.ctx.createOscillator();
    const dist = this.ctx.createWaveShaper();
    const env  = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.95);
    dist.curve = this._distCurve(90);
    env.gain.setValueAtTime(0.42, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    osc.connect(dist);
    dist.connect(env);
    env.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 1.05);
  }

  // ── Adaptive Music ─────────────────────────────────────────

  startMusic() {
    if (!this.ctx || this._musicActive || !this.musicEnabled) return;
    this._musicActive = true;
    this._layer2On    = false;
    this._layer3On    = false;
    this._musicOscs   = [];

    this._musicGain = this.ctx.createGain();
    this._musicGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    this._musicGain.gain.linearRampToValueAtTime(1.0, this.ctx.currentTime + 2.8);
    this._musicGain.connect(this.masterGain);

    this._startLayer1();
  }

  stopMusic() {
    if (!this._musicActive) return;
    this._musicActive = false;
    this._layer2On    = false;
    this._layer3On    = false;
    clearTimeout(this._layer2Timer);
    clearTimeout(this._layer3Timer);

    if (this._musicGain && this.ctx) {
      const g = this._musicGain;
      g.gain.setValueAtTime(g.gain.value, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.7);
      const oscs = this._musicOscs.slice();
      setTimeout(() => {
        oscs.forEach(o => { try { o.stop(); } catch {} });
        g.disconnect();
        if (this._musicGain === g) this._musicGain = null;
      }, 800);
      this._musicOscs = [];
    }
  }

  /**
   * Call whenever bubble count changes.
   * remaining/total drives dynamic layer activation.
   */
  updateMusicIntensity(remaining, total) {
    if (!this._musicActive || total <= 0) return;
    const pct = remaining / total;
    if (pct <= 0.55 && !this._layer2On) { this._layer2On = true; this._startLayer2(); }
    if (pct <= 0.25 && !this._layer3On) { this._layer3On = true; this._startLayer3(); }
  }

  // ── Music layers ────────────────────────────────────────────

  _startLayer1() {
    if (!this._musicGain || !this._musicActive) return;
    const now = this.ctx.currentTime;
    // Space pad: A1 + E2 with slow tremolo LFO
    [[55, 0.048], [82.5, 0.036]].forEach(([freq, vol]) => {
      const osc  = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo  = this.ctx.createOscillator();
      const lfoG = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      lfo.type = 'sine';
      lfo.frequency.value = 0.13 + Math.random() * 0.06;
      lfoG.gain.value = 0.018;
      lfo.connect(lfoG);
      lfoG.connect(gain.gain);
      gain.gain.setValueAtTime(vol, now);
      osc.connect(gain);
      gain.connect(this._musicGain);
      osc.start(now);
      lfo.start(now);
      this._musicOscs.push(osc, lfo);
    });
  }

  // Layer 2 — rhythmic kick pulse (activates at ~55% cleared)
  _startLayer2() {
    if (!this._musicGain || !this._layer2On || !this._musicActive) return;
    const beatMs = (60 / 118) * 1000;
    const tick = () => {
      if (!this._layer2On || !this._musicActive || !this._musicGain) return;
      this._noiseAt(this.ctx.currentTime, 0.09, 80, 340, 0.068, this._musicGain);
      this._layer2Timer = setTimeout(tick, beatMs);
    };
    tick();
  }

  // Layer 3 — bright lead arpeggio (activates at ~75% cleared — home stretch)
  _startLayer3() {
    const notes  = [523, 659, 784, 659];
    const stepMs = 190;
    let idx = 0;
    const tick = () => {
      if (!this._layer3On || !this._musicActive || !this._musicGain) return;
      const now  = this.ctx.currentTime;
      const freq = notes[idx++ % notes.length];
      const osc  = this.ctx.createOscillator();
      const env  = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0.001, now);
      env.gain.linearRampToValueAtTime(0.050, now + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(env);
      env.connect(this._musicGain);
      osc.start(now);
      osc.stop(now + 0.17);
      this._musicOscs.push(osc);
      this._layer3Timer = setTimeout(tick, stepMs);
    };
    tick();
  }

  // ── Internal helpers ────────────────────────────────────────

  _noiseAt(time, duration, loFreq, hiFreq, gainVal, dest) {
    if (!this.ctx || !dest) return;
    const bufSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buf     = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data    = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src  = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = (loFreq + hiFreq) / 2;
    filt.Q.value = 2.2;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gainVal, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.75);
    src.connect(filt);
    filt.connect(env);
    env.connect(dest);
    src.start(time);
  }

  _distCurve(amount) {
    const n = 256, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return c;
  }
}
