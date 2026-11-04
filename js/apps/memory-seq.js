/* Mémoire : séquence de couleurs et de sons qui s'allonge à chaque tour. */
(function (LP) {
  'use strict';
  const U = LP.U;
  const MODES = [{ n: 2, name: '4 zones' }, { n: 4, name: '16 zones' }, { n: 8, name: '64 pads' }];
  const C4 = [[255, 0, 0], [0, 255, 0], [0, 70, 255], [255, 210, 0]];
  const PENTA = [0, 2, 4, 7, 9];

  LP.apps.register({
    id: 'memseq', name: 'Mémoire : séquence', cat: 'jeu', emoji: '🧠', color: [255, 60, 60],
    short: 'Répète la suite de couleurs qui s’allonge',
    icon: [C4[0], C4[1], C4[2], C4[3]],
    desc: 'Le Launchpad joue une suite de zones lumineuses avec des sons. Répète-la dans le même ordre : à chaque réussite, une couleur s’ajoute !',
    help: [
      ['Toucher un pad', 'Commencer / jouer la zone'],
      ['Colonne droite 1–3', 'Difficulté : 4 zones, 16 zones, 64 pads'],
      ['Colonne droite 8', 'Réécouter la séquence (pendant ton tour)']
    ],
    buttons: { right: ['4', '16', '64', '', '', '', '', '↻'] },

    start(api) {
      this.api = api;
      this.mode = U.store.get('memseq.mode', 0);
      this.reset();
    },

    get n() { return MODES[this.mode].n; },

    reset() { this.seq = []; this.state = 'ready'; this.lit = {}; this.timer = 0; this.wrong = -1; this.hud(); },

    hud() {
      const lvl = Math.max(0, this.seq.length - (this.state === 'input' || this.state === 'show' ? 1 : 0));
      const msg = { ready: 'Touche un pad pour commencer.', show: 'Regarde et écoute…', input: 'À toi ! Répète la séquence.', success: 'Bravo !', fail: 'Raté…' }[this.state] || '';
      this.api.hud({ Niveau: lvl, Record: this.api.best('memseq.' + this.mode) || 0, Mode: MODES[this.mode].name }, msg);
    },

    zoneOf(x, y) { const s = 8 / this.n; return Math.floor(y / s) * this.n + Math.floor(x / s); },
    zoneColor(z) {
      const n = this.n;
      if (n === 2) return C4[z];
      if (n === 4) return U.hsv(z * 360 / 16 * 5, 1, 1); // mélange pour que les voisines diffèrent
      const x = z % 8, y = Math.floor(z / 8);
      return U.hsv(x * 45 + y * 17, 1 - (y % 2) * 0.25, 1);
    },
    zoneNote(z) {
      const n = this.n;
      if (n === 2) return [64, 69, 73, 76][z];
      let i;
      if (n === 4) i = z;
      else { const x = z % 8, y = Math.floor(z / 8); i = x + (7 - y); }
      return 55 + PENTA[i % 5] + 12 * Math.floor(i / 5);
    },

    flashZone(z, dur) { this.lit[z] = dur; LP.audio.sfx.note(this.zoneNote(z), Math.max(0.2, dur), 'bell', 0.8); },

    begin() { this.seq = [U.rand(this.n * this.n)]; this.playback(); },
    addStep() {
      let z;
      do { z = U.rand(this.n * this.n); } while (this.seq.length >= 2 && z === this.seq[this.seq.length - 1] && z === this.seq[this.seq.length - 2]);
      this.seq.push(z);
    },
    playback() { this.state = 'show'; this.showI = 0; this.timer = 0.7; this.hud(); },

    update(dt) {
      for (const z in this.lit) { this.lit[z] -= dt; if (this.lit[z] <= 0) delete this.lit[z]; }
      if (this.state === 'show') {
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.showI >= this.seq.length) { this.state = 'input'; this.inputI = 0; this.hud(); return; }
          const on = Math.max(0.2, 0.5 - this.seq.length * 0.018);
          this.flashZone(this.seq[this.showI++], on);
          this.timer = on + 0.13;
        }
      } else if (this.state === 'success') {
        this.timer -= dt;
        if (this.timer <= 0) { this.addStep(); this.playback(); }
      } else if (this.state === 'fail') {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'over';
          const lvl = this.seq.length - 1;
          this.api.text('NIVEAU ' + lvl, [255, 120, 0], { onDone: () => this.reset() });
        }
      }
    },

    render(fb, t) {
      const fail = this.state === 'fail';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const z = this.zoneOf(x, y);
        const c = this.zoneColor(z);
        let k;
        if (this.lit[z] !== undefined) k = 1;
        else if (this.state === 'ready') k = 0.12 + 0.08 * Math.sin(t * 2 + z);
        else if (this.state === 'show') k = 0.05;
        else k = 0.13;
        let col = U.scale(c, k);
        if (fail) {
          if (z === this.wrong) col = Math.floor(t * 8) % 2 ? [255, 0, 0] : [40, 0, 0];
          else if (z === this.seq[this.inputI]) col = Math.floor(t * 4) % 2 ? c : U.scale(c, 0.2);
          else col = U.scale(c, 0.04);
        }
        if (this.state === 'success') col = U.add(col, U.scale([255, 255, 255], Math.max(0, this.timer - 0.4) * 0.4));
        fb.set(x, y, col);
      }
      MODES.forEach((m, i) => fb.button('right', i, i === this.mode ? [255, 255, 255] : [30, 30, 30]));
      if (this.state === 'input') fb.button('right', 7, [0, 120, 255]);
      fb.setLogo(this.zoneColor(Math.floor(t * 2) % (this.n * this.n)));
    },

    onPad(x, y, v, down) {
      if (!down) return;
      if (this.state === 'ready') { this.begin(); return; }
      if (this.state !== 'input') return;
      const z = this.zoneOf(x, y);
      if (z === this.seq[this.inputI]) {
        this.flashZone(z, 0.25);
        this.inputI++;
        if (this.inputI >= this.seq.length) {
          this.api.best('memseq.' + this.mode, this.seq.length);
          this.state = 'success'; this.timer = 0.9; this.hud();
        }
      } else {
        this.wrong = z;
        this.state = 'fail'; this.timer = 1.6;
        LP.audio.sfx.error();
        this.hud();
      }
    },

    onButton(side, i, down) {
      if (!down || side !== 'right') return;
      if (i < 3 && (this.state === 'ready' || this.state === 'over')) this.setMode(i);
      if (i === 7 && this.state === 'input') this.playback();
    },

    setMode(i) { this.mode = i; U.store.set('memseq.mode', i); this.reset(); this.api.refresh(); },

    panel(el, api) {
      el.append(api.ui.seg('Difficulté', MODES.map((m, i) => ({ value: i, label: m.name })), this.mode, (v) => this.setMode(v)));
      el.append(api.ui.buttons([{ label: 'Nouvelle partie', onClick: () => this.reset() }]));
    }
  });
})(window.LP);
