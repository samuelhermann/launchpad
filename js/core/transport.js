/* Tonalité globale + horloge partagée (batterie et séquenceur mélodique jouent ensemble). */
(function (LP) {
  'use strict';
  const U = LP.U;
  const A = LP.audio;

  /* ---------- Gammes ---------- */
  const M = LP.music = U.emitter({
    NOTE_NAMES: ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'],
    SCALES: {
      pentaMaj: { name: 'Pentatonique majeure', steps: [0, 2, 4, 7, 9] },
      pentaMin: { name: 'Pentatonique mineure', steps: [0, 3, 5, 7, 10] },
      major: { name: 'Majeure', steps: [0, 2, 4, 5, 7, 9, 11] },
      minor: { name: 'Mineure', steps: [0, 2, 3, 5, 7, 8, 10] },
      dorian: { name: 'Dorienne', steps: [0, 2, 3, 5, 7, 9, 10] },
      harmMin: { name: 'Mineure harmonique', steps: [0, 2, 3, 5, 7, 8, 11] },
      blues: { name: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
      chromatic: { name: 'Chromatique', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
    },
    root: U.store.get('music.root', 0),
    scale: U.store.get('music.scale', 'pentaMaj')
  });
  if (!M.SCALES[M.scale]) M.scale = 'pentaMaj';
  M.scaleIds = Object.keys(M.SCALES);
  M.steps = () => M.SCALES[M.scale].steps;
  M.midiFor = (deg, octave) => {
    const st = M.steps(), n = st.length;
    const o = Math.floor(deg / n), i = ((deg % n) + n) % n;
    return (octave + 1) * 12 + M.root + st[i] + 12 * o;
  };
  M.pc = (midi) => ((midi % 12) + 12) % 12;
  M.inScale = (midi) => M.steps().indexOf(((midi - M.root) % 12 + 12) % 12) >= 0;
  M.isRoot = (midi) => M.pc(midi - M.root) === 0;
  M.name = (midi, withOct) => M.NOTE_NAMES[M.pc(midi)] + (withOct ? (Math.floor(midi / 12) - 1) : '');
  M.set = (root, scale) => {
    if (root !== undefined && root !== null) M.root = ((root % 12) + 12) % 12;
    if (scale && M.SCALES[scale]) M.scale = scale;
    U.store.set('music.root', M.root); U.store.set('music.scale', M.scale);
    M.emit('change');
  };

  /* ---------- Transport ---------- */
  const STEPS = 16;
  const blank = () => { const p = []; for (let r = 0; r < 8; r++) p.push(new Array(STEPS).fill(0)); return p; };
  const saved = U.store.get('transport', null) || {};

  const T = LP.transport = U.emitter({
    STEPS,
    bpm: saved.bpm || 110,
    swing: saved.swing || 0,
    playing: false,
    drums: {
      pattern: saved.drums && saved.drums.pattern || blank(),
      mute: saved.drums && saved.drums.mute || new Array(8).fill(false),
      vol: saved.drums && saved.drums.vol || new Array(8).fill(0.9)
    },
    melody: {
      tracks: saved.melody && saved.melody.tracks || [
        { name: 'Mélodie', preset: 'pluck', octave: 4, mute: false, pattern: blank() },
        { name: 'Basse', preset: 'bass', octave: 2, mute: false, pattern: blank() }
      ]
    },
    _next: 0, _step: 0, queue: []
  });

  T.stepDur = () => 60 / T.bpm / 4;

  T.save = function () {
    clearTimeout(T._saveT);
    T._saveT = setTimeout(() => U.store.set('transport', { bpm: T.bpm, swing: T.swing, drums: T.drums, melody: T.melody }), 300);
  };

  T.setBpm = function (b) {
    T.bpm = U.clamp(Math.round(b), 50, 200);
    if (A.ready()) A.setDelayTime(T.stepDur() * 3);
    T.save(); T.emit('change');
  };
  T.setSwing = function (s) { T.swing = U.clamp(s, 0, 0.7); T.save(); T.emit('change'); };

  T.start = function () {
    if (!A.ready()) return;
    T.playing = true;
    T._step = 0;
    T._next = A.ctx.currentTime + 0.08;
    T.queue = [];
    A.setDelayTime(T.stepDur() * 3);
    T.emit('change');
  };
  T.stop = function () { T.playing = false; T.queue = []; T.emit('change'); };
  T.toggle = function () { if (T.playing) T.stop(); else T.start(); };

  /* Appelé ~60 fois/s : programme les pas à l'avance sur l'horloge audio */
  T.schedule = function () {
    if (!T.playing || !A.ready()) return;
    const now = A.ctx.currentTime;
    if (T._next < now - 0.25) T._next = now + 0.03; // rattrapage après une pause
    while (T._next < now + 0.12) {
      const s = T._step;
      let time = T._next;
      if (s % 2 === 1) time += T.swing * T.stepDur() * 0.5;
      T.playStep(s, time);
      T.queue.push({ step: s, time });
      T._next += T.stepDur();
      T._step = (s + 1) % STEPS;
    }
  };

  T.playStep = function (s, time) {
    const d = T.drums;
    for (let tr = 0; tr < 8; tr++) {
      if (d.pattern[tr][s] && !d.mute[tr]) A.drum(tr, time, d.vol[tr] * (d.pattern[tr][s] === 2 ? 1 : 0.85));
    }
    for (const trk of T.melody.tracks) {
      if (trk.mute) continue;
      for (let deg = 0; deg < 8; deg++) {
        if (trk.pattern[deg][s]) A.play(M.midiFor(deg, trk.octave), T.stepDur() * 0.92, 0.75, trk.preset, time);
      }
    }
  };

  /* Pas actuellement audible (pour l'affichage), -1 si arrêté */
  T.currentStep = function () {
    if (!T.playing || !A.ready()) return -1;
    const now = A.ctx.currentTime;
    while (T.queue.length > 1 && T.queue[1].time <= now) T.queue.shift();
    return T.queue.length && T.queue[0].time <= now ? T.queue[0].step : -1;
  };

  T.blank = blank;
})(window.LP);
