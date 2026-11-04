/* Éteins-tout : chaque pad inverse lui-même et ses 4 voisins. */
(function (LP) {
  'use strict';
  const U = LP.U;
  const SIZES = [5, 6, 8];
  const ON = [255, 150, 0];
  const OFFC = [0, 0, 26];

  /* Résolution par élimination de Gauss sur GF(2) */
  function solve(n, lights) {
    const N = n * n;
    const M = [];
    for (let i = 0; i < N; i++) {
      const row = new Uint8Array(N + 1);
      const x = i % n, y = Math.floor(i / n);
      row[i] = 1;
      if (x > 0) row[i - 1] = 1;
      if (x < n - 1) row[i + 1] = 1;
      if (y > 0) row[i - n] = 1;
      if (y < n - 1) row[i + n] = 1;
      row[N] = lights[i] ? 1 : 0;
      M.push(row);
    }
    const where = new Int32Array(N).fill(-1);
    let r = 0;
    for (let c = 0; c < N && r < N; c++) {
      let p = -1;
      for (let i = r; i < N; i++) if (M[i][c]) { p = i; break; }
      if (p < 0) continue;
      const tmp = M[p]; M[p] = M[r]; M[r] = tmp;
      where[c] = r;
      for (let i = 0; i < N; i++) if (i !== r && M[i][c]) for (let k = c; k <= N; k++) M[i][k] ^= M[r][k];
      r++;
    }
    const x = new Uint8Array(N);
    for (let c = 0; c < N; c++) if (where[c] >= 0) x[c] = M[where[c]][N];
    return x;
  }

  LP.apps.register({
    id: 'lightsout', name: 'Éteins-tout', cat: 'jeu', emoji: '💡', color: [255, 150, 0],
    short: 'Puzzle : éteins toutes les lumières',
    icon: [ON, OFFC, OFFC, ON],
    desc: 'Toucher un pad inverse sa lumière et celles de ses 4 voisins (haut, bas, gauche, droite). Le but : tout éteindre, en un minimum de coups. Chaque niveau est un peu plus mélangé.',
    help: [
      ['Toucher un pad', 'Inverser la croix'],
      ['Colonne droite 1', 'Indice (montre un bon coup)'],
      ['Colonne droite 3–5', 'Taille 5×5, 6×6, 8×8'],
      ['Colonne droite 8', 'Recommencer le niveau']
    ],
    buttons: { right: ['?', '', '5', '6', '8', '', '', '↻'] },

    start(api) {
      this.api = api;
      this.sizeI = U.store.get('lo.size', 0);
      this.level = U.store.get('lo.level.' + this.sizeI, 1);
      this.newLevel();
    },

    get n() { return SIZES[this.sizeI]; },

    newLevel() {
      const n = this.n, N = n * n;
      this.ox = Math.floor((8 - n) / 2); this.oy = Math.floor((8 - n) / 2);
      this.lights = new Uint8Array(N);
      const presses = Math.min(N, 2 + this.level * 2);
      const cells = U.shuffle([...Array(N).keys()]).slice(0, presses);
      for (const c of cells) this.toggle(c % n, Math.floor(c / n), true);
      if (!this.lights.some((v) => v)) this.toggle(Math.floor(n / 2), Math.floor(n / 2), true);
      this.start0 = this.lights.slice();
      this.par = presses;
      this.moves = 0; this.hints = 0; this.hint = null;
      this.state = 'intro'; this.introT = 0;
      this.hud();
    },

    restart() { this.lights = this.start0.slice(); this.moves = 0; this.hint = null; this.state = 'play'; this.hud(); },

    hud() {
      this.api.hud({ Niveau: this.level, Coups: this.moves, Objectif: '≤ ' + this.par, Indices: this.hints, Taille: this.n + '×' + this.n },
        this.state === 'win' ? 'Bravo, tout est éteint !' : 'Éteins toutes les lumières orange.');
    },

    toggle(x, y, silent) {
      const n = this.n;
      const flip = (i, j) => { if (i >= 0 && j >= 0 && i < n && j < n) this.lights[j * n + i] ^= 1; };
      flip(x, y); flip(x - 1, y); flip(x + 1, y); flip(x, y - 1); flip(x, y + 1);
      if (!silent) LP.audio.sfx.tone(this.lights[y * n + x] ? 660 : 440, 0.06, 'triangle', 0.18);
    },

    onPad(x, y, v, down) {
      if (!down) return;
      if (this.state === 'intro') { this.state = 'play'; return; }
      if (this.state !== 'play') return;
      const cx = x - this.ox, cy = y - this.oy;
      if (cx < 0 || cy < 0 || cx >= this.n || cy >= this.n) return;
      this.toggle(cx, cy);
      this.moves++;
      this.hint = null;
      if (!this.lights.some((l) => l)) {
        this.state = 'win'; this.winT = 0;
        LP.audio.sfx.win();
        this.api.best('lightsout.' + this.n, this.level);
      }
      this.hud();
    },

    showHint() {
      if (this.state !== 'play') return;
      const sol = solve(this.n, this.lights);
      const idx = [];
      sol.forEach((v, i) => { if (v) idx.push(i); });
      if (!idx.length) return;
      const i = U.choice(idx);
      this.hint = { x: i % this.n, y: Math.floor(i / this.n), t: 0 };
      this.hints++;
      this.hud();
    },

    update(dt) {
      if (this.state === 'intro') { this.introT += dt; if (this.introT > 1.2) this.state = 'play'; }
      if (this.hint) { this.hint.t += dt; if (this.hint.t > 3) this.hint = null; }
      if (this.state === 'win') {
        this.winT += dt;
        if (this.winT > 1.8) { this.level++; U.store.set('lo.level.' + this.sizeI, this.level); this.newLevel(); }
      }
    },

    render(fb, t) {
      if (this.state === 'intro') { LP.font.digits(fb, this.level, ON, 1); return; }
      const n = this.n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        let c = this.lights[y * n + x] ? ON : OFFC;
        if (this.state === 'win') c = U.hsv((x + y) * 40 - t * 300, 1, Math.max(0, 1 - this.winT / 1.8));
        if (this.hint && this.hint.x === x && this.hint.y === y && Math.floor(t * 6) % 2) c = [0, 220, 255];
        fb.set(this.ox + x, this.oy + y, c);
      }
      fb.button('right', 0, [0, 160, 255]);
      SIZES.forEach((s, i) => fb.button('right', 2 + i, i === this.sizeI ? [255, 255, 255] : [30, 30, 30]));
      fb.button('right', 7, [255, 60, 0]);
    },

    onButton(side, i, down) {
      if (!down || side !== 'right') return;
      if (i === 0) this.showHint();
      if (i >= 2 && i <= 4) this.setSize(i - 2);
      if (i === 7) this.restart();
    },

    setSize(i) {
      this.sizeI = i; U.store.set('lo.size', i);
      this.level = U.store.get('lo.level.' + i, 1);
      this.newLevel(); this.api.refresh();
    },

    panel(el, api) {
      el.append(api.ui.seg('Taille', SIZES.map((s, i) => ({ value: i, label: s + '×' + s })), this.sizeI, (v) => this.setSize(v)));
      el.append(api.ui.buttons([
        { label: '💡 Indice', onClick: () => this.showHint() },
        { label: 'Recommencer le niveau', cls: 'ghost', onClick: () => this.restart() },
        { label: 'Revenir au niveau 1', cls: 'ghost', onClick: () => { this.level = 1; U.store.set('lo.level.' + this.sizeI, 1); this.newLevel(); } }
      ]));
    },

    _test: { solve }
  });
})(window.LP);
