/* Casse-briques sur grille 8x8 (déplacements case par case). */
(function (LP) {
  'use strict';
  const U = LP.U;
  const BRICK = {
    R: { c: [255, 0, 0], hp: 1 }, O: { c: [255, 100, 0], hp: 1 }, Y: { c: [255, 220, 0], hp: 1 },
    G: { c: [0, 255, 40], hp: 1 }, B: { c: [0, 80, 255], hp: 1 }, P: { c: [170, 0, 255], hp: 1 },
    W: { c: [200, 200, 230], hp: 2, then: [120, 120, 255] }
  };
  const LEVELS = [
    ['RRRRRRRR', 'OOOOOOOO', 'YYYYYYYY'],
    ['WWWWWWWW', 'RRRRRRRR', 'OOOOOOOO', 'YYYYYYYY'],
    ['P.P.P.P.', '.B.B.B.B', 'G.G.G.G.', '.Y.Y.Y.Y'],
    ['WRRWWRRW', 'OOOOOOOO', 'Y.YYYY.Y', 'G..GG..G'],
    ['..WWWW..', '.WRRRRW.', 'WOOOOOOW', 'BBBBBBBB']
  ];
  const PAD_W = 3;

  LP.apps.register({
    id: 'breakout', name: 'Casse-briques', cat: 'jeu', emoji: '🧱', color: [255, 120, 0],
    short: 'Renvoie la balle pour casser les briques',
    icon: [[255, 0, 0], [255, 120, 0], [0, 180, 255], [0, 180, 255]],
    desc: 'Déplace la raquette (en bas) pour renvoyer la balle et casser toutes les briques. Les briques blanches demandent 2 coups. Le bord de la raquette envoie la balle en biais.',
    help: [
      ['Toucher un pad', 'La raquette se place sous ce pad (et lance la balle)'],
      ['Boutons ← →', 'Déplacer la raquette'],
      ['Bouton ↑ / Espace', 'Lancer la balle'],
      ['Flèches / Q D', 'Au clavier'],
      ['Colonne droite', 'Vies restantes']
    ],
    buttons: { top: ['↑', '', '←', '→'] },

    start(api) { this.api = api; this.newGame(); },

    newGame() { this.level = 0; this.score = 0; this.lives = 3; this.loadLevel(); },

    loadLevel() {
      const L = LEVELS[this.level % LEVELS.length];
      this.bricks = [];
      for (let y = 0; y < 8; y++) { this.bricks.push(new Array(8).fill(null)); }
      L.forEach((row, y) => { for (let x = 0; x < 8; x++) { const b = BRICK[row[x]]; if (b) this.bricks[y][x] = { c: b.c, hp: b.hp, then: b.then }; } });
      this.padX = 2;
      this.ready();
    },

    ready() { this.state = 'ready'; this.ball = { x: this.padX + 1, y: 6, dx: Math.random() < 0.5 ? -1 : 1, dy: -1 }; this.acc = 0; this.hud(); },

    hud() {
      this.api.hud({ Score: this.score, Niveau: this.level + 1, Vies: '❤'.repeat(Math.max(0, this.lives)), Record: this.api.best('breakout') || 0 },
        this.state === 'ready' ? 'Touche un pad pour lancer la balle.' : '');
    },

    interval() { return Math.max(0.085, 0.2 - this.level * 0.018 - this.hits * 0.0015); },

    launch() { if (this.state === 'ready') { this.state = 'play'; this.acc = 0; this.hits = 0; LP.audio.sfx.bounce(); this.hud(); } },

    movePad(x) {
      this.padX = U.clamp(x, 0, 8 - PAD_W);
      if (this.state === 'ready') this.ball.x = this.padX + 1;
    },

    brickAt(x, y) { return x >= 0 && x < 8 && y >= 0 && y < 8 ? this.bricks[y][x] : null; },
    hit(x, y) {
      const b = this.bricks[y][x];
      b.hp--;
      this.score++; this.hits = (this.hits || 0) + 1;
      if (b.hp <= 0) this.bricks[y][x] = null; else b.c = b.then;
      LP.audio.sfx.brick(y);
      this.hud();
    },
    left() { let n = 0; for (const r of this.bricks) for (const b of r) if (b) n++; return n; },

    step() {
      const b = this.ball;
      if (b.x + b.dx < 0 || b.x + b.dx > 7) { b.dx = -b.dx; LP.audio.sfx.bounce(); }
      if (b.y + b.dy < 0) { b.dy = -b.dy; LP.audio.sfx.bounce(); }
      // Raquette (ligne 7)
      if (b.dy > 0 && b.y + b.dy === 7) {
        const tx = b.x + b.dx;
        const covers = (x) => x >= this.padX && x < this.padX + PAD_W;
        if (covers(tx) || covers(b.x)) {
          const rel = U.clamp((covers(tx) ? tx : b.x) - this.padX, 0, PAD_W - 1);
          b.dx = rel - 1;
          if (b.dx === 0 && Math.random() < 0.3) b.dx = Math.random() < 0.5 ? -1 : 1;
          b.dy = -1;
          if (b.x + b.dx < 0 || b.x + b.dx > 7) b.dx = -b.dx;
          LP.audio.sfx.tone(440, 0.04, 'square', 0.1);
          return;
        }
      }
      // Briques
      let bounced = false;
      if (b.dy && this.brickAt(b.x, b.y + b.dy)) { this.hit(b.x, b.y + b.dy); b.dy = -b.dy; bounced = true; }
      if (b.dx && this.brickAt(b.x + b.dx, b.y)) { this.hit(b.x + b.dx, b.y); b.dx = -b.dx; bounced = true; }
      if (!bounced && b.dx && b.dy && this.brickAt(b.x + b.dx, b.y + b.dy)) { this.hit(b.x + b.dx, b.y + b.dy); b.dx = -b.dx; b.dy = -b.dy; bounced = true; }
      if (bounced) {
        if (this.left() === 0) this.levelDone();
        return;
      }
      b.x += b.dx; b.y += b.dy;
      if (b.y >= 7) this.lose();
    },

    lose() {
      this.state = 'lost'; this.lostT = 0;
      this.lives--;
      LP.audio.sfx.die();
      this.hud();
    },

    levelDone() {
      this.state = 'clear'; this.clearT = 0;
      LP.audio.sfx.win();
      this.score += 10;
      this.hud();
    },

    update(dt) {
      if (this.state === 'play') {
        this.acc += dt;
        while (this.state === 'play' && this.acc >= this.interval()) { this.acc -= this.interval(); this.step(); }
      } else if (this.state === 'lost') {
        this.lostT += dt;
        if (this.lostT > 1) {
          if (this.lives <= 0) {
            this.state = 'over';
            this.api.best('breakout', this.score);
            this.api.text('SCORE ' + this.score, [0, 180, 255], { onDone: () => this.newGame() });
          } else this.ready();
        }
      } else if (this.state === 'clear') {
        this.clearT += dt;
        if (this.clearT > 1.6) { this.level++; this.loadLevel(); }
      }
    },

    render(fb, t) {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const b = this.bricks[y][x]; if (b) fb.set(x, y, b.c); }
      if (this.state === 'clear') { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) fb.set(x, y, U.hsv(x * 30 + y * 30 + t * 300, 1, 0.8)); return; }
      for (let i = 0; i < PAD_W; i++) fb.set(this.padX + i, 7, [0, 180, 255]);
      const b = this.ball;
      if (this.state === 'lost') { if (Math.floor(this.lostT * 8) % 2) fb.set(b.x, Math.min(7, b.y), [255, 0, 0]); }
      else fb.set(b.x, b.y, this.state === 'ready' && Math.floor(t * 4) % 2 ? [120, 120, 120] : [255, 255, 255]);
      for (let i = 0; i < 3; i++) fb.button('right', i, i < this.lives ? [255, 0, 40] : [15, 0, 0]);
      fb.button('top', 0, this.state === 'ready' ? [0, 255, 0] : [30, 30, 30]);
      fb.button('top', 2, [70, 70, 70]); fb.button('top', 3, [70, 70, 70]);
    },

    onPad(x, y, v, down) {
      if (!down) return;
      this.movePad(x - 1);
      if (this.state === 'ready') this.launch();
    },

    onButton(side, i, down) {
      if (!down || side !== 'top') return;
      if (i === 0) this.launch();
      if (i === 2) this.movePad(this.padX - 1);
      if (i === 3) this.movePad(this.padX + 1);
    },

    onKey(e, down) {
      if (!down) return false;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'q' || k === 'a') { this.movePad(this.padX - 1); return true; }
      if (k === 'arrowright' || k === 'd') { this.movePad(this.padX + 1); return true; }
      if (k === ' ' || k === 'arrowup' || k === 'z' || k === 'w') { this.launch(); return true; }
      return false;
    },

    panel(el, api) {
      el.append(api.ui.buttons([{ label: 'Nouvelle partie', onClick: () => this.newGame() }]));
      el.append(api.ui.note('5 niveaux, puis ils recommencent en plus rapide.'));
    }
  });
})(window.LP);
