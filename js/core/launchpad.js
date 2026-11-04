/*
 * Communication Web MIDI avec les Launchpad Novation RGB.
 *  - Détection automatique du modèle par le nom du port MIDI
 *  - Passage en mode "Programmer" (contrôle total des LED)
 *  - Envoi des couleurs RGB par SysEx, uniquement les LED modifiées
 *
 * Disposition commune en mode Programmer : pad = 10 * ligne + colonne,
 * ligne 1 en bas, colonne 1 à gauche (11 = bas-gauche, 88 = haut-droite).
 */
(function (LP) {
  'use strict';
  const U = LP.U;
  const HDR = [0xF0, 0x00, 0x20, 0x29, 0x02];

  const MODELS = [
    { id: 'pro3', name: 'Launchpad Pro MK3', match: /LPProMK3|Launchpad Pro MK3/i, prefer: /MIDI/i, avoid: /DAW|DIN/i, dev: 0x0E, proto: 'mk3', full: true, velocity: true },
    { id: 'x', name: 'Launchpad X', match: /LPX\b|Launchpad X/i, prefer: /MIDI/i, avoid: /DAW/i, dev: 0x0C, proto: 'mk3', full: false, logo: true, velocity: true },
    { id: 'mini3', name: 'Launchpad Mini MK3', match: /LPMiniMK3|Launchpad Mini MK3/i, prefer: /MIDI/i, avoid: /DAW/i, dev: 0x0D, proto: 'mk3', full: false, logo: true, velocity: false },
    { id: 'pro', name: 'Launchpad Pro (2015)', match: /Launchpad Pro/i, exclude: /MK3|LPProMK3/i, prefer: /Standalone/i, avoid: /Live/i, dev: 0x10, proto: 'legacy', full: true, logo: true, velocity: true },
    { id: 'mk2', name: 'Launchpad MK2', match: /Launchpad MK2/i, dev: 0x18, proto: 'legacy', full: false, velocity: false }
  ];

  const SIDES = ['top', 'right', 'left', 'bottom', 'bottom2'];

  const L = U.emitter({
    MODELS,
    access: null,
    out: null,
    inp: null,
    model: null,
    status: 'idle', // idle | unsupported | denied | nodevice | connected
    error: '',
    brightness: U.store.get('brightness', 1),
    manual: U.store.get('midiManual', null),
    cache: new Map(),
    ledOf: {},
    btnMap: {},
    lastRaw: null,
    onInput: null
  });

  /* Mode debug : ajouter ?debug à l'adresse de la page -> journal MIDI dans la console de Chrome */
  L.debug = /[?&]debug\b/.test(location.search);
  const hex = (d) => Array.from(d, (b) => b.toString(16).padStart(2, '0')).join(' ');
  L.log = function () { if (L.debug) console.log.apply(console, ['%c[MIDI]', 'color:#22d3ee'].concat([].slice.call(arguments))); };

  L.statusText = function () {
    switch (L.status) {
      case 'unsupported': return 'Web MIDI indisponible : utilise Google Chrome';
      case 'denied': return 'Accès MIDI refusé';
      case 'nodevice': return 'Aucun Launchpad détecté';
      case 'connected': return L.model.name + ' connecté';
      default: return 'MIDI inactif';
    }
  };

  L.setStatus = function (s) { L.status = s; L.emit('status', s); };

  L.init = async function () {
    if (L.access) { L.scan(); return; }
    if (!navigator.requestMIDIAccess) { L.setStatus('unsupported'); return; }
    try {
      L.access = await navigator.requestMIDIAccess({ sysex: true });
    } catch (e) {
      L.error = String(e && e.message || e);
      L.setStatus('denied');
      return;
    }
    L.access.onstatechange = (e) => {
      L.log('changement de port :', e && e.port && (e.port.type + ' « ' + e.port.name + ' » ' + e.port.state));
      clearTimeout(L._scanT); L._scanT = setTimeout(L.scan, 250);
    };
    const p = L.ports();
    L.log('ports de sortie :', p.outputs.map((o) => o.name).join(' | ') || '(aucun)');
    L.log('ports d’entrée :', p.inputs.map((o) => o.name).join(' | ') || '(aucun)');
    L.scan();
  };

  L.ports = function () {
    if (!L.access) return { outputs: [], inputs: [] };
    const map = (p) => ({ id: p.id, name: p.name, manufacturer: p.manufacturer, state: p.state });
    return { outputs: [...L.access.outputs.values()].map(map), inputs: [...L.access.inputs.values()].map(map) };
  };

  function bestPort(list, m) {
    let best = null, bestScore = -1;
    for (const p of list) {
      if (!m.match.test(p.name || '')) continue;
      if (m.exclude && m.exclude.test(p.name)) continue;
      let s = 10;
      if (m.prefer && m.prefer.test(p.name)) s += 5;
      if (m.avoid && m.avoid.test(p.name)) s -= 5;
      if (s > bestScore) { bestScore = s; best = p; }
    }
    return best;
  }

  L.autoDetect = function () {
    const outs = [...L.access.outputs.values()].filter((p) => p.state !== 'disconnected');
    const ins = [...L.access.inputs.values()].filter((p) => p.state !== 'disconnected');
    for (const m of MODELS) {
      const out = bestPort(outs, m);
      if (!out) continue;
      const inp = ins.find((p) => p.name === out.name) || bestPort(ins, m);
      if (inp) return { out, inp, model: m };
    }
    return null;
  };

  L.scan = function () {
    if (!L.access) return;
    const alive = (p) => p && p.state === 'connected';
    if (L.status === 'connected' && alive(L.out) && alive(L.inp)) { L.emit('ports'); return; }
    L.disconnect();
    let c = null;
    if (L.manual) {
      const out = L.access.outputs.get(L.manual.out);
      const inp = L.access.inputs.get(L.manual.inp);
      const model = MODELS.find((m) => m.id === L.manual.model);
      if (out && inp && model) c = { out, inp, model };
    }
    if (!c) c = L.autoDetect();
    if (c) L.connect(c.out, c.inp, c.model);
    else L.setStatus('nodevice');
    L.emit('ports');
  };

  L.connect = function (out, inp, model) {
    L.out = out; L.inp = inp; L.model = model;
    inp.onmidimessage = (e) => L.handle(e.data);
    L.log('connecté :', model.name, '| sortie « ' + out.name + ' » | entrée « ' + inp.name + ' » | débit', L.profile().name);
    L.buildMaps();
    L.cache.clear();
    L.enter();
    L.setStatus('connected');
  };

  L.disconnect = function () {
    if (L.inp) L.inp.onmidimessage = null;
    L.out = null; L.inp = null; L.model = null;
    L.cache.clear();
  };

  L.useManual = function (outId, inId, modelId) {
    L.manual = { out: outId, inp: inId, model: modelId };
    U.store.set('midiManual', L.manual);
    if (L.status === 'connected') L.leave();
    L.disconnect(); L.status = 'idle';
    L.scan();
  };

  /* Reconnexion : ré-envoie le mode Programmer et redessine tout */
  L.reconnect = function () {
    if (!L.access) return;
    L.log('reconnexion demandée');
    L.disconnect(); L.status = 'idle';
    L.scan();
  };

  L.useAuto = function () {
    L.manual = null;
    U.store.set('midiManual', null);
    if (L.status === 'connected') L.leave();
    L.disconnect(); L.status = 'idle';
    L.scan();
  };

  L.send = function (data) {
    if (!L.out) return;
    if (L.debug) L.log('→ envoi', data.length + ' octets :', hex(data.slice(0, 24)) + (data.length > 24 ? ' …' : ''));
    try { L.out.send(data); } catch (e) { console.warn('MIDI send', e); }
  };

  L.sysex = function (bytes) { L.send(HDR.concat([L.model.dev], bytes, [0xF7])); };

  /* Mode Programmer */
  L.enter = function () {
    const m = L.model;
    if (m.proto === 'mk3') L.sysex([0x0E, 0x01]);
    else if (m.id === 'pro') { L.sysex([0x21, 0x01]); L.sysex([0x2C, 0x03]); }
    else if (m.id === 'mk2') L.sysex([0x22, 0x00]);
  };

  /* Éteint tout et rend la main au mode normal */
  L.leave = function () {
    if (L.status !== 'connected' || !L.model) return;
    const all = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) all.push((8 - y) * 10 + x + 1, 0, 0, 0);
    for (const k in L.ledOf) all.push(L.ledOf[k], 0, 0, 0);
    if (L.model.logo) all.push(99, 0, 0, 0);
    L.sendLeds(all);
    const m = L.model;
    if (m.proto === 'mk3') L.sysex([0x0E, 0x00]);
    else if (m.id === 'pro') L.sysex([0x2C, 0x00]);
    L.cache.clear();
  };

  L.buildMaps = function () {
    const m = L.model;
    L.ledOf = {}; L.btnMap = {};
    const add = (side, i, led) => { L.ledOf[side + i] = led; L.btnMap[led] = { side, i }; };
    for (let i = 0; i < 8; i++) {
      add('top', i, m.id === 'mk2' ? 104 + i : 91 + i);
      add('right', i, (8 - i) * 10 + 9);
      if (m.full) {
        add('left', i, (8 - i) * 10);
        add('bottom', i, m.id === 'pro3' ? 101 + i : 1 + i);
        if (m.id === 'pro3') add('bottom2', i, 1 + i);
      }
    }
  };

  /* Messages entrants -> événements {type:'pad'|'button', ...} */
  L.handle = function (d) {
    if (!d || !d.length) return;
    if (d.length < 3 || d[0] >= 0xF0) { if (d[0] !== 0xF8 && d[0] !== 0xFE) L.log('← reçu (ignoré)', hex(d)); return; }
    const st = d[0] & 0xF0, n = d[1], v = d[2];
    if (st !== 0x90 && st !== 0x80 && st !== 0xB0) { L.log('← reçu (ignoré)', hex(d)); return; }
    const down = st !== 0x80 && v > 0;
    const row = Math.floor(n / 10), col = n % 10;
    let ev = null;
    if (st !== 0xB0 && row >= 1 && row <= 8 && col >= 1 && col <= 8) {
      const vel = down ? (L.model && L.model.velocity === false ? 100 : v) : 0;
      ev = { type: 'pad', x: col - 1, y: 8 - row, vel, down };
    } else if (L.btnMap[n]) {
      ev = { type: 'button', side: L.btnMap[n].side, i: L.btnMap[n].i, vel: v, down };
    }
    L.lastRaw = { status: d[0], data1: n, data2: v };
    L.log('← reçu', hex(d), ev ? JSON.stringify(ev) : '(message non reconnu)');
    L.emit('raw', L.lastRaw);
    if (ev && L.onInput) L.onInput(ev);
  };

  L.setBrightness = function (b) {
    L.brightness = U.clamp(b, 0.05, 1);
    U.store.set('brightness', L.brightness);
    L.cache.clear();
    L.emit('brightness', L.brightness);
  };

  /*
   * Débit d'envoi des LED. Les Launchpad (surtout les anciens : MK2, Pro 2015)
   * ne digèrent qu'un nombre limité de messages par seconde : au-delà, les
   * messages s'accumulent ou se perdent et les lumières se figent.
   * On plafonne donc le nombre de LED envoyées à chaque envoi.
   */
  const PROFILES = {
    fast: { name: 'Rapide', interval: 0.025, cap: 80 },
    normal: { name: 'Normal', interval: 0.04, cap: 40 },
    safe: { name: 'Prudent', interval: 0.06, cap: 20 },
    slow: { name: 'Très prudent', interval: 0.1, cap: 12 }
  };
  L.PROFILES = PROFILES;
  L.rate = U.store.get('ledRate', 'auto');
  L.autoRate = () => (L.model && L.model.proto === 'legacy' ? 'safe' : 'normal');
  L.profile = () => PROFILES[L.rate !== 'auto' && PROFILES[L.rate] ? L.rate : L.autoRate()];
  L.setRate = function (r) { L.rate = r; U.store.set('ledRate', r); L.invalidate(); L.emit('rate', r); };

  /* Force un redessin complet (progressif) du Launchpad */
  L.invalidate = function () {
    L.cache.clear();
    if (L.out && typeof L.out.clear === 'function') { try { L.out.clear(); } catch (e) { /* non supporté */ } }
  };

  L.stats = { leds: 0, msgs: 0, bytes: 0, t0: 0, ledsPerSec: 0, bytesPerSec: 0 };
  const all = []; // [led, r, g, b] réutilisés
  let rr = 0, heal = 0;

  /* Envoie le framebuffer : seulement les LED qui ont changé, dans la limite du plafond */
  L.flush = function (fb) {
    if (L.status !== 'connected') return;
    const m = L.model;
    const max = m.proto === 'mk3' ? 127 : 63;
    const k = L.brightness * max / 255;
    let n = 0;
    const put = (led, c) => {
      let e = all[n];
      if (!e) e = all[n] = [0, 0, 0, 0];
      e[0] = led;
      e[1] = U.clamp(Math.round(c[0] * k), 0, max);
      e[2] = U.clamp(Math.round(c[1] * k), 0, max);
      e[3] = U.clamp(Math.round(c[2] * k), 0, max);
      n++;
    };
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) put((8 - y) * 10 + x + 1, fb.grid[y * 8 + x]);
    for (const side of SIDES) {
      const arr = fb.btn[side];
      for (let i = 0; i < 8; i++) {
        const led = L.ledOf[side + i];
        if (led !== undefined) put(led, arr[i]);
      }
    }
    if (m.logo) put(99, fb.logo);

    const keyOf = (e) => (e[1] << 16) | (e[2] << 8) | e[3];
    const changed = [];
    for (let i = 0; i < n; i++) if (L.cache.get(all[i][0]) !== keyOf(all[i])) changed.push(i);

    const cap = L.profile().cap;
    let pick;
    if (changed.length <= cap) pick = changed;
    else {
      // Trop de changements : on en envoie "cap", en tournant pour que chaque LED ait son tour
      pick = [];
      const start = rr % changed.length;
      for (let j = 0; j < cap; j++) pick.push(changed[(start + j) % changed.length]);
      rr += cap;
    }
    // Auto-réparation : renvoie aussi une LED inchangée à chaque fois (rattrape un message perdu)
    if (pick.length < cap && n) {
      heal = (heal + 1) % n;
      if (pick.indexOf(heal) < 0) pick = pick.concat([heal]);
    }
    if (!pick.length) return;
    const out = [];
    for (const i of pick) { const e = all[i]; L.cache.set(e[0], keyOf(e)); out.push(e[0], e[1], e[2], e[3]); }
    L.sendLeds(out);
  };

  L.countStats = function (leds, bytes) {
    const s = L.stats, now = U.now();
    if (!s.t0) s.t0 = now;
    s.leds += leds; s.bytes += bytes; s.msgs++;
    if (now - s.t0 >= 1) {
      s.ledsPerSec = Math.round(s.leds / (now - s.t0));
      s.bytesPerSec = Math.round(s.bytes / (now - s.t0));
      s.leds = 0; s.bytes = 0; s.msgs = 0; s.t0 = now;
    }
  };

  /* arr = [led, r, g, b, led, r, g, b, ...] (valeurs déjà converties) */
  L.sendLeds = function (arr) {
    const m = L.model;
    const per = Math.min(m.proto === 'mk3' ? 80 : 78, L.profile().cap);
    for (let s = 0; s < arr.length; s += per * 4) {
      const body = [m.proto === 'mk3' ? 0x03 : 0x0B];
      const end = Math.min(arr.length, s + per * 4);
      for (let j = s; j < end; j += 4) {
        if (m.proto === 'mk3') body.push(0x03, arr[j], arr[j + 1], arr[j + 2], arr[j + 3]);
        else body.push(arr[j], arr[j + 1], arr[j + 2], arr[j + 3]);
      }
      L.sysex(body);
      L.countStats((end - s) / 4, body.length + 7);
    }
  };

  window.addEventListener('pagehide', () => L.leave());

  LP.launchpad = L;
})(window.LP);
