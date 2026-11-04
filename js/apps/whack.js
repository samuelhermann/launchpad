/* Tape-taupe : réflexes ! */
(function (LP) {
  'use strict';
  const U = LP.U;
  const CHRONO = 45;

  LP.apps.register({
    id: 'whack', name: 'Tape-taupe', cat: 'jeu', emoji: '🔨', color: [0, 255, 70],
    short: 'Tape les pads allumés le plus vite possible',
    icon: [[20, 20, 20], [0, 255, 70], [255, 170, 0], [20, 20, 20]],
    desc: 'Des taupes vertes sortent au hasard : tape-les avant qu’elles disparaissent ! Les dorées valent 5 points. Attention aux bombes rouges qui clignotent : ne les touche pas !',
    help: [
      ['Pad vert', '+1 point'],
      ['Pad doré', '+5 points'],
      ['Pad rouge clignotant', 'Bombe : −3 points (ou −1 vie)'],
      ['Colonne droite 1–2', 'Mode Chrono 45 s / Survie 3 vies'],
      ['Colonne droite (en jeu)', 'Temps restant ou vies']
    ],
    buttons: { right: ['⏱', '❤', '', '', '', '', '', ''] },

    start(api) {
      this.api = api;
      this.mode = U.store.get('whack.mode', 'chrono');
      this.reset();
    },

    reset() {
      this.state = 'ready';
      this.moles = []; this.fx = [];
      this.score = 0; this.lives = 3; this.elapsed = 0; this.timeLeft = CHRONO;
      this.spawnAcc = 0; this.count = 0;
      this.hud();
    },

    hud() {
      const f = { Score: this.score, Record: this.api.best('whack.' + this.mode) || 0 };
      if (this.mode === 'chrono') f.Temps = Math.ceil(this.timeLeft) + ' s'; else f.Vies = '❤'.repeat(Math.max(0, this.lives));
      this.api.hud(f, this.state === 'ready' ? 'Touche un pad pour lancer la partie.' : '');
    },

    begin() { this.state = 'count'; this.count = 3; this.countT = 0; LP.audio.sfx.tick(); this.hud(); },

    spawn() {
      const occupied = new Set(this.moles.map((m) => m.x + m.y * 8));
      const free = [];
      for (let i = 0; i < 64; i++) if (!occupied.has(i)) free.push(i);
      if (!free.length) return;
      const p = U.choice(free);
      const r = Math.random();
      let type = 'mole';
      if (r < 0.07) type = 'gold';
      else if (r < 0.22 && this.elapsed > 4) type = 'bomb';
      const base = Math.max(0.55, 1.5 - this.elapsed * 0.02);
      const life = type === 'gold' ? base * 0.65 : type === 'bomb' ? 1.8 : base;
      this.moles.push({ x: p % 8, y: Math.floor(p / 8), type, life, age: 0 });
    },

    update(dt) {
      this.fx = this.fx.filter((f) => (f.age += dt) < 0.5);
      if (this.state === 'count') {
        this.countT += dt;
        if (this.countT >= 0.6) {
          this.countT = 0; this.count--;
          if (this.count <= 0) { this.state = 'play'; LP.audio.sfx.start(); this.hud(); } else LP.audio.sfx.tick();
        }
        return;
      }
      if (this.state !== 'play') return;
      this.elapsed += dt;
      if (this.mode === 'chrono') {
        const before = Math.ceil(this.timeLeft);
        this.timeLeft -= dt;
        if (Math.ceil(this.timeLeft) !== before) { this.hud(); if (this.timeLeft < 5.5 && this.timeLeft > 0) LP.audio.sfx.tick(); }
        if (this.timeLeft <= 0) return this.end();
      }
      const every = Math.max(0.3, 0.95 - this.elapsed * 0.012);
      const maxMoles = Math.min(6, 1 + Math.floor(this.elapsed / 8));
      this.spawnAcc += dt;
      if (this.spawnAcc >= every) {
        this.spawnAcc = 0;
        if (this.moles.filter((m) => m.type !== 'bomb').length < maxMoles) this.spawn();
      }
      for (const m of this.moles) {
        m.age += dt;
        if (m.age >= m.life) {
          m.dead = true;
          if (m.type === 'mole' && this.mode === 'survie') { this.lives--; LP.audio.sfx.tone(200, 0.15, 'triangle', 0.2); this.hud(); }
        }
      }
      this.moles = this.moles.filter((m) => !m.dead);
      if (this.mode === 'survie' && this.lives <= 0) this.end();
    },

    end() {
      this.state = 'over';
      this.moles = [];
      this.api.best('whack.' + this.mode, this.score);
      LP.audio.sfx.lose();
      this.hud();
      this.api.text('SCORE ' + this.score, [0, 255, 80], { onDone: () => this.reset() });
    },

    onPad(x, y, v, down) {
      if (!down) return;
      if (this.state === 'ready') return this.begin();
      if (this.state !== 'play') return;
      const m = this.moles.find((o) => o.x === x && o.y === y);
      if (!m) { LP.audio.sfx.tick(); return; }
      m.dead = true;
      this.moles = this.moles.filter((o) => !o.dead);
      if (m.type === 'mole') { this.score += 1; LP.audio.sfx.hit(); this.fx.push({ x, y, age: 0, c: [255, 255, 255] }); }
      else if (m.type === 'gold') { this.score += 5; LP.audio.sfx.bonus(); this.fx.push({ x, y, age: 0, c: [255, 200, 0] }); }
      else {
        LP.audio.sfx.error();
        this.fx.push({ x, y, age: 0, c: [255, 0, 0], big: true });
        if (this.mode === 'chrono') this.score = Math.max(0, this.score - 3); else this.lives--;
      }
      this.hud();
    },

    render(fb, t) {
      if (this.state === 'ready') {
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const k = Math.max(0, Math.sin(Math.floor(t * 6) / 2 + x * 1.7 + y * 2.3));
          fb.set(x, y, U.scale([0, 255, 70], 0.04 + 0.12 * k * k));
        }
      }
      if (this.state === 'count') LP.font.digits(fb, this.count, [255, 255, 255], 1);
      for (const m of this.moles) {
        const left = 1 - m.age / m.life;
        const rise = Math.min(1, m.age / 0.08);
        let c;
        if (m.type === 'mole') c = U.scale([0, 255, 60], (0.35 + 0.65 * left) * rise);
        else if (m.type === 'gold') c = U.scale([255, 180, 0], (Math.floor(t * 12) % 2 ? 1 : 0.5) * rise);
        else c = U.scale([255, 0, 0], Math.floor(t * 6) % 2 ? 1 : 0.25);
        fb.set(m.x, m.y, c);
      }
      for (const f of this.fx) {
        const r = f.age * (f.big ? 14 : 9), k = 1 - f.age / 0.5;
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const d = Math.hypot(x - f.x, y - f.y);
          if (Math.abs(d - r) < 0.7) fb.add(x, y, U.scale(f.c, k * 0.8));
        }
        fb.add(f.x, f.y, U.scale(f.c, k));
      }
      if (this.state === 'play' || this.state === 'count') {
        if (this.mode === 'chrono') {
          const lit = Math.ceil(this.timeLeft / CHRONO * 8);
          for (let i = 0; i < 8; i++) fb.button('right', i, 7 - i < lit ? U.mix([255, 0, 0], [0, 255, 0], this.timeLeft / CHRONO) : [10, 10, 10]);
        } else for (let i = 0; i < 3; i++) fb.button('right', i, i < this.lives ? [255, 0, 40] : [20, 0, 0]);
      } else {
        fb.button('right', 0, this.mode === 'chrono' ? [0, 255, 0] : [0, 30, 0]);
        fb.button('right', 1, this.mode === 'survie' ? [255, 0, 40] : [30, 0, 5]);
      }
    },

    onButton(side, i, down) {
      if (!down || side !== 'right' || this.state === 'play' || this.state === 'count') return;
      if (i === 0) this.setMode('chrono');
      if (i === 1) this.setMode('survie');
    },

    setMode(m) { this.mode = m; U.store.set('whack.mode', m); this.reset(); this.api.refresh(); },

    panel(el, api) {
      el.append(api.ui.seg('Mode', [{ value: 'chrono', label: '⏱ Chrono 45 s' }, { value: 'survie', label: '❤ Survie' }], this.mode, (v) => this.setMode(v)));
      el.append(api.ui.buttons([{ label: 'Nouvelle partie', onClick: () => this.reset() }]));
    }
  });
})(window.LP);
