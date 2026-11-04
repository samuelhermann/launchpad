/* Boîte à rythmes : 8 instruments x 16 pas (2 pages de 8). */
(function (LP) {
  'use strict';
  const U = LP.U;
  const T = LP.transport, A = LP.audio;

  // Une ligne par instrument : x = coup, . = silence
  const PRESETS = {
    rock: { name: 'Rock', bpm: 112, p: ['x.......x.x.....', '....x.......x...', '', 'x.x.x.x.x.x.x.x.', '', '', '', ''] },
    house: { name: 'House', bpm: 124, p: ['x...x...x...x...', '', '....x.......x...', 'x.x.x.x.x.x.x.x.', '..x...x...x...x.', '', '', '......x.......x.'] },
    hiphop: { name: 'Hip-hop', bpm: 90, p: ['x......x.x......', '....x.......x...', '', 'x.x.x.x.x.x.x.xx', '', '', '', ''] },
    funk: { name: 'Funk', bpm: 100, p: ['x..x..x...x..x..', '....x..x.x..x...', '', 'xxxxxxxxxxxxxxxx', '..............x.', '', '', ''] },
    dembow: { name: 'Reggaeton', bpm: 95, p: ['x...x...x...x...', '...x..x....x..x.', '', 'x.x.x.x.x.x.x.x.', '', '', '..........x.....', ''] },
    disco: { name: 'Disco', bpm: 118, p: ['x...x...x...x...', '....x.......x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', '..x...x...x...x.', '', '', 'x.......x.......'] },
    breakbeat: { name: 'Breakbeat', bpm: 130, p: ['x.........x.....', '....x..x.x..x..x', '', 'x.x.x.x.x.x.x.x.', '', '.............x..', '............x...', ''] }
  };

  LP.apps.register({
    id: 'drums', name: 'Boîte à rythmes', cat: 'musique', emoji: '🥁', color: [255, 60, 0],
    short: '8 instruments, 16 pas, tempo réglable',
    icon: [[255, 30, 0], [255, 130, 0], [110, 255, 0], [255, 30, 0]],
    desc: 'Chaque ligne est un instrument, chaque colonne un temps (16 pas sur 2 pages). Allume des pads pour créer ton rythme. Il continue de jouer quand tu changes d’appli !',
    help: [
      ['Pads', 'Allumer / éteindre un coup'],
      ['Haut 1', 'Lecture / stop (ou Espace)'],
      ['Haut 2 / 3', 'Page pas 1–8 / 9–16'],
      ['Haut 4', 'Suivre la tête de lecture'],
      ['Haut 5 / 6', 'Tempo − / +'],
      ['Haut 7', 'Effacer (appuyer 2 fois)'],
      ['Colonne droite', 'Couper / remettre un instrument']
    ],
    buttons: { top: ['▶', 'P1', 'P2', '⇥', '−', '+', '✕'], right: A.DRUMS.map((d) => d.short) },

    start(api) {
      this.api = api;
      this.page = 0;
      this.follow = U.store.get('drums.follow', false);
      this.clearArm = 0;
      this.hud();
    },

    hud() {
      this.api.hud({ Tempo: T.bpm + ' BPM', Page: this.page === 0 ? '1–8' : '9–16', Lecture: T.playing ? '▶' : '■' }, T.playing ? '' : 'Appuie sur ▶ (haut gauche) ou Espace pour lancer le rythme.');
    },

    label(x, y) { return x === 0 ? A.DRUMS[y].short : ''; },

    toggleStep(tr, step, vel) {
      const p = T.drums.pattern[tr];
      const m = LP.launchpad.model;
      p[step] = p[step] ? 0 : (vel > 110 && m && m.velocity ? 2 : 1);
      if (p[step] && !T.playing) A.drum(tr, 0, T.drums.vol[tr]);
      T.save();
    },

    update(dt) {
      if (this.clearArm > 0) this.clearArm -= dt;
      if (this.follow && T.playing) {
        const s = T.currentStep();
        if (s >= 0) this.page = Math.floor(s / 8);
      }
    },

    render(fb, t) {
      const cur = T.currentStep();
      const d = T.drums;
      for (let y = 0; y < 8; y++) {
        const col = A.DRUMS[y].color;
        for (let x = 0; x < 8; x++) {
          const s = this.page * 8 + x;
          const on = d.pattern[y][s];
          const muted = d.mute[y];
          let c;
          if (on) {
            c = muted ? U.scale(col, 0.15) : (on === 2 ? col : U.scale(col, 0.75));
            if (s === cur && !muted) c = U.mix(col, [255, 255, 255], 0.7);
          } else if (s === cur) c = [45, 45, 45];
          else c = x % 4 === 0 ? U.scale(col, 0.07) : [0, 0, 0];
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
      fb.button('top', 3, this.follow ? [255, 255, 255] : [25, 25, 25]);
      fb.button('top', 4, [120, 50, 0]);
      fb.button('top', 5, [255, 110, 0]);
      fb.button('top', 6, this.clearArm > 0 ? (Math.floor(t * 10) % 2 ? [255, 0, 0] : [60, 0, 0]) : [60, 0, 0]);
      for (let i = 0; i < 8; i++) fb.button('right', i, d.mute[i] ? [25, 0, 0] : U.scale(A.DRUMS[i].color, 0.6));
      if (cur >= 0 && cur % 4 === 0) fb.setLogo([255, 255, 255]); else fb.setLogo([0, 0, 0]);
    },

    onPad(x, y, v, down) { if (down) this.toggleStep(y, this.page * 8 + x, v); },

    onButton(side, i, down) {
      if (!down) return;
      if (side === 'top') {
        if (i === 0) T.toggle();
        else if (i === 1 || i === 2) { this.page = i - 1; this.follow = false; }
        else if (i === 3) { this.follow = !this.follow; U.store.set('drums.follow', this.follow); }
        else if (i === 4) T.setBpm(T.bpm - 2);
        else if (i === 5) T.setBpm(T.bpm + 2);
        else if (i === 6) {
          if (this.clearArm > 0) { this.clear(); this.clearArm = 0; } else this.clearArm = 1.2;
        }
        this.hud();
        if (i === 4 || i === 5 || i === 0) this.api.refresh();
      } else if (side === 'right') {
        T.drums.mute[i] = !T.drums.mute[i];
        if (!T.drums.mute[i] && !T.playing) A.drum(i, 0, T.drums.vol[i]);
        T.save();
      }
    },

    clear() { T.drums.pattern = T.blank(); T.save(); this.api.toast('Rythme effacé'); },

    loadPreset(id) {
      const pr = PRESETS[id];
      if (!pr) return;
      T.drums.pattern = T.blank();
      pr.p.forEach((row, tr) => { for (let s = 0; s < 16; s++) if (row[s] === 'x') T.drums.pattern[tr][s] = 1; });
      T.drums.pattern[0][0] = 2;
      T.setBpm(pr.bpm);
      T.save();
      if (!T.playing) T.start();
      this.api.refresh();
    },

    random() {
      const p = T.blank();
      const dens = [0.25, 0.18, 0.08, 0.6, 0.1, 0.07, 0.07, 0.06];
      for (let tr = 0; tr < 8; tr++) for (let s = 0; s < 16; s++) if (Math.random() < dens[tr]) p[tr][s] = 1;
      p[0][0] = 2; p[1][4] = 1; p[1][12] = 1;
      T.drums.pattern = p; T.save();
    },

    onKey(e, down) { if (down && e.key === ' ') { T.toggle(); this.hud(); this.api.refresh(); return true; } return false; },

    panel(el, api) {
      el.append(api.ui.buttons([{ label: T.playing ? '■ Stop' : '▶ Lecture', onClick: () => { T.toggle(); this.hud(); api.refresh(); } }]));
      el.append(api.ui.range('Tempo', 50, 200, 1, T.bpm, (v) => { T.setBpm(v); this.hud(); }, (v) => v + ' BPM'));
      el.append(api.ui.range('Swing', 0, 0.7, 0.05, T.swing, (v) => T.setSwing(v), (v) => Math.round(v * 100) + ' %'));
      el.append(api.ui.select('Rythmes tout prêts', [{ value: '', label: '— Choisir —' }].concat(Object.keys(PRESETS).map((k) => ({ value: k, label: PRESETS[k].name }))), '', (v) => this.loadPreset(v)));
      el.append(api.ui.buttons([
        { label: '🎲 Aléatoire', cls: 'ghost', onClick: () => this.random() },
        { label: 'Effacer', cls: 'ghost', onClick: () => this.clear() }
      ]));
      const vols = U.h('div', null);
      A.DRUMS.forEach((d, i) => vols.append(api.ui.range(d.name, 0, 1, 0.05, T.drums.vol[i], (v) => { T.drums.vol[i] = v; T.save(); }, (v) => Math.round(v * 100) + ' %')));
      el.append(U.h('h3', null, 'Volume par instrument'));
      el.append(vols);
      el.append(api.ui.note('Astuce : un pad frappé fort (Launchpad X / Pro) crée un coup accentué, plus lumineux.'));
    }
  });
})(window.LP);
