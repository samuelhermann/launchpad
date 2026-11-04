/* Puissance 4 : 8 colonnes x 7 lignes, à deux ou contre l'ordinateur. */
(function (LP) {
  'use strict';
  const U = LP.U;
  const COLS = 8, ROWS = 7;
  const COL = [null, [255, 0, 0], [255, 170, 0]];
  const NAMES = [null, 'Rouge', 'Jaune'];
  const LEVELS = [{ name: 'Facile', depth: 1, noise: 0.35 }, { name: 'Moyen', depth: 3, noise: 0.1 }, { name: 'Difficile', depth: 6, noise: 0 }];

  // Toutes les lignes de 4 cases possibles
  const WINDOWS = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const w = [];
      for (let k = 0; k < 4; k++) {
        const rr = r + dr * k, cc = c + dc * k;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) break;
        w.push(rr * COLS + cc);
      }
      if (w.length === 4) WINDOWS.push(w);
    }
  }
  const ORDER = [3, 4, 2, 5, 1, 6, 0, 7];

  function dropRow(b, c) { for (let r = ROWS - 1; r >= 0; r--) if (!b[r * COLS + c]) return r; return -1; }
  function winLine(b, p) { for (const w of WINDOWS) if (b[w[0]] === p && b[w[1]] === p && b[w[2]] === p && b[w[3]] === p) return w; return null; }
  function full(b) { for (let c = 0; c < COLS; c++) if (!b[c]) return false; return true; }

  function evaluate(b, p) {
    const o = 3 - p;
    let s = 0;
    for (const w of WINDOWS) {
      let mine = 0, theirs = 0;
      for (const i of w) { if (b[i] === p) mine++; else if (b[i] === o) theirs++; }
      if (mine && theirs) continue;
      if (mine === 3) s += 6; else if (mine === 2) s += 2;
      if (theirs === 3) s -= 7; else if (theirs === 2) s -= 2;
    }
    for (let r = 0; r < ROWS; r++) { if (b[r * COLS + 3] === p) s += 2; if (b[r * COLS + 4] === p) s += 2; }
    return s;
  }

  function minimax(b, depth, alpha, beta, turn, me) {
    const opp = 3 - me;
    if (winLine(b, me)) return 100000 + depth;
    if (winLine(b, opp)) return -100000 - depth;
    if (depth === 0 || full(b)) return evaluate(b, me);
    if (turn === me) {
      let best = -Infinity;
      for (const c of ORDER) {
        const r = dropRow(b, c); if (r < 0) continue;
        b[r * COLS + c] = me;
        best = Math.max(best, minimax(b, depth - 1, alpha, beta, opp, me));
        b[r * COLS + c] = 0;
        alpha = Math.max(alpha, best); if (alpha >= beta) break;
      }
      return best;
    }
    let best = Infinity;
    for (const c of ORDER) {
      const r = dropRow(b, c); if (r < 0) continue;
      b[r * COLS + c] = opp;
      best = Math.min(best, minimax(b, depth - 1, alpha, beta, me, me));
      b[r * COLS + c] = 0;
      beta = Math.min(beta, best); if (alpha >= beta) break;
    }
    return best;
  }

  function aiMove(board, me, level) {
    const b = board.slice();
    const L = LEVELS[level];
    let best = -Infinity, choice = [];
    for (const c of ORDER) {
      const r = dropRow(b, c); if (r < 0) continue;
      b[r * COLS + c] = me;
      // Sans bruit, on peut élaguer avec le meilleur score déjà trouvé
      const alpha = L.noise ? -Infinity : best - 0.002;
      let s = minimax(b, L.depth - 1, alpha, Infinity, 3 - me, me);
      b[r * COLS + c] = 0;
      if (L.noise) s += (Math.random() - 0.5) * 20 * L.noise * 10;
      if (s > best + 0.001) { best = s; choice = [c]; } else if (Math.abs(s - best) <= 0.001) choice.push(c);
    }
    return choice.length ? U.choice(choice) : -1;
  }

  LP.apps.register({
    id: 'connect4', name: 'Puissance 4', cat: 'jeu', emoji: '🔴', color: [255, 40, 0],
    short: 'Aligne 4 jetons, à deux ou contre l’ordi',
    icon: [[255, 0, 0], [255, 170, 0], [255, 170, 0], [255, 0, 0]],
    desc: 'Aligne 4 jetons de ta couleur (horizontal, vertical ou diagonale). Touche n’importe quel pad d’une colonne pour y lâcher ton jeton. La ligne du haut montre à qui c’est le tour.',
    help: [
      ['Toucher une colonne', 'Lâcher un jeton'],
      ['Colonne droite 1', 'Nouvelle manche'],
      ['Colonne droite 3–4', '2 joueurs / contre l’ordi'],
      ['Colonne droite 6–8', 'Niveau de l’ordi']
    ],
    buttons: { right: ['↻', '', '👥', '🤖', '', '1', '2', '3'] },

    start(api) {
      this.api = api;
      this.vsAI = U.store.get('c4.ai', true);
      this.level = U.store.get('c4.level', 1);
      this.scores = [0, 0, 0];
      this.starter = 1;
      this.newRound();
    },

    newRound() {
      this.board = new Array(ROWS * COLS).fill(0);
      this.player = this.starter;
      this.starter = 3 - this.starter;
      this.state = 'turn';
      this.anim = null; this.win = null; this.lastCol = 3;
      this.hud();
      this.maybeAI();
    },

    hud() {
      let msg = '';
      if (this.state === 'turn' || this.state === 'ai' || this.state === 'drop') {
        msg = this.vsAI ? (this.player === 1 ? 'À toi de jouer (Rouge).' : 'L’ordi réfléchit…') : 'À ' + NAMES[this.player] + ' de jouer.';
      }
      if (this.state === 'win') msg = (this.vsAI ? (this.win.p === 1 ? 'Tu as gagné ! 🎉' : 'L’ordi a gagné…') : NAMES[this.win.p] + ' gagne ! 🎉');
      if (this.state === 'draw') msg = 'Match nul !';
      const f = {};
      f[this.vsAI ? 'Toi' : 'Rouge'] = this.scores[1];
      f[this.vsAI ? 'Ordi' : 'Jaune'] = this.scores[2];
      f.Mode = this.vsAI ? 'Contre l’ordi (' + LEVELS[this.level].name + ')' : '2 joueurs';
      this.api.hud(f, msg);
    },

    maybeAI() {
      if (this.vsAI && this.player === 2 && this.state === 'turn') { this.state = 'ai'; this.aiT = 0.5; this.hud(); }
    },

    drop(c, byAI) {
      if (this.state !== 'turn' && !(byAI && this.state === 'ai')) return;
      if (!byAI && this.vsAI && this.player === 2) return;
      const r = dropRow(this.board, c);
      if (r < 0) { LP.audio.sfx.tone(150, 0.1, 'square', 0.1); return; }
      this.anim = { c, r, pos: -1, p: this.player };
      this.lastCol = c;
      this.state = 'drop';
    },

    update(dt) {
      if (this.state === 'ai') {
        this.aiT -= dt;
        if (this.aiT <= 0) { const c = aiMove(this.board, 2, this.level); if (c >= 0) this.drop(c, true); }
      } else if (this.state === 'drop') {
        const a = this.anim;
        a.pos += dt * 22;
        if (a.pos >= a.r) {
          this.board[a.r * COLS + a.c] = a.p;
          this.anim = null;
          LP.audio.sfx.drop();
          const w = winLine(this.board, a.p);
          if (w) {
            this.win = { p: a.p, cells: w }; this.state = 'win'; this.endT = 0; this.scores[a.p]++;
            setTimeout(() => (this.vsAI && a.p === 2 ? LP.audio.sfx.lose() : LP.audio.sfx.win()), 150);
          } else if (full(this.board)) { this.state = 'draw'; this.endT = 0; }
          else { this.player = 3 - this.player; this.state = 'turn'; this.maybeAI(); }
          this.hud();
        }
      } else if (this.state === 'win' || this.state === 'draw') {
        this.endT += dt;
        if (this.endT > 3.2) this.newRound();
      }
    },

    render(fb, t) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const v = this.board[r * COLS + c];
        let col = v ? COL[v] : [0, 0, 28];
        if (this.state === 'win') {
          const on = this.win.cells.indexOf(r * COLS + c) >= 0;
          if (on) col = Math.floor(t * 6) % 2 ? [255, 255, 255] : COL[this.win.p];
          else if (v) col = U.scale(col, 0.2);
        }
        if (this.state === 'draw' && v) col = U.scale(col, 0.4 + 0.3 * Math.sin(t * 5));
        fb.set(c, r + 1, col);
      }
      if (this.anim && this.anim.pos >= 0) fb.set(this.anim.c, 1 + Math.floor(this.anim.pos), COL[this.anim.p]);
      if (this.state === 'turn' || this.state === 'ai' || this.state === 'drop') {
        const p = this.anim ? this.anim.p : this.player;
        for (let c = 0; c < COLS; c++) fb.set(c, 0, U.scale(COL[p], c === this.lastCol ? 0.9 : 0.15));
        if (this.state === 'ai') fb.set(Math.floor(t * 10) % COLS, 0, COL[2]);
      }
      fb.button('right', 0, [0, 255, 100]);
      fb.button('right', 2, !this.vsAI ? [255, 255, 255] : [30, 30, 30]);
      fb.button('right', 3, this.vsAI ? [0, 160, 255] : [0, 20, 30]);
      if (this.vsAI) for (let i = 0; i < 3; i++) fb.button('right', 5 + i, i <= this.level ? [255, 120 - i * 50, 0] : [25, 10, 0]);
      fb.setLogo(COL[this.player]);
    },

    onPad(x, y, v, down) { if (down) this.drop(x); },

    onButton(side, i, down) {
      if (!down || side !== 'right') return;
      if (i === 0) { this.scores = [0, 0, 0]; this.starter = 1; this.newRound(); }
      if (i === 2) this.setAI(false);
      if (i === 3) this.setAI(true);
      if (i >= 5 && this.vsAI) this.setLevel(i - 5);
    },

    setAI(v) { this.vsAI = v; U.store.set('c4.ai', v); this.scores = [0, 0, 0]; this.starter = 1; this.newRound(); this.api.refresh(); },
    setLevel(l) { this.level = l; U.store.set('c4.level', l); this.hud(); this.api.refresh(); },

    panel(el, api) {
      el.append(api.ui.seg('Adversaire', [{ value: false, label: '👥 2 joueurs' }, { value: true, label: '🤖 Ordinateur' }], this.vsAI, (v) => this.setAI(v)));
      el.append(api.ui.seg('Niveau de l’ordi', LEVELS.map((l, i) => ({ value: i, label: l.name })), this.level, (v) => this.setLevel(v)));
      el.append(api.ui.buttons([{ label: 'Nouvelle manche', onClick: () => this.newRound() }, { label: 'Remettre les scores à 0', cls: 'ghost', onClick: () => { this.scores = [0, 0, 0]; this.hud(); } }]));
    },

    _test: { aiMove, winLine, dropRow }
  });
})(window.LP);
