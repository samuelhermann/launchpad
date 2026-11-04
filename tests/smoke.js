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
    const mk = (id, name, type) => ({ id, name, type, manufacturer: 'Focusrite - Novation', state: 'connected', connection: 'open',
      onmidimessage: null, send(d) { if (type === 'output') window.__sent.push({ port: name, data: Array.from(d) }); },
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

  const apps = await page.evaluate(() => LP.apps.list.filter((a) => !a.hidden).map((a) => a.id));
  const note = (x, y) => (8 - y) * 10 + x + 1;
  const pad = async (x, y, v = 100) => { await page.evaluate(([n, v]) => { window.__press(0x90, n, v); }, [note(x, y), v]); await sleep(30); await page.evaluate((n) => window.__press(0x90, n, 0), note(x, y)); };
  const btn = async (cc) => { await page.evaluate((cc) => { window.__press(0xB0, cc, 127); window.__press(0xB0, cc, 0); }, cc); };

  for (let k = 0; k < apps.length; k++) {
    const id = apps[k];
    // Lancer depuis le menu via la tuile 2x2 correspondante (comme sur le vrai Launchpad)
    await btn(98);
    await sleep(100);
    await pad((k % 4) * 2, Math.floor(k / 4) * 2);
    await sleep(150);
    const cur = await page.evaluate(() => LP.core.current.id);
    // Quelques interactions
    for (let i = 0; i < 6; i++) { await pad(i % 8, (i * 3) % 8, 60 + i * 10); await sleep(60); }
    for (const cc of [91, 92, 93, 94, 89, 79]) { await btn(cc); await sleep(40); }
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, String(k + 2).padStart(2, '0') + '-' + id + '.png') });
    check(cur === id, `tuile ${k} → ${id} (actuel : ${cur})`);
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

  check(errors.length === 0, 'Aucune erreur JavaScript' + (errors.length ? ' : ' + errors.slice(0, 5).join(' | ') : ''));

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
