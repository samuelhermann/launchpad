/* Clavier / synthé : la grille devient un instrument dans la gamme choisie. */
(function (LP) {
  'use strict';
  const U = LP.U;
  const A = LP.audio, M = LP.music;

  LP.apps.register({
    id: 'keys', name: 'Clavier / synthé', cat: 'musique', emoji: '🎹', color: [60, 90, 255],
    short: 'Joue des notes dans une gamme, 8 sons',
    icon: [[255, 255, 255], [60, 90, 255], [60, 90, 255], [255, 255, 255]],
    desc: 'Chaque pad est une note. En mode « Gamme », seules les notes de la gamme sont présentes : impossible de jouer faux ! Les pads colorés sont la note de base (tonique). Les pads sont sensibles à la force de frappe sur Launchpad X et Pro.',
    help: [
      ['Pads', 'Jouer des notes (plusieurs à la fois)'],
      ['Haut 1 / 2', 'Octave + / −'],
      ['Haut 3 / 4', 'Gamme précédente / suivante'],
      ['Haut 5', 'Disposition : gamme ou chromatique'],
      ['Haut 6', 'Mode accords (3 notes par pad)'],
      ['Colonne droite', 'Choisir le son (8 instruments)']
    ],
    buttons: { top: ['O+', 'O−', 'G◀', 'G▶', '⊞', '♫'], right: A.PRESET_IDS.map((id) => A.PRESETS[id].name.slice(0, 5)) },

    start(api) {
      this.api = api;
      this.preset = U.store.get('keys.preset', 'epiano');
      this.layout = U.store.get('keys.layout', 'scale');
      this.octave = U.store.get('keys.octave', 3);
      this.chords = U.store.get('keys.chords', false);
      this.held = new Map();
      this.offM = this.offM || M.on('change', () => { if (LP.core.current === this) this.api.refresh(); });
      this.hud();
    },

    stop() { this.held.forEach((h) => h.voices.forEach((v) => A.noteOff(v))); this.held.clear(); },

    hud() {
      this.api.hud({ Tonalité: M.NOTE_NAMES[M.root] + ' ' + M.SCALES[M.scale].name, Octave: this.octave, Son: A.PRESETS[this.preset].name, Accords: this.chords ? 'oui' : 'non' }, '');
    },

    rowOffset() { const n = M.steps().length; return n === 12 ? 5 : n >= 7 ? 3 : 2; },

    midiAt(x, y) {
      const r = 7 - y;
      if (this.layout === 'chroma') return (this.octave + 1) * 12 + M.root + x + r * 5;
      return M.midiFor(x + r * this.rowOffset(), this.octave);
    },

    notesAt(x, y) {
      const m = this.midiAt(x, y);
      if (!this.chords) return [m];
      if (this.layout === 'scale') {
        const d = x + (7 - y) * this.rowOffset();
        return [M.midiFor(d, this.octave), M.midiFor(d + 2, this.octave), M.midiFor(d + 4, this.octave)];
      }
      if (M.inScale(m)) {
        const st = M.steps(), n = st.length;
        const pc = ((m - M.root) % 12 + 12) % 12, i = st.indexOf(pc);
        const base = m - pc; // tonique juste en dessous (ou égale)
        const deg = (k) => base + st[(i + k) % n] + 12 * Math.floor((i + k) / n);
        return [m, deg(2), deg(4)];
      }
      return [m, m + 4, m + 7];
    },

    label(x, y) { return M.name(this.midiAt(x, y), M.isRoot(this.midiAt(x, y))); },

    render(fb) {
      const active = new Set();
      this.held.forEach((h) => h.midis.forEach((m) => active.add(m)));
      const pc = A.PRESETS[this.preset].color;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const m = this.midiAt(x, y);
        let c;
        if (active.has(m)) c = [255, 255, 255];
        else if (M.isRoot(m)) c = pc;
        else if (this.layout === 'chroma') c = M.inScale(m) ? [45, 45, 55] : [0, 0, 0];
        else c = U.scale(pc, 0.1);
        fb.set(x, y, c);
      }
      fb.button('top', 0, [90, 90, 90]); fb.button('top', 1, [90, 90, 90]);
      fb.button('top', 2, [0, 70, 120]); fb.button('top', 3, [0, 70, 120]);
      fb.button('top', 4, this.layout === 'scale' ? [255, 255, 255] : [140, 0, 255]);
      fb.button('top', 5, this.chords ? [255, 200, 0] : [30, 25, 0]);
      A.PRESET_IDS.forEach((id, i) => fb.button('right', i, id === this.preset ? A.PRESETS[id].color : U.scale(A.PRESETS[id].color, 0.12)));
      fb.setLogo(pc);
    },

    onPad(x, y, v, down) {
      const k = x + ',' + y;
      if (down) {
        if (this.held.has(k)) this.held.get(k).voices.forEach((vv) => A.noteOff(vv));
        const midis = this.notesAt(x, y);
        const vel = this.api.vel(v) * (midis.length > 1 ? 0.7 : 1);
        this.held.set(k, { midis, voices: midis.map((m) => A.noteOn(m, vel, this.preset)) });
      } else {
        const h = this.held.get(k);
        if (h) { h.voices.forEach((vv) => A.noteOff(vv)); this.held.delete(k); }
      }
    },

    onButton(side, i, down) {
      if (!down) return;
      if (side === 'top') {
        if (i === 0) this.setOctave(this.octave + 1);
        else if (i === 1) this.setOctave(this.octave - 1);
        else if (i === 2 || i === 3) {
          const ids = M.scaleIds, k = ids.indexOf(M.scale);
          M.set(null, ids[(k + (i === 2 ? -1 : 1) + ids.length) % ids.length]);
          this.api.toast('Gamme : ' + M.SCALES[M.scale].name);
        } else if (i === 4) this.setLayout(this.layout === 'scale' ? 'chroma' : 'scale');
        else if (i === 5) { this.chords = !this.chords; U.store.set('keys.chords', this.chords); this.api.refresh(); }
      } else if (side === 'right') this.setPreset(A.PRESET_IDS[i]);
      this.hud();
    },

    setOctave(o) { this.stop(); this.octave = U.clamp(o, 0, 6); U.store.set('keys.octave', this.octave); this.api.refresh(); },
    setLayout(l) { this.stop(); this.layout = l; U.store.set('keys.layout', l); this.api.refresh(); },
    setPreset(p) {
      if (!p) return;
      this.preset = p; U.store.set('keys.preset', p);
      A.play(this.midiAt(0, 7), 0.25, 0.7, p);
      this.api.refresh();
    },

    panel(el, api) {
      el.append(api.ui.select('Son', A.PRESET_IDS.map((id) => ({ value: id, label: A.PRESETS[id].name })), this.preset, (v) => this.setPreset(v)));
      el.append(api.ui.select('Note de base', M.NOTE_NAMES.map((n, i) => ({ value: i, label: n })), M.root, (v) => M.set(parseInt(v, 10))));
      el.append(api.ui.select('Gamme', M.scaleIds.map((id) => ({ value: id, label: M.SCALES[id].name })), M.scale, (v) => M.set(null, v)));
      el.append(api.ui.seg('Disposition', [{ value: 'scale', label: 'Gamme' }, { value: 'chroma', label: 'Chromatique' }], this.layout, (v) => this.setLayout(v)));
      el.append(api.ui.seg('Octave', [0, 1, 2, 3, 4, 5, 6].map((o) => ({ value: o, label: String(o) })), this.octave, (v) => this.setOctave(v)));
      el.append(api.ui.toggle('Mode accords (3 notes par pad)', this.chords, (v) => { this.chords = v; U.store.set('keys.chords', v); this.hud(); }));
      el.append(api.ui.range('Réverbération', 0, 1, 0.05, A.reverbLevel, (v) => A.setReverb(v), (v) => Math.round(v * 100) + ' %'));
      el.append(api.ui.range('Écho', 0, 1, 0.05, A.delayLevel, (v) => A.setDelay(v), (v) => Math.round(v * 100) + ' %'));
      el.append(api.ui.note('La tonalité est partagée avec le séquenceur mélodique : lance une mélodie et improvise par-dessus.'));
    }
  });
})(window.LP);
