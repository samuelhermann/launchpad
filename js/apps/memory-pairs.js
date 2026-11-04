/* Mémoire : retrouver les paires cachées (couleurs ou sons). */
(function (LP) {
  'use strict';
  const U = LP.U;
  const SIZES = [{ w: 4, h: 4, name: '4×4' }, { w: 6, h: 4, name: '6×4' }, { w: 6, h: 6, name: '6×6' }];
  const PAL = [
    [255, 0, 0], [255, 110, 0], [255, 230, 0], [110, 255, 0], [0, 255, 60], [0, 255, 210],
    [0, 160, 255], [0, 30, 255], [140, 0, 255], [255, 0, 255], [255, 0, 90], [255, 255, 255],
    [255, 170, 110], [150, 120, 255], [120, 255, 170], [140, 50, 0], [0, 90, 70], [255, 130, 210]
  ];
  const PENTA = [0, 2, 4, 7, 9];
  const HIDDEN = [22, 22, 36];

  LP.apps.register({
    id: 'mempairs', name: 'Mémoire : paires', cat: 'jeu', emoji: '🃏', color: [160, 60, 255],
    short: 'Retrouve les paires de couleurs ou de sons',
    icon: [[160, 60, 255], HIDDEN, HIDDEN, [160, 60, 255]],
    desc: 'Retourne deux pads à la fois pour trouver les paires identiques. En mode « Sons », toutes les cartes s’allument en blanc : il faut retrouver les paires à l’oreille !',
    help: [
      ['Toucher un pad gris', 'Le retourner'],
      ['Colonne droite 1–3', 'Taille : 4×4, 6×4, 6×6'],
      ['Colonne droite 5–6', 'Mode couleurs / mode sons']
    ],
    buttons: { right: ['4×4', '6×4', '6×6', '', '🎨', '🎵', '', ''] },

    start(api) {
      this.api = api;
      this.size = U.store.get('mempairs.size', 0);
      this.mode = U.store.get('mempairs.mode', 'colors');
      this.newGame();
    },

    key() { return 'mempairs.' + this.size + '.' + this.mode; },

    newGame() {
      const s = SIZES[this.size];
      this.w = s.w; this.h = s.h;
      this.ox = (8 - s.w) / 2; this.oy = (8 - s.h) / 2;
      const ids = [];
      for (let i = 0; i < s.w * s.h / 2; i++) ids.push(i, i);
      U.shuffle(ids);
      this.cards = ids.map((id) => ({ id, state: 'hidden', flash: 0 }));
      this.open = [];
      this.moves = 0; this.found = 0; this.lock = 0;
      this.t0 = null; this.elapsed = 0;
      this.state = 'play';
      this.hud();
    },

    hud() {
      const best = this.api.best(this.key(), undefined, true);
      this.api.hud({ Coups: this.moves, Paires: this.found + '/' + (this.cards.length / 2), Temps: U.fmtTime(this.elapsed), Record: best ? best + ' coups' : '–' },
        this.state === 'done' ? 'Gagné !' : (this.moves === 0 ? 'Touche deux pads pour les retourner.' : ''));
    },

    pairColor(id) { return PAL[id % PAL.length]; },
    note(id) { return 52 + PENTA[id % 5] + 12 * Math.floor(id / 5); },

    cardAt(x, y) {
      const cx = x - this.ox, cy = y - this.oy;
      if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return null;
      return this.cards[cy * this.w + cx];
    },

    hideOpen() { this.open.forEach((c) => { c.state = 'hidden'; }); this.open = []; this.lock = 0; },

    onPad(x, y, v, down) {
      if (!down || this.state !== 'play') return;
      const c = this.cardAt(x, y);
      if (!c || c.state !== 'hidden') return;
      if (this.lock > 0) this.hideOpen();
      if (this.t0 === null) this.t0 = U.now();
      c.state = 'shown';
      this.open.push(c);
      LP.audio.sfx.note(this.note(c.id), 0.5, 'epiano', 0.8);
      if (this.open.length === 2) {
        this.moves++;
        const [a, b] = this.open;
        if (a.id === b.id) {
          a.state = b.state = 'matched'; a.flash = b.flash = 0.6;
          this.open = []; this.found++;
          setTimeout(() => LP.audio.sfx.eat(), 180);
          if (this.found === this.cards.length / 2) this.win();
        } else this.lock = 1.1;
      }
      this.hud();
    },

    win() {
      this.state = 'done';
      this.api.best(this.key(), this.moves, true);
      this.winT = 0;
      setTimeout(() => LP.audio.sfx.win(), 300);
      this.hud();
    },

    update(dt) {
      if (this.lock > 0) { this.lock -= dt; if (this.lock <= 0) this.hideOpen(); }
      this.cards.forEach((c) => { if (c.flash > 0) c.flash -= dt; });
      if (this.t0 !== null && this.state === 'play') {
        const e = U.now() - this.t0;
        if (Math.floor(e) !== Math.floor(this.elapsed)) { this.elapsed = e; this.hud(); } else this.elapsed = e;
      }
      if (this.state === 'done') {
        this.winT += dt;
        if (this.winT > 2.2 && !this.texted) {
          this.texted = true;
          this.api.text('BRAVO ' + this.moves + ' COUPS', (x, y, i) => U.hsv(i * 15, 1, 1), { onDone: () => { this.texted = false; this.newGame(); } });
        }
      }
    },

    render(fb, t) {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const c = this.cardAt(x, y);
        if (!c) continue;
        const col = this.pairColor(c.id);
        let out;
        if (c.state === 'hidden') out = HIDDEN;
        else if (c.state === 'shown') out = this.mode === 'sounds' ? [255, 255, 255] : col;
        else {
          out = U.scale(col, this.mode === 'sounds' ? 0.55 : 0.28);
          if (c.flash > 0) out = U.mix(out, [255, 255, 255], c.flash / 0.6);
        }
        if (this.state === 'done') out = U.hsv((x + y) * 30 + t * 240, 1, 0.9);
        fb.set(x, y, out);
      }
      SIZES.forEach((s, i) => fb.button('right', i, i === this.size ? [255, 255, 255] : [30, 30, 30]));
      fb.button('right', 4, this.mode === 'colors' ? [255, 0, 200] : [40, 0, 30]);
      fb.button('right', 5, this.mode === 'sounds' ? [0, 200, 255] : [0, 30, 40]);
    },

    onButton(side, i, down) {
      if (!down || side !== 'right') return;
      if (i < 3) this.setSize(i);
      else if (i === 4) this.setMode('colors');
      else if (i === 5) this.setMode('sounds');
    },

    setSize(i) { this.size = i; U.store.set('mempairs.size', i); this.newGame(); this.api.refresh(); },
    setMode(m) { this.mode = m; U.store.set('mempairs.mode', m); this.newGame(); this.api.refresh(); },

    panel(el, api) {
      el.append(api.ui.seg('Taille', SIZES.map((s, i) => ({ value: i, label: s.name })), this.size, (v) => this.setSize(v)));
      el.append(api.ui.seg('Mode', [{ value: 'colors', label: '🎨 Couleurs' }, { value: 'sounds', label: '🎵 Sons' }], this.mode, (v) => this.setMode(v)));
      el.append(api.ui.buttons([{ label: 'Nouvelle partie', onClick: () => this.newGame() }]));
    }
  });
})(window.LP);
