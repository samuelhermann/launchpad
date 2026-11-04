/* Séquenceur mélodique : colonnes = temps, lignes = notes de la gamme. 2 pistes (mélodie + basse). */
(function (LP) {
  'use strict';
  const U = LP.U;
  const T = LP.transport, A = LP.audio, M = LP.music;
  const HUES = [[190, 22], [0, 6]]; // teinte de départ et pas par ligne, pour chaque piste

  LP.apps.register({
    id: 'melody', name: 'Séquenceur mélodique', cat: 'musique', emoji: '🎼', color: [0, 220, 220],
    short: 'Dessine une mélodie qui tourne en boucle',
    icon: [[0, 220, 220], [0, 120, 160], [160, 60, 255], [0, 220, 220]],
    desc: 'Chaque colonne est un temps, chaque ligne une note de la gamme (la plus grave en bas). Dessine une mélodie : elle tourne en boucle, en rythme avec la boîte à rythmes. Deux pistes : Mélodie et Basse.',
    help: [
      ['Pads', 'Ajouter / enlever une note'],
      ['Haut 1', 'Lecture / stop (ou Espace)'],
      ['Haut 2 / 3', 'Page pas 1–8 / 9–16'],
      ['Haut 4', 'Copier la page 1 sur la page 2'],
      ['Haut 5 / 6', 'Octave − / +'],
      ['Haut 7', 'Effacer la piste (2 fois)'],
      ['Colonne droite 1 / 2', 'Piste Mélodie / Basse'],
      ['Colonne droite 4 / 5', 'Couper Mélodie / Basse']
    ],
    buttons: { top: ['▶', 'P1', 'P2', '⧉', 'O−', 'O+', '✕'], right: ['Mél.', 'Basse', '', 'M1', 'M2'] },

    start(api) {
      this.api = api;
      this.track = 0;
      this.page = 0;
      this.clearArm = 0;
      this.offM = this.offM || M.on('change', () => { if (LP.core.current === this) this.api.refresh(); });
      this.hud();
    },

    get trk() { return T.melody.tracks[this.track]; },

    hud() {
      const tr = this.trk;
      this.api.hud({ Piste: tr.name, Son: A.PRESETS[tr.preset].name, Octave: tr.octave, Tonalité: M.NOTE_NAMES[M.root] + ' ' + M.SCALES[M.scale].name, Tempo: T.bpm + ' BPM' },
        T.playing ? '' : 'Dessine des notes puis appuie sur ▶ (ou Espace).');
    },

    label(x, y) { return x === 0 ? M.name(M.midiFor(7 - y, this.trk.octave)) : ''; },

    rowColor(deg) { const [h0, step] = HUES[this.track]; return U.hsv(h0 + deg * step, 1, 1); },

    update(dt) { if (this.clearArm > 0) this.clearArm -= dt; },

    render(fb, t) {
      const cur = T.currentStep();
      const tr = this.trk;
      for (let y = 0; y < 8; y++) {
        const deg = 7 - y;
        const col = this.rowColor(deg);
        const isRoot = deg % M.steps().length === 0;
        for (let x = 0; x < 8; x++) {
          const s = this.page * 8 + x;
          const on = tr.pattern[deg][s];
          let c;
          if (on) c = s === cur ? [255, 255, 255] : (tr.mute ? U.scale(col, 0.2) : col);
          else if (s === cur) c = [40, 40, 40];
          else c = isRoot ? U.scale(col, 0.09) : (x % 4 === 0 ? [8, 8, 10] : [0, 0, 0]);
          fb.set(x, y, c);
        }
      }
      fb.button('top', 0, T.playing ? [0, 255, 0] : [0, 50, 0]);
      const playPage = cur >= 0 ? Math.floor(cur / 8) : -1;
      for (let p = 0; p < 2; p++) {
        let c = p === this.page ? [0, 120, 255] : [0, 15, 40];
        if (playPage === p && Math.floor(t * 8) % 2) c = U.add(c, [60, 60, 60]);
        fb.button('top', 1 + p, c);
      }
      fb.button('top', 3, [80, 0, 160]);
      fb.button('top', 4, [90, 90, 90]); fb.button('top', 5, [90, 90, 90]);
      fb.button('top', 6, this.clearArm > 0 ? (Math.floor(t * 10) % 2 ? [255, 0, 0] : [60, 0, 0]) : [60, 0, 0]);
      for (let i = 0; i < 2; i++) {
        const c = U.hsv(HUES[i][0], 1, 1);
        fb.button('right', i, i === this.track ? c : U.scale(c, 0.12));
        fb.button('right', 3 + i, T.melody.tracks[i].mute ? [40, 0, 0] : [0, 120, 0]);
      }
      fb.setLogo(this.rowColor(0));
    },

    onPad(x, y, v, down) {
      if (!down) return;
      const deg = 7 - y, s = this.page * 8 + x;
      const row = this.trk.pattern[deg];
      row[s] = row[s] ? 0 : 1;
      if (row[s]) A.play(M.midiFor(deg, this.trk.octave), 0.25, 0.7, this.trk.preset);
      T.save();
    },

    onButton(side, i, down) {
      if (!down) return;
      const tr = this.trk;
      if (side === 'top') {
        if (i === 0) T.toggle();
        else if (i === 1 || i === 2) this.page = i - 1;
        else if (i === 3) { for (let d = 0; d < 8; d++) for (let s = 0; s < 8; s++) tr.pattern[d][s + 8] = tr.pattern[d][s]; T.save(); this.api.toast('Page 1 copiée sur la page 2'); }
        else if (i === 4) this.setOctave(tr.octave - 1);
        else if (i === 5) this.setOctave(tr.octave + 1);
        else if (i === 6) { if (this.clearArm > 0) { this.clear(); this.clearArm = 0; } else this.clearArm = 1.2; }
      } else if (side === 'right') {
        if (i < 2) { this.track = i; this.api.refresh(); }
        if (i === 3 || i === 4) { T.melody.tracks[i - 3].mute = !T.melody.tracks[i - 3].mute; T.save(); }
      }
      this.hud();
    },

    setOctave(o) { this.trk.octave = U.clamp(o, 0, 7); T.save(); this.api.refresh(); },
    clear() { this.trk.pattern = T.blank(); T.save(); this.api.toast('Piste effacée'); },

    random() {
      const p = T.blank();
      let deg = U.rand(5);
      for (let s = 0; s < 16; s++) {
        if (Math.random() < (this.track === 1 ? 0.35 : 0.6)) {
          deg = U.clamp(deg + U.randInt(-2, 2), 0, 7);
          p[deg][s] = 1;
        }
      }
      if (this.track === 1) p[0][0] = 1;
      this.trk.pattern = p; T.save();
      if (!T.playing) T.start();
    },

    onKey(e, down) { if (down && e.key === ' ') { T.toggle(); this.hud(); return true; } return false; },

    panel(el, api) {
      const tr = this.trk;
      el.append(api.ui.seg('Piste', T.melody.tracks.map((t, i) => ({ value: i, label: t.name })), this.track, (v) => { this.track = v; api.refresh(); }));
      el.append(api.ui.select('Son de la piste', A.PRESET_IDS.map((id) => ({ value: id, label: A.PRESETS[id].name })), tr.preset, (v) => { tr.preset = v; T.save(); this.hud(); }));
      el.append(api.ui.seg('Octave', [0, 1, 2, 3, 4, 5, 6].map((o) => ({ value: o, label: String(o) })), tr.octave, (v) => this.setOctave(v)));
      el.append(api.ui.select('Note de base', M.NOTE_NAMES.map((n, i) => ({ value: i, label: n })), M.root, (v) => M.set(parseInt(v, 10))));
      el.append(api.ui.select('Gamme', M.scaleIds.map((id) => ({ value: id, label: M.SCALES[id].name })), M.scale, (v) => M.set(null, v)));
      el.append(api.ui.range('Tempo', 50, 200, 1, T.bpm, (v) => { T.setBpm(v); this.hud(); }, (v) => v + ' BPM'));
      el.append(api.ui.buttons([
        { label: T.playing ? '■ Stop' : '▶ Lecture', onClick: () => { T.toggle(); this.hud(); api.refresh(); } },
        { label: '🎲 Mélodie aléatoire', cls: 'ghost', onClick: () => this.random() },
        { label: 'Effacer la piste', cls: 'ghost', onClick: () => this.clear() }
      ]));
      el.append(api.ui.note('Astuce : la gamme pentatonique sonne toujours bien, même en plaçant des notes au hasard.'));
    }
  });
})(window.LP);
