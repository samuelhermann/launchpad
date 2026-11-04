/*
 * Sources audio pour les visualisations, partagées par le Visualiseur et le Light show :
 *  - 'app'      : les sons de Launchpad Arcade (boîte à rythmes, synthé…)
 *  - 'tab'      : un onglet Chrome partagé (YouTube, Spotify Web, Deezer…)
 *  - 'blackhole': l'appli Spotify / Musique du Mac, via le périphérique virtuel BlackHole
 *  - 'device'   : une autre entrée audio (micro…)
 *  - 'file'     : un fichier audio lu par la page
 * Analyse commune : 8 bandes de fréquences, niveau, battements (et tempo estimé), VU stéréo, forme d'onde.
 */
(function (LP) {
  'use strict';
  const U = LP.U, h = U.h, A = LP.audio;

  const AI = LP.audioin = U.emitter({
    source: 'app', label: 'Sons de l’appli',
    sens: U.store.get('ai.sens', 1),
    bands: new Float32Array(8), level: 0, beat: false, beatT: 0, bpm: 0,
    vu: [0, 0], wave: new Float32Array(8), waveMax: 0.05,
    peakDb: -60, avgBass: 0, intervals: [],
    stream: null, node: null, audioEl: null, fileName: ''
  });

  function ensure() {
    if (AI.ext || !A.ready()) return;
    const ctx = A.ctx;
    AI.ext = ctx.createAnalyser(); AI.ext.fftSize = 2048; AI.ext.smoothingTimeConstant = 0.5;
    AI.split = ctx.createChannelSplitter(2);
    AI.aL = ctx.createAnalyser(); AI.aR = ctx.createAnalyser();
    AI.aL.fftSize = AI.aR.fftSize = 1024;
    AI.split.connect(AI.aL, 0); AI.split.connect(AI.aR, 1);
  }

  AI.an = () => {
    if (!A.ready()) return null;
    return AI.source === 'app' || AI.source === 'file' ? A.analyser : (AI.ext || A.analyser);
  };

  function setSource(src, label) {
    AI.source = src; AI.label = label;
    AI.peakDb = -60; AI.intervals = []; AI.bpm = 0;
    AI.emit('change');
  }

  AI.stopStream = function () {
    if (AI.stream) AI.stream.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    if (AI.node) { try { AI.node.disconnect(); } catch (e) { /* ignore */ } }
    AI.stream = null; AI.node = null;
  };
  AI.pauseFile = function () { if (AI.audioEl && !AI.audioEl.paused) AI.audioEl.pause(); };

  AI.useApp = function () { AI.stopStream(); AI.pauseFile(); setSource('app', 'Sons de l’appli'); };

  function attach(stream, src, label) {
    ensure();
    AI.stopStream(); AI.pauseFile();
    AI.stream = stream;
    AI.node = A.ctx.createMediaStreamSource(stream);
    AI.node.connect(AI.ext);
    AI.node.connect(AI.split);
    stream.getTracks().forEach((t) => {
      t.onended = () => { if (AI.stream === stream) { AI.useApp(); LP.core.toast('Capture du son arrêtée.'); } };
    });
    setSource(src, label);
  }

  /* Onglet Chrome (ou écran entier avec le son du système, si Chrome le propose) */
  AI.useTab = async function () {
    if (!A.ready()) throw new Error('noaudio-ctx');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('unsupported');
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 1, max: 5 }, width: { ideal: 320 }, height: { ideal: 180 } },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false },
      systemAudio: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'include', preferCurrentTab: false
    });
    if (!s.getAudioTracks().length) { s.getTracks().forEach((t) => t.stop()); throw new Error('notabaudio'); }
    const v = s.getVideoTracks()[0];
    attach(s, 'tab', '🖥️ ' + ((v && v.label) || 'Onglet partagé'));
  };

  AI.devices = async function () {
    try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); } catch (e) { return []; }
  };

  AI.useDevice = async function (deviceId) {
    if (!A.ready()) throw new Error('noaudio-ctx');
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } }
    });
    const tr = s.getAudioTracks()[0];
    const bh = /blackhole/i.test(tr.label);
    attach(s, bh ? 'blackhole' : 'device', (bh ? '🎧 ' : '🎤 ') + (tr.label || 'Entrée audio'));
  };

  /* Cherche le périphérique virtuel BlackHole (le son de Spotify / Musique) */
  AI.useBlackHole = async function () {
    let list = await AI.devices();
    if (!list.some((d) => d.label)) {
      // Les noms des entrées ne sont visibles qu'après une première autorisation micro
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
      tmp.getTracks().forEach((t) => t.stop());
      list = await AI.devices();
    }
    const bh = list.find((d) => /blackhole/i.test(d.label));
    if (!bh) throw new Error('noblackhole');
    await AI.useDevice(bh.deviceId);
  };

  AI.loadFile = function (file) {
    if (!file || !A.ready()) return;
    AI.stopStream();
    if (!AI.audioEl) {
      AI.audioEl = new Audio();
      AI.audioEl.loop = true;
      A.ctx.createMediaElementSource(AI.audioEl).connect(A.bus);
    }
    if (AI.audioUrl) URL.revokeObjectURL(AI.audioUrl);
    AI.audioUrl = URL.createObjectURL(file);
    AI.audioEl.src = AI.audioUrl;
    AI.audioEl.play();
    AI.fileName = file.name;
    setSource('file', '🎵 ' + file.name);
  };
  AI.toggleFile = function () {
    if (!AI.audioEl || !AI.audioEl.src) return false;
    if (AI.source !== 'file') { AI.stopStream(); setSource('file', '🎵 ' + AI.fileName); }
    if (AI.audioEl.paused) AI.audioEl.play(); else AI.audioEl.pause();
    return true;
  };

  AI.setSens = function (s) { AI.sens = U.clamp(s, 0.3, 3); U.store.set('ai.sens', AI.sens); AI.emit('sens'); };

  AI.errorText = function (e) {
    const m = (e && (e.name === 'NotAllowedError' ? 'denied' : e.message)) || '';
    return ({
      denied: 'Autorisation refusée ou partage annulé.',
      notabaudio: 'Aucun son partagé : dans la fenêtre de Chrome, coche « Partager aussi l’audio de l’onglet ».',
      noblackhole: 'BlackHole n’est pas installé ou pas encore reconnu (voir « Comment capter Spotify / Musique ? »).',
      unsupported: 'Ce navigateur ne permet pas de capturer un onglet : utilise Google Chrome.',
      'noaudio-ctx': 'Active d’abord le son avec le bouton « Démarrer ».'
    })[m] || ('Impossible : ' + (e && e.message || e));
  };

  /* ---------- Analyse (à appeler à chaque tick par l'appli active) ---------- */
  let fd = null, td = null, tdL = null, tdR = null;
  const raw = new Float32Array(8);
  const rms = (buf) => { let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); };

  AI.analyse = function (t) {
    AI.beat = false;
    const an = AI.an();
    if (!an) { AI.bands.fill(0); AI.level = 0; AI.vu[0] = AI.vu[1] = 0; return; }
    const n = an.frequencyBinCount;
    if (!fd || fd.length !== n) fd = new Float32Array(n);
    an.getFloatFrequencyData(fd);
    const binHz = A.ctx.sampleRate / an.fftSize;
    let frameMax = -200;
    for (let b = 0; b < 8; b++) {
      const f0 = 40 * Math.pow(400, b / 8), f1 = 40 * Math.pow(400, (b + 1) / 8); // 40 Hz → 16 kHz
      const i0 = Math.max(1, Math.floor(f0 / binHz)), i1 = Math.min(n, Math.max(i0 + 1, Math.ceil(f1 / binHz)));
      let m = -200;
      for (let i = i0; i < i1; i++) if (fd[i] > m) m = fd[i];
      m += b * 1.8; // les aigus ont naturellement moins d'énergie
      raw[b] = m;
      if (m > frameMax) frameMax = m;
    }
    // Gain automatique : le haut de l'échelle suit le pic récent (redescend doucement)
    AI.peakDb = Math.max(frameMax, AI.peakDb - 0.05, -68);
    const range = 40 / AI.sens;
    let sum = 0;
    for (let b = 0; b < 8; b++) {
      const v = U.clamp((raw[b] - (AI.peakDb - range)) / range, 0, 1);
      AI.bands[b] = v > AI.bands[b] ? v : AI.bands[b] * 0.82 + v * 0.18;
      sum += AI.bands[b];
    }
    AI.level = sum / 8;

    // Battements : énergie des basses comparée à sa moyenne récente
    const bass = (AI.bands[0] + AI.bands[1]) / 2;
    AI.avgBass = AI.avgBass * 0.96 + bass * 0.04;
    if (bass > 0.45 && bass > AI.avgBass * 1.2 + 0.06 && t - AI.beatT > 0.27) {
      if (AI.beatT) { AI.intervals.push(t - AI.beatT); if (AI.intervals.length > 16) AI.intervals.shift(); }
      AI.beatT = t; AI.beat = true;
      const s = AI.intervals.filter((x) => x > 0.27 && x < 1.5).sort((a, b) => a - b);
      if (s.length >= 4) {
        let bpm = 60 / s[Math.floor(s.length / 2)];
        while (bpm < 75) bpm *= 2;
        while (bpm > 180) bpm /= 2;
        AI.bpm = Math.round(bpm);
      }
    }
    if (t - AI.beatT > 4) AI.bpm = 0;

    // Forme d'onde (8 points, synchronisée sur un passage à zéro pour être stable)
    if (!td || td.length !== an.fftSize) td = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(td);
    let start = 0;
    for (let i = 1; i < td.length / 2; i++) if (td[i - 1] < 0 && td[i] >= 0) { start = i; break; }
    let amax = 0;
    for (let x = 0; x < 8; x++) { const v = td[start + x * 48] || 0; AI.wave[x] = v; amax = Math.max(amax, Math.abs(v)); }
    AI.waveMax = Math.max(amax, AI.waveMax * 0.985, 0.02);

    // VU-mètre stéréo
    let l, r;
    if (AI.source === 'app' || AI.source === 'file' || !AI.aL) { l = r = rms(td); }
    else {
      if (!tdL || tdL.length !== AI.aL.fftSize) { tdL = new Float32Array(AI.aL.fftSize); tdR = new Float32Array(AI.aR.fftSize); }
      AI.aL.getFloatTimeDomainData(tdL); AI.aR.getFloatTimeDomainData(tdR);
      l = rms(tdL); r = rms(tdR);
      if (r < 1e-6) r = l; if (l < 1e-6) l = r; // source mono
    }
    const toV = (x) => U.clamp((20 * Math.log10(x + 1e-9) + 50) / 44 * AI.sens, 0, 1);
    [l, r].forEach((x, i) => { const v = toV(x); AI.vu[i] = v > AI.vu[i] ? v : AI.vu[i] * 0.9 + v * 0.1; });
  };

  /* ---------- Panneau commun : choisir la source ---------- */
  AI.panel = function (el, api) {
    const now = h('p', { class: 'src-now' }, 'Source actuelle : ', h('b', null, AI.label));
    el.append(now);
    const run = (fn) => async () => { try { await fn(); api.refresh(); } catch (e) { api.toast(AI.errorText(e)); } };
    el.append(api.ui.buttons([
      { label: '🖥️ Capturer un onglet Chrome', onClick: run(() => AI.useTab()) },
      { label: '🎧 Spotify / Musique (BlackHole)', onClick: run(() => AI.useBlackHole()) }
    ]));
    el.append(api.ui.buttons([
      { label: '🎤 Micro', cls: 'ghost', onClick: run(() => AI.useDevice('')) },
      { label: '🎛️ Sons de l’appli', cls: 'ghost', onClick: run(() => AI.useApp()) }
    ]));
    const fileIn = h('input', { type: 'file', accept: 'audio/*', onchange: () => { AI.loadFile(fileIn.files[0]); api.refresh(); } });
    el.append(api.ui.row('Ou un fichier audio (MP3, WAV…)', fileIn));
    if (AI.fileName) el.append(api.ui.buttons([{ label: '⏯ Lecture / pause « ' + AI.fileName + ' »', cls: 'ghost', onClick: () => AI.toggleFile() }]));
    AI.devices().then((list) => {
      if (!list.some((d) => d.label)) return;
      const sel = api.ui.select('Entrée audio', [{ value: '', label: '— Choisir une entrée —' }].concat(list.map((d) => ({ value: d.deviceId, label: d.label }))), '', (v) => { if (v) run(() => AI.useDevice(v))(); });
      now.after(sel);
    });
    el.append(api.ui.range('Sensibilité', 0.3, 3, 0.05, AI.sens, (v) => AI.setSens(v), (v) => Math.round(v * 100) + ' %'));
    el.append(h('details', { class: 'howto' }, h('summary', null, 'Comment capter YouTube, Spotify Web, Deezer… ?'),
      h('ol', null,
        h('li', null, 'Lance la musique dans un autre onglet de Chrome.'),
        h('li', null, 'Clique sur « Capturer un onglet Chrome ».'),
        h('li', null, 'Dans la fenêtre, choisis l’onglet de la musique et vérifie que « Partager aussi l’audio de l’onglet » est coché, puis « Partager ».'),
        h('li', null, 'Le son continue de sortir normalement. Pour arrêter : « Arrêter le partage » dans la barre de Chrome.'))));
    el.append(h('details', { class: 'howto' }, h('summary', null, 'Comment capter l’appli Spotify / Musique du Mac ?'),
      h('ol', null,
        h('li', null, 'Installe BlackHole 2ch (gratuit) depuis existential.audio/blackhole.'),
        h('li', null, 'Ouvre « Configuration audio et MIDI » (Applications → Utilitaires), clique sur + en bas à gauche → « Créer un périphérique à sorties multiples ».'),
        h('li', null, 'Coche tes haut-parleurs (ou ton casque) ET « BlackHole 2ch ». Coche « Correction de dérive » sur la ligne BlackHole.'),
        h('li', null, 'Réglages Système → Son → Sortie : choisis « Périphérique à sorties multiples ».'),
        h('li', null, 'Ici, clique sur « Spotify / Musique (BlackHole) » et autorise l’accès.'),
        h('li', null, 'Avec ce réglage, les touches volume du Mac ne marchent plus : règle le volume dans Spotify. Pour revenir à la normale, remets ta sortie habituelle dans Réglages Système → Son.'))));
    el.append(api.ui.note('Astuce : sur un macOS récent, quand tu partages « Écran entier », Chrome peut aussi proposer de partager l’audio du système (sans BlackHole).'));
  };
})(window.LP);
