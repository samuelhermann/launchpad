/*
 * Test automatique (sans vrai Launchpad) : simule un Launchpad en Web MIDI,
 * vérifie la détection, le mode Programmer, l'envoi des LED et lance chaque appli.
 *
 * Utilisation : node tests/smoke.js   (nécessite Playwright + Chromium)
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const OUT = process.env.SHOTS || path.join(ROOT, 'tests', 'screenshots');

const MODELS = [
  { port: 'LPX MIDI', extra: ['LPX DAW'], expect: 'x', dev: 0x0C },
  { port: 'Launchpad X LPX MIDI', extra: [], expect: 'x', dev: 0x0C },
  { port: 'LPProMK3 MIDI', extra: ['LPProMK3 DAW', 'LPProMK3 DIN'], expect: 'pro3', dev: 0x0E },
  { port: 'LPMiniMK3 MIDI', extra: ['LPMiniMK3 DAW'], expect: 'mini3', dev: 0x0D },
  { port: 'Launchpad Pro Standalone Port', extra: ['Launchpad Pro Live Port', 'Launchpad Pro MIDI Port'], expect: 'pro', dev: 0x10 },
  { port: 'Launchpad MK2', extra: [], expect: 'mk2', dev: 0x18 }
];

function mockScript(ports) {
  return `(() => {
    window.__sent = [];
    window.__dev = {};   // état simulé des LED du Launchpad
    window.__drop = 0;   // probabilité de perdre un message (simulation d'un Launchpad saturé)
    const apply = (d) => {
      if (d[0] !== 0xF0 || d[1] !== 0x00 || d[2] !== 0x20 || d[3] !== 0x29) return;
      if (d[6] === 0x0B) for (let i = 7; i + 3 < d.length; i += 4) window.__dev[d[i]] = [d[i + 1], d[i + 2], d[i + 3]];
      if (d[6] === 0x03) for (let i = 7; i + 4 < d.length; i += 5) if (d[i] === 3) window.__dev[d[i + 1]] = [d[i + 2], d[i + 3], d[i + 4]];
    };
    const mk = (id, name, type) => ({ id, name, type, manufacturer: 'Focusrite - Novation', state: 'connected', connection: 'open',
      onmidimessage: null, send(d) {
        if (type !== 'output') return;
        window.__sent.push({ port: name, data: Array.from(d) });
        if (Math.random() >= window.__drop) apply(d);
      },
      open() { return Promise.resolve(this); }, close() {}, addEventListener() {} });
    const names = ${JSON.stringify(ports)};
    const outs = new Map(), ins = new Map();
    names.forEach((n, i) => { outs.set('o' + i, mk('o' + i, n, 'output')); ins.set('i' + i, mk('i' + i, n, 'input')); });
    window.__ins = ins;
    window.__press = (status, d1, d2) => { for (const p of ins.values()) if (p.onmidimessage) p.onmidimessage({ data: new Uint8Array([status, d1, d2]) }); };
    navigator.requestMIDIAccess = async () => ({ inputs: ins, outputs: outs, sysexEnabled: true, onstatechange: null });
  })();`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { failures++; console.log('  ✗ ' + msg); } };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  /* 1. Détection de chaque modèle */
  console.log('Détection des modèles :');
  for (const m of MODELS) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(mockScript([...m.extra, m.port]));
    await page.goto(URL);
    await page.click('#btnStart');
    await sleep(400);
    const r = await page.evaluate(() => ({
      model: LP.launchpad.model && LP.launchpad.model.id,
      port: LP.launchpad.out && LP.launchpad.out.name,
      sent: window.__sent
    }));
    const hdr = [0xF0, 0x00, 0x20, 0x29, 0x02, m.dev];
    const toPort = r.sent.filter((s) => s.port === m.port);
    const isHdr = (d) => hdr.every((b, i) => d[i] === b);
    const enter = toPort.find((s) => isHdr(s.data) && (s.data[6] === 0x0E || s.data[6] === 0x2C || s.data[6] === 0x22));
    const leds = toPort.filter((s) => isHdr(s.data) && (s.data[6] === 0x03 || s.data[6] === 0x0B));
    check(r.model === m.expect && r.port === m.port && !!enter && leds.length > 0 && errors.length === 0,
      `${m.port} → ${r.model} sur « ${r.port} », mode Programmer ${enter ? 'OK' : 'ABSENT'}, ${leds.length} messages LED${errors.length ? ', erreurs: ' + errors.join(' | ') : ''}`);
    await page.close();
  }

  /* 2. Parcours de toutes les applis avec un Launchpad X simulé */
  console.log('Applications :');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.addInitScript(mockScript(['LPX DAW', 'LPX MIDI']));
  await page.goto(URL);
  await page.screenshot({ path: path.join(OUT, '00-start.png') });
  await page.click('#btnStart');
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, '01-menu.png') });

  const apps = await page.evaluate(() => {
    const cats = LP.CATS.map((c) => c[0]);
    return LP.apps.list.filter((a) => !a.hidden).map((a) => ({ id: a.id, tab: cats.indexOf(a.cat), k: LP.apps.list.filter((b) => !b.hidden && b.cat === a.cat).indexOf(a) }));
  });
  const note = (x, y) => (8 - y) * 10 + x + 1;
  const pad = async (x, y, v = 100) => { await page.evaluate(([n, v]) => { window.__press(0x90, n, v); }, [note(x, y), v]); await sleep(30); await page.evaluate((n) => window.__press(0x90, n, 0), note(x, y)); };
  const btn = async (cc) => { await page.evaluate((cc) => { window.__press(0xB0, cc, 127); window.__press(0xB0, cc, 0); }, cc); };

  for (let n = 0; n < apps.length; n++) {
    const { id, tab, k } = apps[n];
    // Lancer depuis le menu : onglet (boutons du haut) puis tuile 2x2, comme sur le vrai Launchpad
    await btn(98);
    await sleep(100);
    await btn(91 + tab);
    await sleep(60);
    await pad((k % 4) * 2, Math.floor(k / 4) * 2);
    await sleep(150);
    const cur = await page.evaluate(() => LP.core.current.id);
    // Quelques interactions
    for (let i = 0; i < 6; i++) { await pad(i % 8, (i * 3) % 8, 60 + i * 10); await sleep(60); }
    for (const cc of [91, 92, 93, 94, 89, 79]) { await btn(cc); await sleep(40); }
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, String(n + 2).padStart(2, '0') + '-' + id + '.png') });
    check(cur === id, `onglet ${tab} tuile ${k} → ${id} (actuel : ${cur})`);
  }

  /* 3. Logique de jeu */
  console.log('Logique :');
  const logic = await page.evaluate(() => {
    const out = {};
    // Éteins-tout : la solution calculée éteint bien la grille
    const { solve } = LP.apps.byId.lightsout._test;
    let ok = true;
    for (const n of [5, 6, 8]) {
      for (let trial = 0; trial < 20; trial++) {
        const N = n * n, L = new Uint8Array(N);
        const presses = [];
        for (let i = 0; i < N; i++) if (Math.random() < 0.3) presses.push(i);
        const flip = (x, y) => { if (x >= 0 && y >= 0 && x < n && y < n) L[y * n + x] ^= 1; };
        const press = (i) => { const x = i % n, y = Math.floor(i / n); flip(x, y); flip(x - 1, y); flip(x + 1, y); flip(x, y - 1); flip(x, y + 1); };
        presses.forEach(press);
        const sol = solve(n, L);
        sol.forEach((v, i) => { if (v) press(i); });
        if (L.some((v) => v)) ok = false;
      }
    }
    out.lightsout = ok;
    // Puissance 4 : l'ordi gagne quand il peut, bloque sinon
    const { aiMove } = LP.apps.byId.connect4._test;
    const b = new Array(56).fill(0);
    b[6 * 8 + 0] = 2; b[6 * 8 + 1] = 2; b[6 * 8 + 2] = 2; b[6 * 8 + 5] = 1; b[6 * 8 + 6] = 1;
    out.c4win = aiMove(b, 2, 2) === 3;
    const b2 = new Array(56).fill(0);
    b2[6 * 8 + 4] = 1; b2[5 * 8 + 4] = 1; b2[4 * 8 + 4] = 1; b2[6 * 8 + 0] = 2; b2[6 * 8 + 7] = 2;
    out.c4block = aiMove(b2, 2, 2) === 4;
    const t0 = performance.now();
    const b3 = new Array(56).fill(0); b3[6 * 8 + 3] = 1;
    aiMove(b3, 2, 2);
    out.c4ms = Math.round(performance.now() - t0);
    return out;
  });
  check(logic.lightsout, 'Éteins-tout : le solveur résout 60 grilles aléatoires');
  check(logic.c4win, 'Puissance 4 : l’ordi joue le coup gagnant');
  check(logic.c4block, 'Puissance 4 : l’ordi bloque une victoire adverse');
  check(logic.c4ms < 1500, 'Puissance 4 niveau difficile : réflexion en ' + logic.c4ms + ' ms');

  /* 4. Séquenceur : la batterie programme bien des sons */
  const seq = await page.evaluate(async () => {
    LP.core.launch('drums');
    const T = LP.transport;
    T.drums.pattern = T.blank();
    T.drums.mute = new Array(8).fill(false);
    T.drums.pattern[0][0] = 1; T.drums.pattern[0][8] = 1;
    let hits = 0;
    const orig = LP.audio.drum;
    LP.audio.drum = function (i, t, v) { hits++; return orig.call(this, i, t, v); };
    T.start();
    await new Promise((r) => setTimeout(r, 1500));
    T.stop();
    LP.audio.drum = orig;
    return { hits, ctx: LP.audio.ctx.state };
  });
  check(seq.hits >= 2, 'Boîte à rythmes : ' + seq.hits + ' coups programmés en 1,5 s (audio ' + seq.ctx + ')');

  /* 5. Retour au mode normal à la fermeture */
  const before = await page.evaluate(() => window.__sent.length);
  await page.evaluate(() => LP.launchpad.leave());
  const exitMsg = await page.evaluate((n) => window.__sent.slice(n).map((s) => s.data), before);
  check(exitMsg.some((d) => d[6] === 0x0E && d[7] === 0x00), 'Sortie du mode Programmer envoyée');

  /* 7. Nouvelles applis : Pomodoro, Visualiseur, Stream Deck (Hammerspoon + OBS), Sampler, Animations */
  console.log('Nouvelles applis :');
  const extra = await page.evaluate(async () => {
    const out = {};
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // SHA-256 (authentification OBS)
    out.sha = LP.sha256('abc');
    // Pomodoro accéléré : 1,2 s de travail -> passe en pause
    const P = LP.pomodoro;
    P.cfg.work = 0.02; P.cfg.auto = false; P.count = 0;
    P.setPhase('work'); P.start();
    await wait(1700);
    out.pomo = { phase: P.phase, count: P.count };
    P.cfg.work = 25; P.setPhase('work');
    // Visualiseur : une note de synthé doit faire bouger les bandes
    LP.core.launch('visualizer');
    LP.audioin.useApp();
    LP.audio.play(48, 1.2, 1, 'pad');
    let maxLevel = 0;
    for (let i = 0; i < 20; i++) { await wait(50); maxLevel = Math.max(maxLevel, LP.audioin.level); }
    out.vizLevel = maxLevel;
    // Stream Deck -> Hammerspoon : on intercepte la requête HTTP
    LP.core.launch('streamdeck');
    const sd = LP.core.current;
    const sent = [];
    const realFetch = window.fetch;
    window.fetch = async (url, opt) => { sent.push({ url, body: JSON.parse(opt.body) }); return new Response('ok', { status: 200 }); };
    LP.hammer.enable(true);
    await sd.run({ type: 'keys', mods: ['cmd', 'shift'], key: '4' });
    await sd.run({ type: 'app', app: 'Spotify' });
    window.fetch = realFetch;
    out.hs = sent.map((s) => ({ url: s.url, type: s.body.type, keycode: s.body.keycode, mods: s.body.mods, app: s.body.app, tokenOk: s.body.token === LP.hammer.token }));
    // Stream Deck -> OBS : faux serveur WebSocket
    const RealWS = window.WebSocket;
    const reqs = [];
    window.WebSocket = class {
      constructor() { setTimeout(() => this.onmessage({ data: JSON.stringify({ op: 0, d: { rpcVersion: 1, authentication: { salt: 'SEL123', challenge: 'DEFI456' } } }) }), 10); }
      send(raw) {
        const m = JSON.parse(raw);
        if (m.op === 1) { out.obsAuth = m.d.authentication; setTimeout(() => this.onmessage({ data: JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }) }), 5); }
        if (m.op === 6) {
          reqs.push(m.d);
          const data = { GetSceneList: { scenes: [{ sceneName: 'Pause' }, { sceneName: 'Jeu' }], currentProgramSceneName: 'Jeu' }, GetRecordStatus: { outputActive: false }, GetStreamStatus: { outputActive: true }, GetInputList: { inputs: [{ inputName: 'Mic/Aux' }] }, GetInputMute: { inputMuted: true } }[m.d.requestType] || {};
          setTimeout(() => this.onmessage({ data: JSON.stringify({ op: 7, d: { requestId: m.d.requestId, requestType: m.d.requestType, requestStatus: { result: true, code: 100 }, responseData: data } }) }), 5);
        }
      }
      close() {}
    };
    LP.obs.configure('ws://127.0.0.1:4455', 'motdepasse');
    LP.obs.connect();
    await wait(400);
    await sd.run({ type: 'obsScene', scene: 'Pause' });
    out.obs = { status: LP.obs.status, scenes: LP.obs.scenes, current: LP.obs.current, streaming: LP.obs.streaming, muted: LP.obs.muted['Mic/Aux'], last: reqs[reqs.length - 1] };
    LP.obs.disconnect();
    window.WebSocket = RealWS;
    // Sampler : un fichier « harder.wav » doit se ranger sous le mot « Harder »
    LP.core.launch('sampler');
    const smp = LP.core.current;
    smp.setPack(0);
    await wait(100);
    const rate = 22050, n = 4410, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 10) * 12000, true);
    await smp.assignFiles([new File([buf], 'Harder.wav', { type: 'audio/wav' })]);
    smp.play(4);
    out.sampler = { harder: !!smp.buf[4], others: smp.buf.filter(Boolean).length, playing: !!smp.playing[4] };
    await smp.clearSample(4);
    // Animations : chaque animation tourne sans erreur
    LP.core.launch('demo');
    const demo = LP.core.current;
    for (let i = 0; i < demo.ANIMS.length; i++) { demo.setAnim(i); await wait(120); }
    out.anims = demo.ANIMS.length;
    LP.core.launch('menu');
    return out;
  });
  check(extra.sha === 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=', 'SHA-256 correct (authentification OBS)');
  check(extra.pomo.phase === 'short' && extra.pomo.count === 1, `Pomodoro : fin du travail → ${extra.pomo.phase}, ${extra.pomo.count} séance`);
  check(extra.vizLevel > 0.05, 'Visualiseur : niveau sonore détecté (' + extra.vizLevel.toFixed(2) + ')');
  const hs = extra.hs;
  check(hs.length === 2 && hs[0].url === 'http://127.0.0.1:8765/' && hs[0].type === 'keys' && hs[0].keycode === 21 && hs[0].mods.join() === 'cmd,shift' && hs[1].app === 'Spotify' && hs.every((x) => x.tokenOk),
    'Stream Deck → Hammerspoon : ⌘⇧4 (touche 21) et « Spotify » envoyés avec le jeton');
  check(extra.obsAuth === 'rCfmLZBfVZpuw9Uii5Z926Z7fcqoL+FP143fWtPbq7I=', 'OBS : authentification calculée correctement');
  check(extra.obs.status === 'ok' && extra.obs.scenes.join() === 'Jeu,Pause' && extra.obs.current === 'Jeu' && extra.obs.streaming && extra.obs.muted === true,
    'OBS : connexion, scènes, état du live et du micro récupérés');
  check(extra.obs.last && extra.obs.last.requestType === 'SetCurrentProgramScene' && extra.obs.last.requestData.sceneName === 'Pause', 'OBS : le bouton change bien de scène');
  check(extra.sampler.harder && extra.sampler.others === 1 && extra.sampler.playing, 'Sampler : « Harder.wav » rangé sous « Harder » et joué');
  check(extra.anims === 12, 'Animations : les 12 animations tournent');

  check(errors.length === 0, 'Aucune erreur JavaScript' + (errors.length ? ' : ' + errors.slice(0, 5).join(' | ') : ''));

  /* 6. Launchpad MK2 : débit plafonné et lumières toujours justes, même avec des messages perdus */
  console.log('Launchpad MK2 (débit) :');
  {
    const p2 = await browser.newPage();
    const errs = [];
    p2.on('pageerror', (e) => errs.push(String(e)));
    await p2.addInitScript(mockScript(['Launchpad MK2']));
    await p2.goto(URL);
    await p2.click('#btnStart');
    await sleep(300);
    // Animation lourde (plasma plein écran) pendant 2 s
    const heavy = await p2.evaluate(async () => {
      LP.core.launch('lightshow');
      LP.core.current.setMode(4);
      await new Promise((r) => setTimeout(r, 300));
      const n0 = window.__sent.length;
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, 2000));
      const msgs = window.__sent.slice(n0).map((s) => s.data).filter((d) => d[6] === 0x0B);
      const leds = msgs.reduce((a, d) => a + (d.length - 8) / 4, 0);
      const secs = (performance.now() - t0) / 1000;
      return { perSec: Math.round(leds / secs), maxPerMsg: Math.max(...msgs.map((d) => (d.length - 8) / 4)), msgsPerSec: Math.round(msgs.length / secs) };
    });
    check(heavy.maxPerMsg <= 20 && heavy.perSec <= 400, `plasma plein écran : ${heavy.perSec} LED/s, ${heavy.msgsPerSec} messages/s, max ${heavy.maxPerMsg} LED par message (plafond « Prudent »)`);

    const compare = () => p2.evaluate(() => {
      const L = LP.launchpad, fb = LP.core.fb, k = L.brightness * 63 / 255;
      const conv = (c) => c.map((v) => Math.max(0, Math.min(63, Math.round(v * k))));
      let bad = 0, total = 0;
      const test = (led, c) => { total++; const e = conv(c), d = window.__dev[led] || [0, 0, 0]; if (e[0] !== d[0] || e[1] !== d[1] || e[2] !== d[2]) bad++; };
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) test((8 - y) * 10 + x + 1, fb.grid[y * 8 + x]);
      for (let i = 0; i < 8; i++) { test(L.ledOf['top' + i], fb.btn.top[i]); test(L.ledOf['right' + i], fb.btn.right[i]); }
      return { bad, total };
    });
    // Changement de jeu (comme dans la liste à gauche) : les lumières doivent suivre
    await p2.evaluate(() => LP.core.launch('connect4'));
    await sleep(700);
    const sw = await compare();
    check(sw.bad === 0, `après changement de jeu : ${sw.total - sw.bad}/${sw.total} LED correctes`);
    // 40 % de messages perdus pendant un changement de jeu, puis l'auto-réparation doit tout rattraper
    await p2.evaluate(() => { window.__drop = 0.4; LP.core.launch('mempairs'); });
    await sleep(800);
    const lossy = await compare();
    await p2.evaluate(() => { window.__drop = 0; });
    await sleep(6000);
    const healed = await compare();
    check(lossy.bad > 0 && healed.bad === 0, `messages perdus : ${lossy.bad} LED fausses, puis ${healed.bad} après auto-réparation`);
    check(errs.length === 0, 'MK2 : aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
    await p2.close();
  }

  // Vue téléphone
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await phone.addInitScript(mockScript([]));
  await phone.goto(URL);
  await phone.click('#btnStart');
  await sleep(400);
  await phone.screenshot({ path: path.join(OUT, '90-phone.png'), fullPage: true });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'Pas de défilement horizontal sur téléphone');

  await browser.close();
  console.log(failures ? `\n${failures} échec(s)` : '\nTout est OK ✅');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
