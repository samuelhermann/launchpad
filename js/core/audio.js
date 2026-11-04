/* Moteur audio Web Audio : batterie synthétisée, synthé polyphonique, effets de jeu. */
(function (LP) {
  'use strict';
  const U = LP.U;

  const A = LP.audio = U.emitter({ ctx: null, volume: U.store.get('volume', 0.8) });

  A.start = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = A.ctx = new Ctx({ latencyHint: 'interactive' });

    A.bus = ctx.createGain();
    A.comp = ctx.createDynamicsCompressor();
    A.comp.threshold.value = -12; A.comp.knee.value = 8; A.comp.ratio.value = 5;
    A.comp.attack.value = 0.003; A.comp.release.value = 0.18;
    A.master = ctx.createGain();
    A.master.gain.value = A.volume;
    A.bus.connect(A.comp); A.comp.connect(A.master); A.master.connect(ctx.destination);

    A.analyser = ctx.createAnalyser();
    A.analyser.fftSize = 1024;
    A.analyser.smoothingTimeConstant = 0.7;
    A.comp.connect(A.analyser);

    // Réverbération (réponse impulsionnelle générée)
    A.revIn = ctx.createGain();
    A.reverbLevel = U.store.get('fx.reverb', 0.5);
    A.revIn.gain.value = A.reverbLevel;
    const conv = ctx.createConvolver();
    conv.buffer = makeIR(ctx, 2.4, 3.2);
    A.revIn.connect(conv); conv.connect(A.comp);

    // Écho
    A.delIn = ctx.createGain();
    A.delayLevel = U.store.get('fx.delay', 0.3);
    A.delIn.gain.value = A.delayLevel;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.36;
    const fbk = ctx.createGain(); fbk.gain.value = 0.35;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
    A.delIn.connect(delay); delay.connect(lp); lp.connect(fbk); fbk.connect(delay); lp.connect(A.comp);
    A.delayNode = delay;

    // Bruit blanc réutilisable
    const len = ctx.sampleRate;
    A.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = A.noise.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;

    A.emit('start');
  };

  function makeIR(ctx, seconds, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  A.setVolume = function (v) {
    A.volume = v; U.store.set('volume', v);
    if (A.master) A.master.gain.setTargetAtTime(v, A.ctx.currentTime, 0.02);
  };
  A.setReverb = function (v) {
    A.reverbLevel = v; U.store.set('fx.reverb', v);
    if (A.revIn) A.revIn.gain.setTargetAtTime(v, A.ctx.currentTime, 0.05);
  };
  A.setDelay = function (v) {
    A.delayLevel = v; U.store.set('fx.delay', v);
    if (A.delIn) A.delIn.gain.setTargetAtTime(v, A.ctx.currentTime, 0.05);
  };
  A.setDelayTime = function (s) { if (A.delayNode) A.delayNode.delayTime.setTargetAtTime(U.clamp(s, 0.05, 1.5), A.ctx.currentTime, 0.05); };
  A.now = () => (A.ctx ? A.ctx.currentTime : 0);
  A.ready = () => !!A.ctx;

  /* ---------- Batterie ---------- */
  A.DRUMS = [
    { id: 'kick', name: 'Grosse caisse', short: 'GC', color: [255, 30, 0] },
    { id: 'snare', name: 'Caisse claire', short: 'CC', color: [255, 130, 0] },
    { id: 'clap', name: 'Clap', short: 'Clap', color: [255, 230, 0] },
    { id: 'chh', name: 'Charley fermé', short: 'HH', color: [110, 255, 0] },
    { id: 'ohh', name: 'Charley ouvert', short: 'OH', color: [0, 255, 140] },
    { id: 'tomL', name: 'Tom grave', short: 'Tom1', color: [0, 190, 255] },
    { id: 'tomH', name: 'Tom aigu', short: 'Tom2', color: [50, 70, 255] },
    { id: 'bell', name: 'Cloche', short: 'Cl.', color: [190, 0, 255] }
  ];

  function gainEnv(t, peak, decay, dest) {
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(Math.max(peak, 0.0002), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(dest || A.bus);
    return g;
  }

  function noiseHit(t, decay, type, freq, peak, q, dest) {
    const ctx = A.ctx;
    const s = ctx.createBufferSource(); s.buffer = A.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = gainEnv(t, peak, decay, dest);
    s.connect(f); f.connect(g);
    s.start(t, Math.random() * 0.5); s.stop(t + decay + 0.05);
    return g;
  }

  function toneHit(t, type, f0, f1, sweep, decay, peak, dest) {
    const ctx = A.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
    const g = gainEnv(t, peak, decay, dest);
    o.connect(g); o.start(t); o.stop(t + decay + 0.05);
    return g;
  }

  function metal(t, decay, peak) {
    const ctx = A.ctx;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 10000; bp.Q.value = 0.6;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = gainEnv(t, peak, decay);
    bp.connect(hp); hp.connect(g);
    [2, 3, 4.16, 5.43, 6.79, 8.21].forEach((r) => {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 40 * r;
      o.connect(bp); o.start(t); o.stop(t + decay + 0.05);
    });
    noiseHit(t, decay * 0.8, 'highpass', 8000, peak * 0.5);
  }

  const DRUM_FN = [
    (t, v) => { toneHit(t, 'sine', 160, 42, 0.13, 0.5, v * 1.0); noiseHit(t, 0.015, 'highpass', 2500, v * 0.25); },
    (t, v) => { noiseHit(t, 0.2, 'highpass', 1400, v * 0.6); toneHit(t, 'triangle', 200, 150, 0.08, 0.12, v * 0.45); },
    (t, v) => {
      [0, 0.011, 0.022].forEach((k) => noiseHit(t + k, 0.03, 'bandpass', 1150, v * 0.7, 1.2));
      noiseHit(t + 0.033, 0.22, 'bandpass', 1150, v * 0.55, 1.0);
    },
    (t, v) => metal(t, 0.055, v * 0.3),
    (t, v) => metal(t, 0.38, v * 0.25),
    (t, v) => toneHit(t, 'sine', 130, 75, 0.25, 0.4, v * 0.8),
    (t, v) => toneHit(t, 'sine', 230, 140, 0.2, 0.32, v * 0.7),
    (t, v) => {
      const ctx = A.ctx;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.2;
      const g = gainEnv(t, v * 0.5, 0.35);
      bp.connect(g);
      [560, 845].forEach((f) => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(bp); o.start(t); o.stop(t + 0.4); });
    }
  ];

  A.drum = function (i, time, vel) {
    if (!A.ctx) return;
    const fn = DRUM_FN[i];
    if (fn) fn(time || A.ctx.currentTime, vel === undefined ? 1 : vel);
  };

  /* ---------- Synthé ---------- */
  A.PRESETS = {
    epiano: { name: 'Piano élec.', color: [255, 140, 30], osc: [{ type: 'sine', gain: 0.55 }, { type: 'triangle', gain: 0.2 }, { type: 'sine', ratio: 2, gain: 0.1 }], fm: { ratio: 1, index: 1.2, decay: 0.5 }, a: 0.004, d: 1.3, s: 0.12, r: 0.4, cutoff: 6000, rev: 0.6 },
    pluck: { name: 'Pluck', color: [0, 210, 255], osc: [{ type: 'sawtooth', gain: 0.35 }, { type: 'square', detune: 7, gain: 0.12 }], a: 0.002, d: 0.4, s: 0, r: 0.25, cutoff: 700, fenv: { amount: 4200, decay: 0.16 }, rev: 0.6, del: 0.6 },
    pad: { name: 'Nappe', color: [150, 60, 255], osc: [{ type: 'sawtooth', detune: -10, gain: 0.18 }, { type: 'sawtooth', detune: 10, gain: 0.18 }, { type: 'sine', ratio: 0.5, gain: 0.22 }], a: 0.35, d: 0.8, s: 0.75, r: 1.4, cutoff: 1700, rev: 1 },
    bass: { name: 'Basse', color: [255, 30, 80], osc: [{ type: 'square', gain: 0.25 }, { type: 'sine', ratio: 0.5, gain: 0.5 }], a: 0.004, d: 0.25, s: 0.55, r: 0.1, cutoff: 500, fenv: { amount: 1600, decay: 0.12 }, q: 3, rev: 0.05 },
    organ: { name: 'Orgue', color: [255, 210, 0], osc: [{ type: 'sine', gain: 0.28 }, { type: 'sine', ratio: 2, gain: 0.18 }, { type: 'sine', ratio: 3, gain: 0.12 }, { type: 'sine', ratio: 4, gain: 0.07 }], a: 0.01, d: 0.1, s: 0.9, r: 0.08, cutoff: 9000, rev: 0.5, vib: { rate: 6, depth: 4 } },
    lead: { name: 'Lead', color: [0, 255, 90], osc: [{ type: 'sawtooth', detune: -6, gain: 0.2 }, { type: 'square', detune: 6, gain: 0.13 }], a: 0.01, d: 0.2, s: 0.7, r: 0.2, cutoff: 2400, fenv: { amount: 2200, decay: 0.25 }, vib: { rate: 5.5, depth: 7 }, rev: 0.4, del: 0.7 },
    bell: { name: 'Cloches', color: [120, 200, 255], osc: [{ type: 'sine', gain: 0.45 }], fm: { ratio: 3.5, index: 3, decay: 1.0 }, a: 0.002, d: 1.8, s: 0, r: 0.8, cutoff: 9000, rev: 0.9 },
    chip: { name: '8-bit', color: [255, 70, 200], osc: [{ type: 'square', gain: 0.2 }], a: 0.001, d: 0.1, s: 0.6, r: 0.05, cutoff: 12000, rev: 0.2 }
  };
  A.PRESET_IDS = Object.keys(A.PRESETS);

  const voices = [];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  A.mtof = mtof;

  function killVoice(v) {
    try {
      const t = A.ctx.currentTime;
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setTargetAtTime(0, t, 0.01);
      v.oscs.forEach((o) => { try { o.stop(t + 0.06); } catch (e) { /* déjà arrêté */ } });
    } catch (e) { /* ignore */ }
  }

  A.noteOn = function (midi, vel, presetId, time) {
    const ctx = A.ctx;
    if (!ctx) return null;
    const p = A.PRESETS[presetId] || A.PRESETS.epiano;
    const t = Math.max(time || 0, ctx.currentTime);
    vel = vel === undefined ? 0.8 : U.clamp(vel, 0, 1);
    const f = mtof(midi);

    const out = ctx.createGain();
    out.gain.value = 0;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.Q.value = p.q || 0.7;
    const cut = Math.min(p.cutoff * (0.6 + vel * 0.6), 18000);
    if (p.fenv) {
      filt.frequency.setValueAtTime(Math.min(cut + p.fenv.amount * vel, 18000), t);
      filt.frequency.setTargetAtTime(cut, t, p.fenv.decay / 3);
    } else filt.frequency.value = cut;

    const oscs = [];
    let fmGain = null;
    if (p.fm) {
      const m = ctx.createOscillator();
      m.frequency.value = f * p.fm.ratio;
      fmGain = ctx.createGain();
      fmGain.gain.setValueAtTime(f * p.fm.index, t);
      fmGain.gain.setTargetAtTime(f * p.fm.index * 0.08, t, p.fm.decay / 3);
      m.connect(fmGain);
      oscs.push(m);
    }
    let lfoGain = null;
    if (p.vib) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = p.vib.rate;
      lfoGain = ctx.createGain(); lfoGain.gain.value = p.vib.depth;
      lfo.connect(lfoGain); oscs.push(lfo);
    }
    for (const o of p.osc) {
      const osc = ctx.createOscillator();
      osc.type = o.type;
      osc.frequency.value = f * (o.ratio || 1);
      if (o.detune) osc.detune.value = o.detune;
      if (fmGain) fmGain.connect(osc.frequency);
      if (lfoGain) lfoGain.connect(osc.detune);
      const g = ctx.createGain(); g.gain.value = o.gain;
      osc.connect(g); g.connect(filt);
      oscs.push(osc);
    }
    filt.connect(out);
    out.connect(A.bus);
    if (p.rev) { const s = ctx.createGain(); s.gain.value = p.rev * 0.5; out.connect(s); s.connect(A.revIn); }
    if (p.del) { const s = ctx.createGain(); s.gain.value = p.del * 0.5; out.connect(s); s.connect(A.delIn); }

    const amp = 0.25 + 0.55 * vel;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(amp, t + p.a);
    out.gain.setTargetAtTime(amp * p.s, t + p.a, p.d / 3);
    oscs.forEach((o) => o.start(t));

    const v = { out, oscs, p, t, midi, released: false };
    if (p.s === 0) {
      const end = t + p.a + p.d * 1.6;
      oscs.forEach((o) => o.stop(end + 0.1));
    }
    oscs[oscs.length - 1].onended = () => {
      try { out.disconnect(); } catch (e) { /* ignore */ }
      const k = voices.indexOf(v); if (k >= 0) voices.splice(k, 1);
    };
    voices.push(v);
    if (voices.length > 40) killVoice(voices.shift());
    return v;
  };

  A.noteOff = function (v, time) {
    if (!v || v.released || !A.ctx) return;
    v.released = true;
    const ctx = A.ctx;
    const t = Math.max(time || 0, ctx.currentTime, v.t + 0.005);
    const g = v.out.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
    else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
    g.setTargetAtTime(0, t, v.p.r / 4);
    const end = t + v.p.r * 1.6 + 0.05;
    v.oscs.forEach((o) => { try { o.stop(end); } catch (e) { /* déjà programmé */ } });
  };

  A.play = function (midi, dur, vel, presetId, time) {
    const v = A.noteOn(midi, vel, presetId, time);
    if (v) A.noteOff(v, Math.max(time || 0, A.ctx.currentTime) + dur);
    return v;
  };

  A.allNotesOff = function () { voices.slice().forEach((v) => A.noteOff(v)); };

  /* ---------- Effets sonores des jeux ---------- */
  function tone(freq, dur, type, vol, delay, slideTo) {
    if (!A.ctx) return;
    const ctx = A.ctx, t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(); o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(A.bus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  A.sfx = {
    tone,
    click() { tone(1400, 0.02, 'sine', 0.08); },
    start() { [523, 659, 784].forEach((f, i) => tone(f, 0.09, 'square', 0.1, i * 0.07)); },
    eat() { tone(660, 0.05, 'square', 0.12); tone(990, 0.08, 'square', 0.12, 0.05); },
    bonus() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.07, 'square', 0.1, i * 0.05)); },
    die() { tone(440, 0.6, 'sawtooth', 0.18, 0, 70); },
    hit() { tone(880, 0.06, 'square', 0.12); if (A.ctx) noiseHit(A.ctx.currentTime, 0.05, 'highpass', 3000, 0.2); },
    bounce() { tone(520, 0.035, 'square', 0.09); },
    brick(row) { tone(1046 - (row || 0) * 120, 0.06, 'square', 0.11); },
    error() { tone(140, 0.35, 'sawtooth', 0.2); tone(147, 0.35, 'sawtooth', 0.15); },
    lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, i * 0.16)); },
    win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.1, i * 0.09)); },
    drop() { tone(320, 0.09, 'triangle', 0.25, 0, 120); },
    tick() { tone(2000, 0.012, 'square', 0.05); },
    note(midi, dur, preset, vel) { if (A.ctx) A.play(midi, dur || 0.3, vel || 0.7, preset || 'bell'); }
  };
})(window.LP);
