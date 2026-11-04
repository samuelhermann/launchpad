/* Visualiseur musical : la musique d'un onglet Chrome, de Spotify (BlackHole), du micro… sur le Launchpad. */
(function (LP) {
  'use strict';
  const U = LP.U, h = U.h;
  const AI = LP.audioin;

  const MODES = [
    { id: 'eq', name: 'Égaliseur', icon: '▮▮' },
    { id: 'mirror', name: 'Égaliseur miroir', icon: '◆' },
    { id: 'waterfall', name: 'Spectrogramme', icon: '≋' },
    { id: 'scope', name: 'Oscilloscope', icon: '∿' },
    { id: 'vu', name: 'VU-mètre stéréo', icon: 'LR' },
    { id: 'pulse', name: 'Pulsation', icon: '◎' },
    { id: 'rings', name: 'Anneaux', icon: '◉' },
    { id: 'color', name: 'Couleur pleine', icon: '■' }
  ];
  const PALETTES = [
    { name: 'Classique', f: (k) => (k < 0.6 ? [0, 255, 0] : k < 0.85 ? [255, 190, 0] : [255, 0, 0]) },
    { name: 'Arc-en-ciel', f: (k) => U.hsv(k * 290, 1, 1) },
    { name: 'Néon', f: (k) => U.mix([255, 0, 200], [0, 220, 255], k) },
    { name: 'Océan', f: (k) => U.mix([0, 30, 255], [0, 255, 190], k) },
    { name: 'Feu', f: (k) => U.mix([255, 0, 0], [255, 220, 0], k) }
  ];
  const q = (v, steps) => Math.round(U.clamp(v, 0, 1) * steps) / steps; // paliers -> moins de messages MIDI

  LP.apps.register({
    id: 'visualizer', name: 'Visualiseur', cat: 'musique', emoji: '🎶', color: [0, 255, 160],
    short: 'La musique de YouTube, Spotify… en lumière',
    icon: [[0, 255, 0], [0, 0, 0], [0, 255, 0], [255, 190, 0]],
    desc: 'Fais danser le Launchpad sur la musique que tu écoutes : un onglet Chrome (YouTube, Spotify Web, Deezer…), l’appli Spotify / Musique du Mac (avec BlackHole), le micro ou un fichier. Le gain est automatique : ça marche à faible comme à fort volume.',
    help: [
      ['Colonne droite', 'Choisir le mode (8 visualisations)'],
      ['Haut 1 / 2', 'Sensibilité − / +'],
      ['Haut 3', 'Changer de palette'],
      ['Haut 4', 'Diaporama : change de mode toutes les 15 s'],
      ['Pads', 'Flash de lumière']
    ],
    buttons: { top: ['−', '+', '🎨', 'Auto'], right: MODES.map((m) => m.icon) },

    start(api) {
      this.api = api;
      this.mode = U.store.get('viz.mode', 0);
      this.pal = U.store.get('viz.pal', 0);
      this.auto = U.store.get('viz.auto', false);
      this.peaks = new Float32Array(8); this.peakT = new Float32Array(8);
      this.vuPeak = [0, 0];
      this.hist = []; for (let x = 0; x < 8; x++) this.hist.push(new Float32Array(8));
      this.wfAcc = 0; this.autoT = 0;
      this.rings = []; this.flash = 0;
      this.offAI = this.offAI || AI.on('change', () => { if (LP.core.current === this) this.hud(); });
      this.hud();
    },

    hud() {
      this.api.hud({ Mode: MODES[this.mode].name, Source: AI.label, Tempo: AI.bpm ? '≈ ' + AI.bpm + ' BPM' : '–', Sensibilité: Math.round(AI.sens * 100) + ' %' },
        AI.source === 'app' ? 'Choisis une source dans le panneau de droite : onglet Chrome, Spotify (BlackHole), micro…' : '');
    },

    pc(k) { return PALETTES[this.pal].f(U.clamp(k, 0, 1)); },

    setMode(i) { this.mode = (i + MODES.length) % MODES.length; U.store.set('viz.mode', this.mode); this.rings = []; this.autoT = 0; this.hud(); this.api.refresh(); },

    update(dt, t) {
      AI.analyse(t);
      if (this.auto) { this.autoT += dt; if (this.autoT > 15) this.setMode(this.mode + 1); }
      if (this.flash > 0) this.flash -= dt;
      // Pics qui retombent (égaliseur, VU)
      for (let x = 0; x < 8; x++) {
        const hgt = Math.round(AI.bands[x] * 8);
        if (hgt >= this.peaks[x]) { this.peaks[x] = hgt; this.peakT[x] = t; }
        else if (t - this.peakT[x] > 0.35) { this.peaks[x] = Math.max(hgt, this.peaks[x] - 1); this.peakT[x] = t - 0.25; }
      }
      for (let i = 0; i < 2; i++) this.vuPeak[i] = Math.max(Math.round(AI.vu[i] * 8), this.vuPeak[i] - dt * 4);
      // Spectrogramme : une nouvelle colonne toutes les 0,18 s
      this.wfAcc += dt;
      if (this.wfAcc > 0.18) {
        this.wfAcc = 0;
        this.hist.shift();
        const col = new Float32Array(8);
        for (let b = 0; b < 8; b++) col[b] = q(AI.bands[b], 3);
        this.hist.push(col);
      }
      if (AI.beat) { this.rings.push({ age: 0, k: Math.random() }); if (AI.bpm) this.hud(); }
      this.rings = this.rings.filter((r) => (r.age += dt) < 0.6);
      if (Math.floor(t) !== this._sec) { this._sec = Math.floor(t); this.hud(); }
    },

    render(fb, t) {
      const m = MODES[this.mode].id;
      const B = AI.bands;
      if (m === 'eq') {
        for (let x = 0; x < 8; x++) {
          const hgt = Math.round(B[x] * 8);
          for (let j = 0; j < hgt; j++) fb.set(x, 7 - j, this.pc(j / 7));
          const p = this.peaks[x];
          if (p > hgt && p > 0) fb.set(x, 8 - p, [200, 200, 200]);
        }
      } else if (m === 'mirror') {
        for (let x = 0; x < 8; x++) {
          const band = x < 4 ? (3 - x) * 2 : (x - 4) * 2;
          const hgt = Math.round(Math.max(B[band], B[band + 1]) * 4);
          for (let d = 0; d < hgt; d++) { const c = this.pc(d / 3); fb.set(x, 3 - d, c); fb.set(x, 4 + d, c); }
        }
      } else if (m === 'waterfall') {
        for (let x = 0; x < 8; x++) for (let b = 0; b < 8; b++) {
          const v = this.hist[x][b];
          if (v > 0) fb.set(x, 7 - b, U.scale(this.pc(v), v));
        }
      } else if (m === 'scope') {
        let prev = null;
        for (let x = 0; x < 8; x++) {
          const y = Math.round(U.clamp(3.5 - AI.wave[x] / AI.waveMax * 3.6, 0, 7));
          const c = this.pc(x / 7);
          if (prev !== null) { const a = Math.min(prev, y), b = Math.max(prev, y); for (let yy = a; yy <= b; yy++) fb.set(x, yy, U.scale(c, yy === y ? 1 : 0.35)); }
          fb.set(x, y, c);
          prev = y;
        }
      } else if (m === 'vu') {
        for (let s = 0; s < 2; s++) {
          const hgt = Math.round(AI.vu[s] * 8), x0 = s ? 5 : 0;
          for (let j = 0; j < hgt; j++) for (let x = x0; x < x0 + 3; x++) fb.set(x, 7 - j, this.pc(j / 7));
          const p = Math.round(this.vuPeak[s]);
          if (p > hgt) for (let x = x0; x < x0 + 3; x++) fb.set(x, 8 - p, [200, 200, 200]);
        }
        if (AI.beatT && t - AI.beatT < 0.12) fb.rect(3, 6, 2, 2, [255, 255, 255]);
      } else if (m === 'pulse') {
        const core = q(AI.level * 1.6, 3);
        if (core > 0) fb.rect(3, 3, 2, 2, U.scale(this.pc(0.2), core));
        for (const r of this.rings) {
          const ring = Math.min(3, Math.floor(r.age / 0.6 * 4));
          const c = U.scale(this.pc(r.k), 1 - ring * 0.22);
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            if (Math.max(Math.abs(x - 3.5), Math.abs(y - 3.5)) === ring + 0.5) fb.set(x, y, c);
          }
        }
      } else if (m === 'rings') {
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const ring = Math.max(Math.abs(x - 3.5), Math.abs(y - 3.5)) - 0.5; // 0 au centre, 3 au bord
          const v = q(Math.max(B[ring * 2], B[ring * 2 + 1]), 3);
          if (v > 0.3) fb.set(x, y, U.scale(this.pc(ring / 3), v));
        }
      } else if (m === 'color') {
        let best = 0;
        for (let b = 1; b < 8; b++) if (B[b] > B[best]) best = b;
        const k = q(AI.level * 1.4, 4);
        let c = U.scale(this.pc(best / 7), k);
        if (AI.beatT && t - AI.beatT < 0.08) c = U.mix(c, [255, 255, 255], 0.5);
        if (k > 0) fb.fill(c);
      }
      if (this.flash > 0) fb.fill(U.scale([255, 255, 255], this.flash / 0.15));
      fb.button('top', 0, [70, 70, 70]); fb.button('top', 1, [70, 70, 70]);
      fb.button('top', 2, this.pc(0.5));
      fb.button('top', 3, this.auto ? [255, 255, 255] : [25, 25, 25]);
      MODES.forEach((mm, i) => fb.button('right', i, i === this.mode ? [255, 255, 255] : U.scale(this.pc(i / 7), 0.2)));
      fb.setLogo(AI.beatT && t - AI.beatT < 0.1 ? [255, 255, 255] : [0, 0, 0]);
    },

    onPad(x, y, v, down) { if (down) this.flash = 0.15; },

    onButton(side, i, down) {
      if (!down) return;
      if (side === 'right') return this.setMode(i);
      if (side !== 'top') return;
      if (i === 0) AI.setSens(AI.sens - 0.15);
      else if (i === 1) AI.setSens(AI.sens + 0.15);
      else if (i === 2) { this.pal = (this.pal + 1) % PALETTES.length; U.store.set('viz.pal', this.pal); this.api.refresh(); }
      else if (i === 3) { this.auto = !this.auto; U.store.set('viz.auto', this.auto); this.autoT = 0; this.api.refresh(); }
      this.hud();
    },

    panel(el, api) {
      el.append(api.ui.select('Mode', MODES.map((m, i) => ({ value: i, label: m.name })), this.mode, (v) => this.setMode(parseInt(v, 10))));
      el.append(api.ui.select('Palette', PALETTES.map((p, i) => ({ value: i, label: p.name })), this.pal, (v) => { this.pal = parseInt(v, 10); U.store.set('viz.pal', this.pal); }));
      el.append(api.ui.toggle('Diaporama (change de mode toutes les 15 s)', this.auto, (v) => { this.auto = v; U.store.set('viz.auto', v); this.autoT = 0; }));
      el.append(h('h3', null, 'Source du son'));
      AI.panel(el, api);
    }
  });
})(window.LP);
