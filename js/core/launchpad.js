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
    L.access.onstatechange = () => { clearTimeout(L._scanT); L._scanT = setTimeout(L.scan, 250); };
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

  L.useAuto = function () {
    L.manual = null;
    U.store.set('midiManual', null);
    if (L.status === 'connected') L.leave();
    L.disconnect(); L.status = 'idle';
    L.scan();
  };

  L.send = function (data) {
    if (!L.out) return;
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
    if (!d || d.length < 3 || d[0] >= 0xF0) return;
    const st = d[0] & 0xF0, n = d[1], v = d[2];
    if (st !== 0x90 && st !== 0x80 && st !== 0xB0) return;
    const down = st !== 0x80 && v > 0;
    const row = Math.floor(n / 10), col = n % 10;
    let ev = null;
    if (st !== 0xB0 && row >= 1 && row <= 8 && col >= 1 && col <= 8) {
      ev = { type: 'pad', x: col - 1, y: 8 - row, vel: down ? v : 0, down };
    } else if (L.btnMap[n]) {
      ev = { type: 'button', side: L.btnMap[n].side, i: L.btnMap[n].i, vel: v, down };
    }
    L.lastRaw = { status: d[0], data1: n, data2: v };
    L.emit('raw', L.lastRaw);
    if (ev && L.onInput) L.onInput(ev);
  };

  L.setBrightness = function (b) {
    L.brightness = U.clamp(b, 0.05, 1);
    U.store.set('brightness', L.brightness);
    L.cache.clear();
    L.emit('brightness', L.brightness);
  };

  /* Envoie le framebuffer : seulement les LED qui ont changé */
  L.flush = function (fb) {
    if (L.status !== 'connected') return;
    const m = L.model;
    const max = m.proto === 'mk3' ? 127 : 63;
    const k = L.brightness * max / 255;
    const changes = [];
    const push = (led, c) => {
      const r = U.clamp(Math.round(c[0] * k), 0, max);
      const g = U.clamp(Math.round(c[1] * k), 0, max);
      const b = U.clamp(Math.round(c[2] * k), 0, max);
      const key = (r << 16) | (g << 8) | b;
      if (L.cache.get(led) !== key) { L.cache.set(led, key); changes.push(led, r, g, b); }
    };
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) push((8 - y) * 10 + x + 1, fb.grid[y * 8 + x]);
    for (const side of SIDES) {
      const arr = fb.btn[side];
      for (let i = 0; i < 8; i++) {
        const led = L.ledOf[side + i];
        if (led !== undefined) push(led, arr[i]);
      }
    }
    if (m.logo) push(99, fb.logo);
    if (changes.length) L.sendLeds(changes);
  };

  /* arr = [led, r, g, b, led, r, g, b, ...] (valeurs déjà converties) */
  L.sendLeds = function (arr) {
    const m = L.model;
    const per = m.proto === 'mk3' ? 80 : 78;
    for (let s = 0; s < arr.length; s += per * 4) {
      const body = [m.proto === 'mk3' ? 0x03 : 0x0B];
      const end = Math.min(arr.length, s + per * 4);
      for (let j = s; j < end; j += 4) {
        if (m.proto === 'mk3') body.push(0x03, arr[j], arr[j + 1], arr[j + 2], arr[j + 3]);
        else body.push(arr[j], arr[j + 1], arr[j + 2], arr[j + 3]);
      }
      L.sysex(body);
    }
  };

  window.addEventListener('pagehide', () => L.leave());

  LP.launchpad = L;
})(window.LP);
