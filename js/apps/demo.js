/*
 * Animations « démo » : des styles lumineux reconnaissables (pluie numérique, scanner K2000,
 * convecteur temporel…). Conçues pour changer peu de LED à la fois (fluide même sur un MK2).
 */
(function (LP) {
  'use strict';
  const U = LP.U;
  const A = LP.audio;
  const lvl = (k, steps) => Math.round(U.clamp(k, 0, 1) * steps) / steps;
  const snd = (fn) => { if (DEMO.sound && A.ready()) fn(); };
  let DEMO = null;

  const HEART_BIG = ['.XX..XX.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '...XX...', '........'];
  const HEART_SMALL = ['........', '..X..X..', '.XXXXXX.', '.XXXXXX.', '..XXXX..', '...XX...', '........', '........'];
  const bitmap = (fb, rows, c) => rows.forEach((r, y) => { for (let x = 0; x < 8; x++) if (r[x] === 'X') fb.set(x, y, c); });

  const ANIMS = [
    { name: 'Pluie numérique (Matrix)', icon: '▼',
      init(s) { s.drops = []; },
      update(s, dt) {
        for (let x = 0; x < 8; x++) {
          if (Math.random() < dt * 1.4 && !s.drops.some((d) => d.x === x && d.y - d.len < 1)) s.drops.push({ x, y: -1, v: 5 + Math.random() * 7, len: 3 + U.rand(4) });
        }
        for (const d of s.drops) d.y += d.v * dt;
        s.drops = s.drops.filter((d) => d.y - d.len < 8);
      },
      render(s, fb) {
        const shades = [[170, 255, 170], [0, 255, 40], [0, 160, 25], [0, 90, 12], [0, 45, 6], [0, 22, 3]];
        for (const d of s.drops) {
          const head = Math.floor(d.y);
          for (let j = 0; j < d.len; j++) fb.set(d.x, head - j, shades[Math.min(j, shades.length - 1)]);
        }
      } },

    { name: 'Scanner K2000', icon: '↔',
      init(s) { s.pos = 0; s.dir = 1; s.glow = new Float32Array(8); },
      update(s, dt) {
        s.pos += s.dir * dt * 6.5;
        if (s.pos >= 7) { s.pos = 7; s.dir = -1; snd(() => A.sfx.tone(520, 0.55, 'sine', 0.06, 0, 260)); }
        if (s.pos <= 0) { s.pos = 0; s.dir = 1; snd(() => A.sfx.tone(260, 0.55, 'sine', 0.06, 0, 520)); }
        for (let x = 0; x < 8; x++) s.glow[x] *= Math.exp(-dt * 5);
        s.glow[Math.round(s.pos)] = 1;
      },
      render(s, fb) {
        for (let x = 0; x < 8; x++) {
          fb.set(x, 2, [14, 0, 0]); fb.set(x, 5, [14, 0, 0]);
          const k = lvl(s.glow[x], 5);
          if (k > 0) { fb.set(x, 3, [255 * k, 0, 0]); fb.set(x, 4, [255 * k, 0, 0]); }
        }
      } },

    { name: 'Voix de KITT', icon: '|||',
      init(s) { s.lv = 0; s.target = 0; s.next = 0; },
      update(s, dt, t) {
        const AI = LP.audioin;
        AI.analyse(t);
        if (AI.source !== 'app' || AI.level > 0.08) s.target = AI.level * 1.6;
        else if (t > s.next) { s.target = Math.random() < 0.25 ? 0 : 0.3 + Math.random() * 0.7; s.next = t + 0.07 + Math.random() * 0.12; }
        s.lv += (s.target - s.lv) * Math.min(1, dt * 18);
      },
      render(s, fb) {
        const bar = (x0, k) => {
          const hgt = Math.round(U.clamp(k, 0, 1) * 4);
          for (let d = 0; d < hgt; d++) for (let x = x0; x < x0 + 2; x++) { fb.set(x, 3 - d, [255, 20, 0]); fb.set(x, 4 + d, [255, 20, 0]); }
          for (let x = x0; x < x0 + 2; x++) for (let y = 0; y < 8; y++) if (!fb.get(x, y)[0]) fb.set(x, y, [16, 0, 0]);
        };
        bar(0, s.lv * 0.65); bar(3, s.lv); bar(6, s.lv * 0.65);
      } },

    { name: 'Convecteur temporel', icon: 'Y',
      init(s) { s.step = 0; s.acc = 0; s.speed = 3; s.flash = 0; },
      update(s, dt) {
        if (s.flash > 0) { s.flash -= dt; if (s.flash <= 0) s.speed = 3; return; }
        s.speed += dt * 1.6; // accélère jusqu'à 88 miles à l'heure !
        s.acc += dt * s.speed;
        if (s.acc >= 1) { s.acc = 0; s.step = (s.step + 1) % 4; if (s.step === 3) snd(() => A.sfx.tone(90 + s.speed * 8, 0.05, 'sawtooth', 0.04)); }
        if (s.speed > 18) { s.flash = 1.2; snd(() => { A.sfx.tone(1800, 0.6, 'sawtooth', 0.12, 0, 60); A.drum(4, 0, 1); }); }
      },
      render(s, fb, t) {
        if (s.flash > 0) {
          const on = Math.floor(s.flash * 10) % 2 === 0;
          fb.fill(on ? [255, 255, 255] : [0, 60, 255]);
          return;
        }
        const arms = [
          [[[0, 0]], [[1, 1]], [[2, 2]]],
          [[[7, 0]], [[6, 1]], [[5, 2]]],
          [[[3, 7], [4, 7]], [[3, 6], [4, 6]], [[3, 5], [4, 5]]]
        ];
        const tube = [45, 30, 8], hot = [255, 225, 140], warm = [140, 90, 25];
        for (const arm of arms) arm.forEach((cells, i) => {
          const c = i === s.step ? hot : i === s.step - 1 ? warm : tube;
          for (const [x, y] of cells) fb.set(x, y, c);
        });
        const core = s.step === 3 ? [255, 240, 180] : [120, 80, 20];
        fb.rect(3, 3, 2, 2, core);
        void t;
      } },

    { name: 'Hyperespace', icon: '✦',
      init(s) { s.stars = []; },
      update(s, dt) {
        if (Math.random() < dt * 14) s.stars.push({ a: Math.random() * Math.PI * 2, r: 0.3, v: 1.5 });
        for (const st of s.stars) { st.v *= 1 + dt * 2.5; st.r += st.v * dt; }
        s.stars = s.stars.filter((st) => st.r < 6.5);
      },
      render(s, fb) {
        for (const st of s.stars) {
          const x = Math.floor(3.5 + Math.cos(st.a) * st.r + 0.5), y = Math.floor(3.5 + Math.sin(st.a) * st.r + 0.5);
          const tx = Math.floor(3.5 + Math.cos(st.a) * (st.r - 1) + 0.5), ty = Math.floor(3.5 + Math.sin(st.a) * (st.r - 1) + 0.5);
          fb.set(tx, ty, [30, 50, 120]);
          fb.set(x, y, st.r > 2 ? [220, 230, 255] : [90, 110, 200]);
        }
      } },

    { name: 'Gyrophare', icon: '🚨',
      init(s) { s.ph = 0; s.acc = 0; s.siren = 0; },
      update(s, dt) {
        s.acc += dt;
        if (s.acc >= 0.08) { s.acc = 0; s.ph = (s.ph + 1) % 8; }
        s.siren -= dt;
        if (s.siren <= 0) { s.siren = 0.5; s.tone = !s.tone; snd(() => A.sfx.tone(s.tone ? 435 : 580, 0.48, 'square', 0.05)); }
      },
      render(s, fb) {
        const left = s.ph === 0 || s.ph === 2, right = s.ph === 4 || s.ph === 6;
        if (left) fb.rect(0, 0, 4, 4, [0, 40, 255]);
        if (right) fb.rect(4, 0, 4, 4, [255, 0, 0]);
        fb.rect(0, 4, 8, 1, [20, 20, 25]);
      } },

    { name: 'Radar', icon: '◔',
      init(s) {
        s.a = 0;
        s.blips = [...Array(4)].map(() => ({ x: U.rand(8), y: U.rand(8), glow: 0 }));
      },
      update(s, dt) {
        const prev = s.a;
        s.a = (s.a + dt * 2.2) % (Math.PI * 2);
        for (const b of s.blips) {
          b.glow *= Math.exp(-dt * 1.2);
          const ang = (Math.atan2(b.y - 3.5, b.x - 3.5) + Math.PI * 2) % (Math.PI * 2);
          const crossed = prev <= s.a ? ang > prev && ang <= s.a : ang > prev || ang <= s.a;
          if (crossed) { b.glow = 1; snd(() => A.sfx.tone(1320, 0.12, 'sine', 0.05)); if (Math.random() < 0.3) { b.x = U.rand(8); b.y = U.rand(8); } }
        }
      },
      render(s, fb) {
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const ang = (Math.atan2(y - 3.5, x - 3.5) + Math.PI * 2) % (Math.PI * 2);
          const d = (s.a - ang + Math.PI * 4) % (Math.PI * 2);
          const k = lvl(d < 0.35 ? 1 : Math.exp(-d * 1.4) * 0.8, 4);
          if (k > 0) fb.set(x, y, [0, 200 * k, 40 * k]);
        }
        for (const b of s.blips) { const k = lvl(b.glow, 4); if (k > 0) fb.set(b.x, b.y, [180 * k, 255 * k, 180 * k]); }
      } },

    { name: 'Piste disco', icon: '▦',
      init(s) { s.tiles = [...Array(16)].map(() => U.hsv(U.rand(6) * 60, 1, 1)); s.acc = 0; s.lastStep = -1; },
      update(s, dt) {
        const T = LP.transport, st = T.currentStep();
        let beat = false;
        if (st >= 0) { if (st % 4 === 0 && st !== s.lastStep) beat = true; s.lastStep = st; }
        else { s.acc += dt; if (s.acc >= 0.5) { s.acc = 0; beat = true; } }
        if (beat) for (let i = 0; i < 16; i++) if (Math.random() < 0.5) s.tiles[i] = Math.random() < 0.2 ? [0, 0, 0] : U.hsv(U.rand(6) * 60, 1, 1);
      },
      render(s, fb) { s.tiles.forEach((c, i) => fb.rect((i % 4) * 2, (i >> 2) * 2, 2, 2, c)); } },

    { name: 'Feu de cheminée', icon: '🔥',
      init(s) { s.heat = [...Array(9)].map(() => new Float32Array(8)); s.acc = 0; },
      update(s, dt) {
        s.acc += dt;
        if (s.acc < 0.08) return;
        s.acc = 0;
        const H = s.heat;
        for (let x = 0; x < 8; x++) H[8][x] = 0.55 + Math.random() * 0.45;
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const below = H[y + 1][x] * 2 + (H[y + 1][x - 1] || 0) + (H[y + 1][x + 1] || 0);
          H[y][x] = Math.max(0, below / 4.15 - Math.random() * 0.08);
        }
      },
      render(s, fb) {
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const k = lvl(s.heat[y][x], 6);
          if (k > 0.1) fb.set(x, y, k > 0.8 ? [255, 220, 60] : k > 0.5 ? [255, 110, 0] : k > 0.3 ? [200, 30, 0] : [70, 5, 0]);
        }
      } },

    { name: 'Jeu de la vie', icon: '⁘',
      init(s) { s.acc = 0; s.seed = () => { s.cells = new Uint16Array(64); for (let i = 0; i < 64; i++) s.cells[i] = Math.random() < 0.35 ? 1 : 0; s.gen = 0; s.hist = []; }; s.seed(); },
      update(s, dt) {
        s.acc += dt;
        if (s.acc < 0.3) return;
        s.acc = 0;
        const c = s.cells, n = new Uint16Array(64);
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          let k = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) k += c[((y + dy + 8) % 8) * 8 + (x + dx + 8) % 8] ? 1 : 0;
          const i = y * 8 + x;
          n[i] = c[i] ? (k === 2 || k === 3 ? c[i] + 1 : 0) : (k === 3 ? 1 : 0);
        }
        const sig = Array.from(n, (v) => (v ? 1 : 0)).join('');
        s.cells = n; s.gen++;
        if (!n.some(Boolean) || s.hist.indexOf(sig) >= 0 || s.gen > 80) s.seed();
        else { s.hist.push(sig); if (s.hist.length > 6) s.hist.shift(); }
      },
      render(s, fb) {
        for (let i = 0; i < 64; i++) { const a = s.cells[i]; if (a) fb.set(i % 8, i >> 3, a === 1 ? [120, 255, 255] : a < 4 ? [0, 170, 255] : [0, 60, 200]); }
      } },

    { name: 'Battement de cœur', icon: '♥',
      init(s) { s.ph = 0; s.beat = 0; },
      update(s, dt) {
        const period = 60 / 70;
        const before = s.ph;
        s.ph = (s.ph + dt / period) % 1;
        if (before > s.ph) snd(() => A.sfx.tone(70, 0.12, 'sine', 0.35, 0, 45));
        if (before < 0.28 && s.ph >= 0.28) snd(() => A.sfx.tone(60, 0.1, 'sine', 0.25, 0, 40));
      },
      render(s, fb) {
        const big = s.ph < 0.12 || (s.ph >= 0.28 && s.ph < 0.38);
        bitmap(fb, big ? HEART_BIG : HEART_SMALL, big ? [255, 0, 30] : [130, 0, 15]);
      } },

    { name: 'Horloge', icon: '🕒',
      init() {},
      update() {},
      render(s, fb) {
        const d = new Date(), sec = d.getSeconds();
        const showMin = Math.floor(Date.now() / 2500) % 2 === 1;
        LP.font.digits(fb, showMin ? d.getMinutes() : d.getHours(), showMin ? [0, 200, 255] : [255, 255, 255], 0);
        const bar = Math.floor(sec / 7.5);
        for (let x = 0; x <= bar && x < 8; x++) fb.set(x, 7, x === bar ? [255, 120, 0] : [80, 40, 0]);
        if (sec % 2 === 0) fb.set(7, 5, showMin ? [0, 200, 255] : [255, 255, 255]);
      } }
  ];

  DEMO = {
    id: 'demo', name: 'Animations', cat: 'outil', emoji: '📺', color: [0, 255, 70],
    short: 'Matrix, K2000, convecteur temporel…',
    icon: [[0, 255, 40], [0, 90, 12], [255, 0, 0], [255, 225, 140]],
    desc: 'Des animations lumineuses reconnaissables pour faire le spectacle : pluie numérique façon Matrix, scanner K2000, voix de KITT (réagit au micro !), convecteur temporel, hyperespace, gyrophare, radar, piste disco, feu, jeu de la vie, cœur, horloge. Mode diaporama pour les faire défiler toutes seules.',
    help: [
      ['Colonne droite', 'Choisir l’animation (page 1 ou 2)'],
      ['Haut 1 / 2', 'Page 1 / page 2 des animations'],
      ['Haut 3', 'Diaporama (change toutes les 20 s)'],
      ['Haut 4', 'Sons (balayage, sirène, cœur…)'],
      ['Haut 5 / 6', 'Vitesse − / +']
    ],
    buttons: { top: ['P1', 'P2', 'Auto', '♪', '−', '+'], right: ANIMS.slice(0, 8).map((a) => a.icon) },
    ANIMS,

    start(api) {
      this.api = api;
      this.cur = U.clamp(U.store.get('demo.anim', 0), 0, ANIMS.length - 1);
      this.pageI = this.cur >= 8 ? 1 : 0;
      this.auto = U.store.get('demo.auto', false);
      this.sound = U.store.get('demo.sound', false);
      this.speed = U.store.get('demo.speed', 1);
      this.autoT = 0;
      this.setAnim(this.cur, true);
    },

    setAnim(i, silent) {
      this.cur = (i + ANIMS.length) % ANIMS.length;
      this.pageI = this.cur >= 8 ? 1 : 0;
      U.store.set('demo.anim', this.cur);
      this.s = {};
      ANIMS[this.cur].init(this.s);
      this.autoT = 0;
      this.legends();
      this.hud();
      if (!silent) this.api.refresh();
    },

    legends() { this.buttons.right = [...Array(8)].map((_, k) => (ANIMS[this.pageI * 8 + k] || {}).icon || ''); },

    hud() {
      this.api.hud({ Animation: ANIMS[this.cur].name, Vitesse: '×' + this.speed.toFixed(1), Diaporama: this.auto ? 'oui' : 'non', Sons: this.sound ? 'oui' : 'non' }, '');
    },

    update(dt, t) {
      if (this.auto) { this.autoT += dt; if (this.autoT > 20) this.setAnim(this.cur + 1); }
      ANIMS[this.cur].update(this.s, Math.min(0.1, dt * this.speed), t);
    },

    render(fb, t) {
      ANIMS[this.cur].render(this.s, fb, t);
      fb.button('top', 0, this.pageI === 0 ? [255, 255, 255] : [30, 30, 30]);
      fb.button('top', 1, this.pageI === 1 ? [255, 255, 255] : [30, 30, 30]);
      fb.button('top', 2, this.auto ? [0, 255, 0] : [0, 30, 0]);
      fb.button('top', 3, this.sound ? [0, 160, 255] : [0, 20, 30]);
      fb.button('top', 4, [70, 70, 70]); fb.button('top', 5, [70, 70, 70]);
      for (let k = 0; k < 8; k++) {
        const idx = this.pageI * 8 + k;
        if (!ANIMS[idx]) continue;
        fb.button('right', k, idx === this.cur ? [255, 255, 255] : U.hsv(idx * 30, 1, 0.25));
      }
    },

    onPad(x, y, v, down) {
      if (!down) return;
      if (this.cur === 0) this.s.drops.push({ x, y: y - 0.5, v: 9, len: 5 });
      else if (this.cur === 7) this.s.tiles[Math.floor(y / 2) * 4 + Math.floor(x / 2)] = U.hsv(U.rand(6) * 60, 1, 1);
      else if (this.cur === 9) this.s.cells[y * 8 + x] = this.s.cells[y * 8 + x] ? 0 : 1;
    },

    onButton(side, i, down) {
      if (!down) return;
      if (side === 'right') { const idx = this.pageI * 8 + i; if (ANIMS[idx]) this.setAnim(idx); return; }
      if (side !== 'top') return;
      if (i === 0 || i === 1) { this.pageI = i; this.legends(); LP.core.refreshLabels(); }
      else if (i === 2) { this.auto = !this.auto; U.store.set('demo.auto', this.auto); this.autoT = 0; }
      else if (i === 3) { this.sound = !this.sound; U.store.set('demo.sound', this.sound); }
      else if (i === 4 || i === 5) { this.speed = U.clamp(Math.round((this.speed + (i === 4 ? -0.25 : 0.25)) * 100) / 100, 0.25, 3); U.store.set('demo.speed', this.speed); }
      this.hud();
    },

    panel(el, api) {
      el.append(api.ui.select('Animation', ANIMS.map((a, i) => ({ value: i, label: a.name })), this.cur, (v) => this.setAnim(parseInt(v, 10))));
      el.append(api.ui.toggle('Diaporama (change toutes les 20 s)', this.auto, (v) => { this.auto = v; U.store.set('demo.auto', v); this.hud(); }));
      el.append(api.ui.toggle('Sons (balayage K2000, sirène, cœur, radar…)', this.sound, (v) => { this.sound = v; U.store.set('demo.sound', v); this.hud(); }));
      el.append(api.ui.range('Vitesse', 0.25, 3, 0.25, this.speed, (v) => { this.speed = v; U.store.set('demo.speed', v); this.hud(); }, (v) => '×' + v));
      el.append(api.ui.buttons([{ label: '🎤 Faire parler KITT avec mon micro', cls: 'ghost', onClick: async () => {
        try { await LP.audioin.useDevice(''); this.setAnim(2); api.toast('Parle dans le micro !'); } catch (e) { api.toast(LP.audioin.errorText(e)); }
      } }]));
      el.append(api.ui.note('Touche les pads : une goutte en mode Matrix, une dalle en mode Disco, une cellule dans le Jeu de la vie.'));
    }
  };
  LP.apps.register(DEMO);
})(window.LP);
