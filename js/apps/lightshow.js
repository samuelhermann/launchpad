/* Light show : animations qui réagissent au son (sons de l'appli, micro ou fichier audio). */
(function (LP) {
  'use strict';
  const U = LP.U, h = U.h;
  const AI = LP.audioin;

  const MODES = [
    { id: 'bars', name: 'Spectre' },
    { id: 'mirror', name: 'Spectre miroir' },
    { id: 'ripples', name: 'Ondes' },
    { id: 'rain', name: 'Pluie' },
    { id: 'plasma', name: 'Plasma' },
    { id: 'fireworks', name: 'Feux d’artifice' },
    { id: 'stars', name: 'Étoiles' },
    { id: 'text', name: 'Texte défilant' }
  ];
  const PALETTES = [
    { name: 'Arc-en-ciel', f: (k, t) => U.hsv(k * 300 + t * 20, 1, 1) },
    { name: 'Feu', f: (k) => U.mix([255, 0, 0], [255, 230, 40], k) },
    { name: 'Océan', f: (k) => U.mix([0, 20, 255], [0, 255, 200], k) },
    { name: 'Néon', f: (k) => U.mix([255, 0, 200], [0, 220, 255], k) },
    { name: 'Forêt', f: (k) => U.mix([0, 120, 20], [200, 255, 0], k) }
  ];

  LP.apps.register({
    id: 'lightshow', name: 'Light show', cat: 'musique', emoji: '✨', color: [255, 0, 200],
    short: 'Animations qui dansent sur la musique',
    icon: (t) => [U.hsv(t * 90, 1, 1), U.hsv(t * 90 + 90, 1, 1), U.hsv(t * 90 + 270, 1, 1), U.hsv(t * 90 + 180, 1, 1)],
    desc: 'Le Launchpad s’anime en rythme avec le son : la musique de l’appli, un onglet Chrome (YouTube, Spotify Web…), Spotify via BlackHole, le micro ou un fichier. Touche les pads pour ajouter des ondes de lumière.',
    help: [
      ['Colonne droite', 'Choisir l’animation (8 modes)'],
      ['Haut 1 / 2 / 3', 'Source : appli / micro / fichier'],
      ['Haut 5 / 6', 'Sensibilité − / +'],
      ['Haut 7', 'Changer de palette de couleurs'],
      ['Pads', 'Ajouter une onde de lumière']
    ],
    buttons: { top: ['App', 'Mic', 'Fich.', '', '−', '+', '🎨'], right: ['▮▮', '◆', '◎', '☂', '≈', '✺', '★', 'Abc'] },

    start(api) {
      this.api = api;
      this.mode = U.store.get('ls.mode', 0);
      this.pal = U.store.get('ls.pal', 0);
      this.text = U.store.get('ls.text', 'LAUNCHPAD ARCADE');
      this.bands = AI.bands;
      this.level = 0; this.beat = 0;
      this.ripples = []; this.drops = []; this.sparks = []; this.stars = [];
      this.scroller = new LP.font.Scroller(this.text, null, { loop: true, speed: 9 });
      this.hud();
    },

    hud() {
      this.api.hud({ Animation: MODES[this.mode].name, Source: AI.label, Palette: PALETTES[this.pal].name, Sensibilité: Math.round(AI.sens * 100) + ' %' },
        AI.source === 'app' && !LP.transport.playing ? 'Astuce : lance un rythme, ou choisis une source (onglet Chrome, Spotify, micro) dans le panneau.' : '');
    },

    analyse(t) {
      AI.analyse(t);
      this.bands = AI.bands;
      this.level = AI.level;
      if (AI.beat) this.onBeat(t);
      this.beat *= 0.9;
    },

    onBeat() {
      this.beat = 1;
      const m = MODES[this.mode].id;
      if (m === 'ripples') this.ripples.push({ x: U.rand(8), y: U.rand(8), age: 0, hue: Math.random() });
      if (m === 'fireworks') this.burst(U.rand(8), U.rand(6));
    },

    burst(x, y) {
      const hue = Math.random();
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 5;
        this.sparks.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8 + Math.random() * 0.5, age: 0, hue });
      }
    },

    update(dt, t) {
      this.analyse(t);
      this.ripples = this.ripples.filter((r) => (r.age += dt) < 1.4);
      for (const s of this.sparks) { s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 6 * dt; s.vx *= 0.97; }
      this.sparks = this.sparks.filter((s) => s.age < s.life);
      const m = MODES[this.mode].id;
      if (m === 'rain') {
        if (Math.random() < 0.15 + this.level * 1.2) this.drops.push({ x: U.rand(8), y: -1, v: 6 + Math.random() * 6 + this.level * 14 });
        for (const d of this.drops) d.y += d.v * dt;
        this.drops = this.drops.filter((d) => d.y < 10);
      }
      if (m === 'fireworks' && Math.random() < dt * 0.6) this.burst(U.rand(8), U.rand(5));
      if (m === 'stars') {
        if (Math.random() < 0.2 + this.level * 2) this.stars.push({ x: U.rand(8), y: U.rand(8), age: 0, life: 0.4 + Math.random(), hue: Math.random() });
        this.stars = this.stars.filter((s) => (s.age += dt) < s.life);
      }
      if (m === 'text') this.scroller.update(dt * (1 + this.level));
    },

    pc(k, t) { return PALETTES[this.pal].f(U.clamp(k, 0, 1), t); },

    render(fb, t) {
      const m = MODES[this.mode].id;
      if (m === 'bars') {
        for (let x = 0; x < 8; x++) {
          const hgt = this.bands[x] * 8;
          for (let y = 0; y < 8; y++) {
            const lvl = 7 - y;
            const k = U.clamp(hgt - lvl, 0, 1);
            if (k > 0) fb.set(x, y, U.scale(this.pc(lvl / 7, t), k));
          }
          if (hgt < 0.3) fb.set(x, 7, U.scale(this.pc(0, t), 0.12));
        }
      } else if (m === 'mirror') {
        for (let x = 0; x < 8; x++) {
          const b = this.bands[x < 4 ? 3 - x : x - 4];
          const hgt = b * 4;
          for (let d = 0; d < 4; d++) {
            const k = U.clamp(hgt - d, 0, 1);
            if (k <= 0) continue;
            const c = U.scale(this.pc(d / 3, t), k);
            fb.set(x, 3 - d, c); fb.set(x, 4 + d, c);
          }
          if (hgt < 0.3) { const c = U.scale(this.pc(0, t), 0.1); fb.set(x, 3, c); fb.set(x, 4, c); }
        }
      } else if (m === 'plasma') {
        const sp = 1 + this.level * 3;
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const v = Math.sin(x * 0.7 + t * sp) + Math.sin(y * 0.6 - t * sp * 0.7) + Math.sin((x + y) * 0.5 + t * 0.9) + Math.sin(Math.hypot(x - 3.5, y - 3.5) * 0.9 - t * 2);
          const k = (v + 4) / 8;
          fb.set(x, y, U.scale(this.pc(k, t), 0.35 + 0.65 * Math.max(this.level * 1.5, 0.4) + this.beat * 0.3));
        }
      } else if (m === 'rain') {
        for (const d of this.drops) {
          for (let k = 0; k < 3; k++) {
            const y = Math.floor(d.y) - k;
            fb.add(d.x, y, U.scale(this.pc(0.6 + this.level, t), [1, 0.35, 0.1][k]));
          }
        }
      } else if (m === 'stars') {
        for (const s of this.stars) {
          const k = Math.sin(Math.PI * s.age / s.life);
          fb.add(s.x, s.y, U.scale(this.pc(s.hue, t), k));
        }
      } else if (m === 'text') {
        this.scroller.color = (x, y, i) => this.pc((i % 24) / 24, t);
        this.scroller.render(fb, t);
      }
      if (m === 'fireworks') {
        for (const s of this.sparks) {
          const k = 1 - s.age / s.life;
          fb.add(Math.floor(s.x), Math.floor(s.y), U.scale(this.pc(s.hue, t), k));
        }
      }
      for (const r of this.ripples) {
        const rad = r.age * 7, k = 1 - r.age / 1.4;
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const d = Math.abs(Math.hypot(x - r.x, y - r.y) - rad);
          if (d < 1) fb.add(x, y, U.scale(this.pc(r.hue, t), k * (1 - d)));
        }
      }
      // Boutons
      const srcs = [['app'], ['device', 'blackhole', 'tab'], ['file']];
      srcs.forEach((s, i) => fb.button('top', i, s.indexOf(AI.source) >= 0 ? [0, 255, 120] : [0, 30, 15]));
      fb.button('top', 4, [90, 90, 90]); fb.button('top', 5, [90, 90, 90]);
      fb.button('top', 6, this.pc(((t * 0.3) % 1), t));
      MODES.forEach((mm, i) => fb.button('right', i, i === this.mode ? [255, 255, 255] : U.scale(this.pc(i / 7, t), 0.25)));
      fb.setLogo(U.scale(this.pc(this.level, t), 0.3 + this.beat * 0.7));
    },

    onPad(x, y, v, down) {
      if (!down) return;
      const m = MODES[this.mode].id;
      if (m === 'fireworks') this.burst(x, y);
      else this.ripples.push({ x, y, age: 0, hue: Math.random() });
    },

    onButton(side, i, down) {
      if (!down) return;
      if (side === 'right') this.setMode(i);
      if (side === 'top') {
        if (i === 0) AI.useApp();
        else if (i === 1) AI.useDevice('').catch((e) => this.api.toast(AI.errorText(e)));
        else if (i === 2) { if (!AI.toggleFile()) this.api.toast('Choisis un fichier audio dans le panneau à droite de l’écran.'); }
        else if (i === 4) AI.setSens(AI.sens - 0.15);
        else if (i === 5) AI.setSens(AI.sens + 0.15);
        else if (i === 6) { this.pal = (this.pal + 1) % PALETTES.length; U.store.set('ls.pal', this.pal); this.api.refresh(); }
      }
      this.hud();
    },

    setMode(i) { this.mode = i; U.store.set('ls.mode', i); this.ripples = []; this.drops = []; this.sparks = []; this.stars = []; this.api.refresh(); },
    panel(el, api) {
      el.append(api.ui.select('Animation', MODES.map((m, i) => ({ value: i, label: m.name })), this.mode, (v) => this.setMode(parseInt(v, 10))));
      el.append(api.ui.select('Palette', PALETTES.map((p, i) => ({ value: i, label: p.name })), this.pal, (v) => { this.pal = parseInt(v, 10); U.store.set('ls.pal', this.pal); this.hud(); }));
      const ti = h('input', { type: 'text', value: this.text, maxlength: 60, oninput: () => { this.text = ti.value || ' '; U.store.set('ls.text', this.text); this.scroller = new LP.font.Scroller(this.text, null, { loop: true, speed: 9 }); } });
      el.append(api.ui.row('Texte défilant (mode « Texte »)', ti));
      el.append(h('h3', null, 'Source du son'));
      AI.panel(el, api);
    }
  });
})(window.LP);
