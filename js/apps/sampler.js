/*
 * Sampler 16 mots (inspiré d'iDaft) : 16 tuiles 2x2, chacune joue un son.
 * Les sons ne sont PAS fournis : chacun dépose ses fichiers ou enregistre sa voix.
 * Ils sont gardés dans le navigateur (IndexedDB), jamais dans le dépôt.
 * Sans son, un pad prononce son mot avec une voix de synthèse du Mac.
 */
(function (LP) {
  'use strict';
  const U = LP.U, h = U.h, A = LP.audio, T = LP.transport;

  const PACKS = [
    { id: 'hbfs', name: '16 mots (façon iDaft)', bpm: 123, colors: [[0, 200, 255], [255, 0, 200], [255, 190, 0], [0, 255, 120]],
      words: ['Work it', 'Make it', 'Do it', 'Makes us', 'Harder', 'Better', 'Faster', 'Stronger', 'More than', 'Hour', 'Our', 'Never', 'Ever', 'After', 'Work is', 'Over'] },
    { id: 'robot', name: 'Mots robots', bpm: 118, colors: [[255, 60, 0], [0, 255, 60], [0, 120, 255], [200, 200, 255]],
      words: ['Go', 'Stop', 'Yes', 'No', 'One', 'Two', 'Three', 'Four', 'Up', 'Down', 'Left', 'Right', 'Robot', 'Music', 'Again', 'Bravo'] },
    { id: 'perso', name: 'Mes sons', bpm: 120, colors: [[255, 0, 80], [255, 140, 0], [0, 200, 120], [120, 80, 255]],
      words: [...Array(16)].map((_, i) => 'Son ' + (i + 1)) }
  ];
  const AUDIO_RE = /\.(wav|mp3|m4a|aac|ogg|oga|flac|aif|aiff|webm|opus)$/i;
  const norm = (s) => U.plain(String(s).replace(/\.[^.]+$/, '')).toLowerCase().replace(/[^a-z0-9]/g, '');

  /* Coupe le silence au début / à la fin et normalise le volume (enregistrements micro) */
  function trim(buf) {
    const ch = buf.getChannelData(0), n = ch.length, rate = buf.sampleRate;
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(ch[i]));
    if (peak < 1e-4) return buf;
    const th = peak * 0.08;
    let s = 0, e = n - 1;
    while (s < n && Math.abs(ch[s]) < th) s++;
    while (e > s && Math.abs(ch[e]) < th) e--;
    s = Math.max(0, s - Math.floor(rate * 0.01)); e = Math.min(n, e + Math.floor(rate * 0.08));
    const out = A.ctx.createBuffer(1, Math.max(1, e - s), rate), o = out.getChannelData(0), g = 0.9 / peak;
    const fade = Math.floor(rate * 0.005);
    for (let i = 0; i < o.length; i++) o[i] = ch[s + i] * g * Math.min(1, i / fade, (o.length - i) / fade);
    return out;
  }

  LP.apps.register({
    id: 'sampler', name: 'Sampler 16 mots', cat: 'musique', emoji: '🤖', color: [0, 200, 255],
    short: 'Façon iDaft : 16 mots à jouer en rythme',
    icon: [[0, 200, 255], [255, 0, 200], [255, 190, 0], [0, 255, 120]],
    desc: 'Inspiré d’iDaft : 16 tuiles, chacune joue un mot. Dépose tes propres sons (ils restent dans ce navigateur, jamais en ligne) ou enregistre ta voix, avec un effet robot (vocodeur). Sans son, la tuile prononce son mot avec une voix de synthèse.',
    help: [
      ['Tuiles 2×2', 'Jouer le son (ou le mot en voix de synthèse)'],
      ['Droite 1', 'Mode enregistrement : maintiens une tuile et parle'],
      ['Droite 2', 'Effet robot (vocodeur)'],
      ['Droite 3', 'Calé sur le tempo de la boîte à rythmes'],
      ['Droite 4', 'Lancer / arrêter un rythme d’accompagnement'],
      ['Droite 6 / 7 / 8', 'Jeu de sons : 16 mots / mots robots / mes sons'],
      ['Haut 1', 'Couper tous les sons']
    ],
    buttons: { top: ['■'], right: ['●', '🤖', '⏱', '🥁', '', 'iDaft', 'Robot', 'Perso'] },

    start(api) {
      this.api = api;
      this.packI = U.clamp(U.store.get('smp.pack', 0), 0, PACKS.length - 1);
      this.robotOn = U.store.get('smp.robot', false);
      this.robotNote = U.store.get('smp.note', 48);
      this.quant = U.store.get('smp.quant', true);
      this.mono = U.store.get('smp.mono', false);
      this.recMode = false; this.recK = -1;
      this.playing = {}; this.spoken = null;
      if (!this.hooked) {
        this.hooked = true;
        A.on('start', () => this.decodePending());
        if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { if (LP.core.current === this) this.api.refresh(); };
      }
      this.load();
    },

    stop() { if (this.recMode) this.setRec(false, true); },

    pack() { return PACKS[this.packI]; },
    labels() { return U.store.get('smp.labels.' + this.pack().id, null) || this.pack().words; },
    key(k) { return 'smp:' + this.pack().id + ':' + k; },
    loaded() { return this.buf.filter(Boolean).length; },

    hud() {
      this.api.hud({ Jeu: this.pack().name, Sons: this.loaded() + ' / 16', Robot: this.robotOn ? 'oui' : 'non', 'Calé tempo': this.quant ? 'oui' : 'non' },
        this.recMode ? '🎤 Mode enregistrement : maintiens une tuile, parle, puis relâche.' : this.loaded() ? '' : 'Pas encore de sons : les tuiles parlent avec une voix de synthèse. Dépose tes fichiers dans le panneau de droite.');
    },

    async load() {
      const packId = this.pack().id;
      this.buf = new Array(16).fill(null); this.meta = new Array(16).fill(null); this.pending = [];
      this.hud();
      for (let k = 0; k < 16; k++) {
        try {
          const rec = await LP.db.get('smp:' + packId + ':' + k);
          if (rec && rec.blob && this.pack().id === packId) { this.meta[k] = { kind: rec.kind, name: rec.name }; await this.decode(k, rec.blob, rec.kind, packId); }
        } catch (e) { /* stockage indisponible */ }
      }
      if (LP.core.current === this) { this.hud(); this.api.refresh(); }
    },

    async decode(k, blob, kind, packId) {
      if (!A.ready()) { this.pending.push([k, blob, kind, packId]); return; }
      try {
        let buf = await A.ctx.decodeAudioData(await blob.arrayBuffer());
        if (kind === 'rec') buf = trim(buf);
        if (this.pack().id === packId) this.buf[k] = buf;
      } catch (e) { this.api.toast('Format audio non reconnu pour « ' + this.labels()[k] + ' ».'); }
    },
    async decodePending() {
      const list = this.pending || []; this.pending = [];
      for (const p of list) await this.decode.apply(this, p);
      if (LP.core.current === this) this.hud();
    },

    async setSample(k, blob, kind, name) {
      this.meta[k] = { kind, name };
      try { await LP.db.set(this.key(k), { blob, kind, name }); } catch (e) { /* gardé seulement jusqu'à la fermeture */ }
      await this.decode(k, blob, kind, this.pack().id);
      this.hud();
    },
    async clearSample(k) {
      this.buf[k] = null; this.meta[k] = null;
      try { await LP.db.del(this.key(k)); } catch (e) { /* ignore */ }
      this.hud();
    },

    /* Range des fichiers sous les bons mots (par nom), le reste dans les tuiles libres */
    async assignFiles(files) {
      const list = [...files].filter((f) => /^audio\//.test(f.type) || AUDIO_RE.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
      const wn = this.labels().map(norm);
      const assign = new Map(), used = new Set();
      for (const f of list) { const k = wn.indexOf(norm(f.name)); if (k >= 0 && !assign.has(k)) { assign.set(k, f); used.add(f); } }
      const order = wn.map((w, k) => k).sort((a, b) => wn[b].length - wn[a].length);
      for (const f of list) {
        if (used.has(f)) continue;
        const fn = norm(f.name);
        const k = order.find((j) => !assign.has(j) && wn[j] && fn.indexOf(wn[j]) >= 0);
        if (k !== undefined) { assign.set(k, f); used.add(f); }
      }
      for (const f of list) {
        if (used.has(f)) continue;
        let k = 0;
        while (k < 16 && (assign.has(k) || this.buf[k])) k++;
        if (k < 16) { assign.set(k, f); used.add(f); }
      }
      for (const [k, f] of assign) await this.setSample(k, f, 'file', f.name);
      this.api.toast(assign.size + ' son(s) chargé(s)' + (list.length > assign.size ? ', ' + (list.length - assign.size) + ' ignoré(s) (plus de place)' : '') + '.');
      this.api.refresh();
    },

    /* ---------- Lecture ---------- */
    play(k) {
      const b = this.buf[k];
      if (!b) { this.speak(k); return; }
      if (!A.ready()) return;
      const now = A.ctx.currentTime;
      let when = now;
      if (this.quant && T.playing) { const sd = T.stepDur(); let tt = T._next; while (tt - sd >= now) tt -= sd; when = Math.max(now, tt); }
      if (this.mono) Object.keys(this.playing).forEach((j) => this.stopPad(j, when)); else this.stopPad(k, when);
      const src = A.ctx.createBufferSource(); src.buffer = b;
      const g = A.ctx.createGain();
      src.connect(g); g.connect(this.robotOn ? this.vocoder().input : A.bus);
      src.start(when);
      this.playing[k] = { src, g, start: when, end: when + b.duration };
      src.onended = () => { if (this.playing[k] && this.playing[k].src === src) delete this.playing[k]; };
    },
    stopPad(k, when) {
      const p = this.playing[k];
      if (!p) return;
      try { p.g.gain.setTargetAtTime(0, when, 0.008); p.src.stop(when + 0.04); } catch (e) { /* ignore */ }
      delete this.playing[k];
    },
    stopAll() {
      if (A.ready()) Object.keys(this.playing).forEach((k) => this.stopPad(k, A.ctx.currentTime));
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    },

    voices() { return 'speechSynthesis' in window ? speechSynthesis.getVoices() : []; },
    voice() {
      const vs = this.voices(), pref = U.store.get('smp.voice', '');
      return vs.find((v) => v.name === pref) || vs.find((v) => /Zarvox|Trinoids|Fred|Ralph|Albert/i.test(v.name))
        || vs.find((v) => /^en[-_]US/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
    },
    speak(k) {
      if (!('speechSynthesis' in window)) { this.api.toast('Pas de son pour cette tuile : dépose un fichier ou enregistre ta voix.'); return; }
      const u = new SpeechSynthesisUtterance(this.labels()[k]);
      const v = this.voice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = 1.1; u.pitch = 0.5;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
      this.spoken = { k, until: U.now() + 0.6 };
    },

    /* ---------- Effet robot : vocodeur 16 bandes en Web Audio ---------- */
    vocoder() {
      if (this.voc) return this.voc;
      const ctx = A.ctx;
      const input = ctx.createGain();
      const out = ctx.createGain(); out.gain.value = 2.5; out.connect(A.bus);
      const carrier = ctx.createGain(); carrier.gain.value = 0.5;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = o2.type = 'sawtooth'; o2.detune.value = 7;
      o1.connect(carrier); o2.connect(carrier); o1.start(); o2.start();
      const curve = new Float32Array(2048);
      for (let i = 0; i < 2048; i++) curve[i] = Math.abs(i / 1023.5 - 1);
      const N = 16;
      for (let b = 0; b < N; b++) {
        const f = 140 * Math.pow(7500 / 140, b / (N - 1));
        const mbp = ctx.createBiquadFilter(); mbp.type = 'bandpass'; mbp.frequency.value = f; mbp.Q.value = 6;
        const abs = ctx.createWaveShaper(); abs.curve = curve;
        const env = ctx.createBiquadFilter(); env.type = 'lowpass'; env.frequency.value = 30;
        const amp = ctx.createGain(); amp.gain.value = 8;
        input.connect(mbp); mbp.connect(abs); abs.connect(env); env.connect(amp);
        const cbp = ctx.createBiquadFilter(); cbp.type = 'bandpass'; cbp.frequency.value = f; cbp.Q.value = 6;
        const vca = ctx.createGain(); vca.gain.value = 0;
        carrier.connect(cbp); cbp.connect(vca); amp.connect(vca.gain); vca.connect(out);
      }
      const hiss = ctx.createBiquadFilter(); hiss.type = 'highpass'; hiss.frequency.value = 6000;
      const hg = ctx.createGain(); hg.gain.value = 0.25;
      input.connect(hiss); hiss.connect(hg); hg.connect(out);
      this.voc = { input, o1, o2 };
      this.setRobotNote(this.robotNote);
      return this.voc;
    },
    setRobotNote(m) {
      this.robotNote = m; U.store.set('smp.note', m);
      if (this.voc) { const f = A.mtof(m), t = A.ctx.currentTime; this.voc.o1.frequency.setTargetAtTime(f, t, 0.02); this.voc.o2.frequency.setTargetAtTime(f * 2, t, 0.02); }
    },

    /* ---------- Enregistrement micro ---------- */
    async setRec(on, quiet) {
      if (on) {
        try { this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
        catch (e) { this.api.toast('Micro refusé : autorise-le dans Chrome pour enregistrer.'); return; }
        this.recMode = true;
      } else {
        this.recMode = false;
        if (this.recorder && this.recorder.state === 'recording') this.recorder.stop();
        if (this.mic) this.mic.getTracks().forEach((t) => t.stop());
        this.mic = null;
      }
      if (!quiet) { this.hud(); this.api.refresh(); }
    },
    startRec(k) {
      if (!this.mic || (this.recorder && this.recorder.state === 'recording') || !window.MediaRecorder) return;
      const chunks = [], rec = new MediaRecorder(this.mic);
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        this.recK = -1;
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size) { await this.setSample(k, blob, 'rec', 'Enregistrement'); this.api.toast('🎤 « ' + this.labels()[k] + ' » enregistré !'); this.api.refresh(); }
      };
      rec.start();
      this.recorder = rec; this.recK = k;
      clearTimeout(this._recT);
      this._recT = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 4000);
    },
    stopRec(k) { if (this.recorder && this.recorder.state === 'recording' && this.recK === k) this.recorder.stop(); },

    toggleBeat() {
      if (T.playing) { T.stop(); return; }
      if (!T.drums.pattern.some((row) => row.some(Boolean))) {
        const p = T.blank();
        const set = (tr, s) => { for (let i = 0; i < 16; i++) if (s[i] === 'x') p[tr][i] = 1; };
        set(0, 'x...x...x...x...'); set(2, '....x.......x...'); set(3, '..x...x...x...x.');
        T.drums.pattern = p; T.save();
        T.setBpm(this.pack().bpm);
      }
      T.start();
    },

    /* ---------- Launchpad ---------- */
    label(x, y) { return x % 2 || y % 2 ? '' : (this.labels()[(y / 2) * 4 + x / 2] || '').slice(0, 9); },

    render(fb, t) {
      const cols = this.pack().colors, now = A.ready() ? A.ctx.currentTime : 0;
      for (let k = 0; k < 16; k++) {
        const base = cols[k >> 2];
        let c;
        if (this.recMode) c = this.recK === k ? (Math.floor(t * 6) % 2 ? [255, 0, 0] : [80, 0, 0]) : U.scale([255, 0, 0], this.buf[k] ? 0.3 : 0.1);
        else {
          const p = this.playing[k];
          const on = (p && now >= p.start && now < p.end) || (this.spoken && this.spoken.k === k && U.now() < this.spoken.until);
          c = on ? U.mix(base, [255, 255, 255], 0.45) : U.scale(base, this.buf[k] ? 0.3 : 0.1);
        }
        fb.rect((k % 4) * 2, (k >> 2) * 2, 2, 2, c);
      }
      fb.button('top', 0, [110, 0, 0]);
      fb.button('right', 0, this.recMode ? [255, 0, 0] : [40, 0, 0]);
      fb.button('right', 1, this.robotOn ? [0, 255, 200] : [0, 35, 30]);
      fb.button('right', 2, this.quant ? [255, 255, 255] : [25, 25, 25]);
      fb.button('right', 3, T.playing ? [0, 255, 0] : [0, 40, 0]);
      PACKS.forEach((pk, i) => fb.button('right', 5 + i, i === this.packI ? pk.colors[0] : U.scale(pk.colors[0], 0.12)));
    },

    onPad(x, y, v, down) {
      const k = Math.floor(y / 2) * 4 + Math.floor(x / 2);
      if (this.recMode) { if (down) this.startRec(k); else this.stopRec(k); return; }
      if (down) this.play(k);
    },

    onButton(side, i, down) {
      if (!down) return;
      if (side === 'top' && i === 0) this.stopAll();
      if (side !== 'right') return;
      if (i === 0) this.setRec(!this.recMode);
      else if (i === 1) this.setRobot(!this.robotOn);
      else if (i === 2) { this.quant = !this.quant; U.store.set('smp.quant', this.quant); this.api.refresh(); }
      else if (i === 3) this.toggleBeat();
      else if (i >= 5) this.setPack(i - 5);
      this.hud();
    },

    setRobot(v) { this.robotOn = v; U.store.set('smp.robot', v); if (v && A.ready()) this.vocoder(); this.hud(); this.api.refresh(); },
    setPack(i) { if (i < 0 || i >= PACKS.length) return; this.stopAll(); this.packI = i; U.store.set('smp.pack', i); this.load(); this.api.refresh(); },

    /* ---------- Panneau ---------- */
    panel(el, api) {
      el.append(api.ui.seg('Jeu de sons', PACKS.map((p, i) => ({ value: i, label: p.name })), this.packI, (v) => this.setPack(v)));
      el.append(api.ui.buttons([
        { label: this.recMode ? '■ Arrêter le mode enregistrement' : '● Enregistrer ma voix', onClick: () => this.setRec(!this.recMode) },
        { label: T.playing ? '■ Arrêter le rythme' : '🥁 Rythme d’accompagnement', cls: 'ghost', onClick: () => { this.toggleBeat(); api.refresh(); } },
        { label: '■ Couper les sons', cls: 'ghost', onClick: () => this.stopAll() }
      ]));
      el.append(api.ui.toggle('Effet robot (vocodeur)', this.robotOn, (v) => this.setRobot(v)));
      el.append(api.ui.select('Note du robot', [36, 41, 43, 45, 48, 50, 53, 55, 57, 60].map((m) => ({ value: m, label: LP.music.name(m, true) })), this.robotNote, (v) => this.setRobotNote(parseInt(v, 10))));
      el.append(api.ui.toggle('Calé sur le tempo (quand le rythme joue)', this.quant, (v) => { this.quant = v; U.store.set('smp.quant', v); this.hud(); }));
      el.append(api.ui.toggle('Un seul son à la fois', this.mono, (v) => { this.mono = v; U.store.set('smp.mono', v); }));

      // Dépôt de fichiers
      el.append(h('h3', null, 'Mes sons'));
      const files = h('input', { type: 'file', accept: 'audio/*', multiple: true, onchange: () => this.assignFiles(files.files) });
      const folder = h('input', { type: 'file', webkitdirectory: true, multiple: true, onchange: () => this.assignFiles(folder.files) });
      const zone = h('div', { class: 'dropzone' }, 'Dépose ici tes fichiers audio (ou un dossier).', h('br'), h('small', null, 'Nomme-les comme les mots (ex. « work_it.wav ») pour qu’ils se rangent tout seuls.'));
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('over'));
      zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); this.assignFiles(e.dataTransfer.files); });
      el.append(zone);
      el.append(api.ui.row('Choisir des fichiers', files));
      el.append(api.ui.row('Ou charger un dossier entier', folder));

      // Liste des 16 tuiles
      const list = h('div', { class: 'padlist' });
      const labels = this.labels().slice();
      labels.forEach((w, k) => {
        const name = h('input', { type: 'text', value: w, maxlength: 16, oninput: () => { labels[k] = name.value || ' '; U.store.set('smp.labels.' + this.pack().id, labels); LP.core.refreshLabels(); } });
        const m = this.meta[k];
        const st = h('span', { class: 'st' }, m ? (m.kind === 'rec' ? '🎤 voix' : '🎵 fichier') : '🗣️ synthèse');
        const pick = h('input', { type: 'file', accept: 'audio/*', style: { display: 'none' }, onchange: async () => { if (pick.files[0]) { await this.setSample(k, pick.files[0], 'file', pick.files[0].name); api.refresh(); } } });
        list.append(h('div', null, name, pick), st, h('span', null,
          h('button', { title: 'Écouter', onclick: () => this.play(k) }, '▶'), ' ',
          h('button', { title: 'Choisir un fichier', onclick: () => pick.click() }, '📂'), ' ',
          m ? h('button', { title: 'Effacer le son', onclick: async () => { await this.clearSample(k); api.refresh(); } }, '✕') : null));
      });
      el.append(list);
      el.append(api.ui.buttons([{ label: 'Remettre les mots d’origine', cls: 'ghost', onClick: () => { U.store.set('smp.labels.' + this.pack().id, null); api.refresh(); LP.core.refreshLabels(); } }]));

      const vs = this.voices();
      if (vs.length) {
        const cur = this.voice();
        el.append(api.ui.select('Voix de synthèse (tuiles sans son)', vs.map((v) => ({ value: v.name, label: v.name + ' (' + v.lang + ')' })), cur ? cur.name : '', (v) => U.store.set('smp.voice', v)));
      }
      el.append(h('details', { class: 'howto' }, h('summary', null, 'Utiliser les sons d’un morceau à titre privé'),
        h('ol', null,
          h('li', null, 'Les sons que tu déposes restent uniquement dans ce navigateur, sur ton Mac : ils ne vont jamais sur GitHub.'),
          h('li', null, 'Le plus sûr : découpe les mots dans ta propre copie du morceau (achetée ou téléchargée légalement) avec Audacity (gratuit).'),
          h('li', null, 'Exporte un fichier par mot, nommé comme le mot (work_it.wav, harder.wav…), et range-les dans le dossier « sons-prives » du projet (ignoré par Git).'),
          h('li', null, 'Clique sur « Ou charger un dossier entier » et choisis ce dossier : chaque son se range sous son mot.'))));
      el.append(api.ui.note('Inspiré d’iDaft et de projets de fans comme vivirenremoto.github.io/daftpunk. Aucun son protégé n’est fourni avec l’appli.'));
    }
  });
})(window.LP);
