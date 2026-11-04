/* Snake */
(function (LP) {
  'use strict';
  const U = LP.U;
  const SPEEDS = [
    { name: 'Lent', base: 0.34, color: [0, 255, 0] },
    { name: 'Normal', base: 0.25, color: [255, 200, 0] },
    { name: 'Rapide', base: 0.17, color: [255, 0, 0] }
  ];
  const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  LP.apps.register({
    id: 'snake', name: 'Snake', cat: 'jeu', emoji: '🐍', color: [0, 230, 60],
    short: 'Mange les pommes, grandis, ne te mords pas !',
    icon: [[0, 230, 60], [0, 230, 60], [0, 80, 30], [255, 0, 0]],
    desc: 'Mange les pommes rouges pour grandir. Les pommes dorées clignotantes valent 3 points mais disparaissent vite. Ne te mords pas la queue !',
    help: [
      ['Boutons ↑ ↓ ← →', 'Les 4 premiers boutons du haut'],
      ['Toucher un pad', 'Le serpent tourne vers ce pad'],
      ['Flèches / ZQSD', 'Diriger au clavier'],
      ['Colonne droite 1–3', 'Vitesse (avant de jouer)'],
      ['Colonne droite 4', 'Murs mortels ou passe-muraille']
    ],
    buttons: { top: ['↑', '↓', '←', '→'], right: ['Lent', 'Norm', 'Vite', 'Murs'] },

    start(api) {
      this.api = api;
      this.speed = U.store.get('snake.speed', 1);
      this.walls = U.store.get('snake.walls', false);
      this.reset();
    },

    key() { return 'snake.' + this.speed + '.' + (this.walls ? 1 : 0); },

    reset() {
      this.snake = [{ x: 3, y: 4 }, { x: 2, y: 4 }, { x: 1, y: 4 }];
      this.dir = DIR.right;
      this.queue = [];
      this.state = 'ready';
      this.acc = 0;
      this.score = 0;
      this.bonus = null;
      this.placeFood();
      this.hud();
    },

    hud() {
      const msg = this.state === 'ready' ? 'Touche un pad ou une flèche pour commencer.' : '';
      this.api.hud({ Score: this.score, Record: this.api.best(this.key()) || 0, Vitesse: SPEEDS[this.speed].name, Bords: this.walls ? 'Murs' : 'Passe-muraille' }, msg);
    },

    free() {
      const out = [];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        if (this.snake.some((s) => s.x === x && s.y === y)) continue;
        if (this.food && this.food.x === x && this.food.y === y) continue;
        out.push({ x, y });
      }
      return out;
    },

    placeFood() { this.food = null; const f = this.free(); this.food = f.length ? U.choice(f) : null; },
    placeBonus() { const f = this.free(); if (f.length) this.bonus = Object.assign(U.choice(f), { ttl: 5 }); },

    interval() { return Math.max(0.085, SPEEDS[this.speed].base - this.score * 0.005); },

    begin() { this.state = 'play'; this.acc = 0; LP.audio.sfx.start(); this.hud(); },

    turn(d) {
      if (this.state === 'ready') this.begin();
      if (this.state !== 'play') return;
      const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
      if ((d[0] === -last[0] && d[1] === -last[1]) || (d[0] === last[0] && d[1] === last[1])) return;
      if (this.queue.length < 3) this.queue.push(d);
    },

    update(dt) {
      if (this.state === 'dying') {
        this.dieT += dt;
        if (this.dieT > 1.3) {
          this.state = 'over';
          this.api.text('SCORE ' + this.score, [255, 200, 0], { onDone: () => this.reset() });
        }
        return;
      }
      if (this.state !== 'play') return;
      if (this.bonus) { this.bonus.ttl -= dt; if (this.bonus.ttl <= 0) this.bonus = null; }
      this.acc += dt;
      while (this.state === 'play' && this.acc >= this.interval()) { this.acc -= this.interval(); this.step(); }
    },

    step() {
      if (this.queue.length) this.dir = this.queue.shift();
      const hd = this.snake[0];
      let nx = hd.x + this.dir[0], ny = hd.y + this.dir[1];
      if (this.walls) { if (nx < 0 || nx > 7 || ny < 0 || ny > 7) return this.die(); }
      else { nx = (nx + 8) % 8; ny = (ny + 8) % 8; }
      const eating = this.food && nx === this.food.x && ny === this.food.y;
      const body = eating ? this.snake : this.snake.slice(0, -1);
      if (body.some((s) => s.x === nx && s.y === ny)) return this.die();
      this.snake.unshift({ x: nx, y: ny });
      if (eating) {
        this.score++;
        LP.audio.sfx.eat();
        this.placeFood();
        if (!this.food) return this.win();
        if (!this.bonus && Math.random() < 0.2) this.placeBonus();
        this.hud();
        return;
      }
      this.snake.pop();
      if (this.bonus && nx === this.bonus.x && ny === this.bonus.y) {
        this.score += 3; this.bonus = null; LP.audio.sfx.bonus(); this.hud();
      }
    },

    die() {
      this.state = 'dying'; this.dieT = 0;
      LP.audio.sfx.die();
      this.api.best(this.key(), this.score);
      this.hud();
    },

    win() {
      this.state = 'over';
      this.api.best(this.key(), this.score);
      LP.audio.sfx.win();
      this.api.text('BRAVO ! ' + this.score, (x, y, i) => U.hsv(i * 20, 1, 1), { onDone: () => this.reset() });
    },

    render(fb, t) {
      if (this.food) fb.set(this.food.x, this.food.y, U.scale([255, 0, 0], 0.65 + 0.35 * Math.sin(t * 8)));
      if (this.bonus && (this.bonus.ttl > 1.5 || Math.floor(t * 8) % 2)) fb.set(this.bonus.x, this.bonus.y, [255, 180, 0]);
      const n = this.snake.length;
      this.snake.forEach((s, i) => {
        let c = i === 0 ? [140, 255, 60] : U.mix([0, 220, 40], [0, 70, 110], i / Math.max(1, n - 1));
        if (this.state === 'dying') c = Math.floor(this.dieT * 8) % 2 ? [255, 0, 0] : [50, 0, 0];
        if (this.state === 'ready' && i === 0 && Math.floor(t * 3) % 2) c = [255, 255, 255];
        fb.set(s.x, s.y, c);
      });
      for (let i = 0; i < 4; i++) fb.button('top', i, [70, 70, 70]);
      SPEEDS.forEach((s, i) => fb.button('right', i, i === this.speed ? s.color : U.scale(s.color, 0.1)));
      fb.button('right', 3, this.walls ? [255, 40, 0] : [0, 120, 255]);
      fb.setLogo([0, 200, 50]);
    },

    onPad(x, y, v, down) {
      if (!down) return;
      if (this.state === 'ready') { this.begin(); return; }
      if (this.state !== 'play') return;
      const hd = this.snake[0];
      const cur = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
      const dx = x - hd.x, dy = y - hd.y;
      if (cur[1] === 0) { if (dy < 0) this.turn(DIR.up); else if (dy > 0) this.turn(DIR.down); }
      else if (dx < 0) this.turn(DIR.left); else if (dx > 0) this.turn(DIR.right);
    },

    onButton(side, i, down) {
      if (!down) return;
      if (side === 'top' && i < 4) return this.turn([DIR.up, DIR.down, DIR.left, DIR.right][i]);
      if (side === 'right' && this.state !== 'play' && this.state !== 'dying') {
        if (i < 3) this.setSpeed(i);
        else if (i === 3) this.setWalls(!this.walls);
      }
    },

    setSpeed(i) { this.speed = i; U.store.set('snake.speed', i); this.reset(); this.api.refresh(); },
    setWalls(w) { this.walls = w; U.store.set('snake.walls', w); this.reset(); this.api.refresh(); },

    onKey(e, down) {
      if (!down) return false;
      const k = e.key.toLowerCase();
      const map = { arrowup: DIR.up, z: DIR.up, w: DIR.up, arrowdown: DIR.down, s: DIR.down, arrowleft: DIR.left, q: DIR.left, a: DIR.left, arrowright: DIR.right, d: DIR.right };
      if (map[k]) { this.turn(map[k]); return true; }
      if (k === ' ' && this.state === 'ready') { this.begin(); return true; }
      return false;
    },

    panel(el, api) {
      el.append(api.ui.seg('Vitesse', SPEEDS.map((s, i) => ({ value: i, label: s.name })), this.speed, (v) => this.setSpeed(v)));
      el.append(api.ui.seg('Bords', [{ value: false, label: 'Passe-muraille' }, { value: true, label: 'Murs' }], this.walls, (v) => this.setWalls(v)));
      el.append(api.ui.buttons([{ label: 'Nouvelle partie', onClick: () => this.reset() }]));
    }
  });
})(window.LP);
