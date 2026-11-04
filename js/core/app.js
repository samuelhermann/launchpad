/* Noyau : registre des applis, boucle principale, routage des entrées, interface web. */
(function (LP) {
  'use strict';
  const U = LP.U;
  const h = U.h;

  LP.apps = { list: [], byId: {}, register(a) { this.list.push(a); this.byId[a.id] = a; } };

  /* ---------- Contrôles d'interface pour les panneaux ---------- */
  const ui = LP.ui = {
    row(label, control) { return h('div', { class: 'ctl' }, label ? h('label', null, label) : null, control); },
    seg(label, options, value, onChange) {
      const wrap = h('div', { class: 'seg' });
      options.forEach((o) => {
        const b = h('button', { class: o.value === value ? 'on' : '', onclick: () => { onChange(o.value); wrap.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); } }, o.label);
        wrap.append(b);
      });
      return ui.row(label, wrap);
    },
    select(label, options, value, onChange) {
      const s = h('select', { onchange: () => onChange(s.value) });
      options.forEach((o) => s.append(h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
      return ui.row(label, s);
    },
    range(label, min, max, step, value, onChange, fmt) {
      const out = h('span', { class: 'val' }, fmt ? fmt(value) : value);
      const r = h('input', { type: 'range', min, max, step, value, oninput: () => { const v = parseFloat(r.value); out.textContent = fmt ? fmt(v) : v; onChange(v); } });
      return ui.row(label, h('div', { class: 'range' }, r, out));
    },
    toggle(label, value, onChange) {
      const c = h('input', { type: 'checkbox', checked: !!value, onchange: () => onChange(c.checked) });
      return h('label', { class: 'toggle' }, c, h('span', null, label));
    },
    buttons(list) {
      return h('div', { class: 'btns' }, list.map((b) => h('button', { class: b.cls || '', onclick: b.onClick }, b.label)));
    },
    note(text) { return h('p', { class: 'note' }, text); }
  };

  /* ---------- Cœur ---------- */
  const core = LP.core = {
    fb: new LP.FrameBuffer(),
    current: null,
    overlay: null,
    lastT: 0,
    lastFlush: 0,
    lastDom: 0,
    testUntil: 0,
    started: false,
    bg: []
  };
  core.addBackground = (fn) => core.bg.push(fn);

  const api = core.api = {
    U,
    font: LP.font,
    audio: LP.audio,
    sfx: LP.audio.sfx,
    music: LP.music,
    transport: LP.transport,
    ui,
    launch: (id) => core.launch(id),
    hud: (fields, msg) => core.setHud(fields, msg),
    text: (str, color, opts) => core.showText(str, color, opts),
    toast: (m) => core.toast(m),
    refresh: () => core.refresh(),
    best(key, val, lowerIsBetter) {
      const k = 'best.' + key;
      let b = U.store.get(k, null);
      if (val !== undefined && val !== null && (b === null || (lowerIsBetter ? val < b : val > b))) { b = val; U.store.set(k, b); }
      return b;
    },
    vel: (v) => (v === undefined ? 0.8 : U.clamp(v / 127, 0.05, 1)),
    model: () => LP.launchpad.model
  };

  core.launch = function (id) {
    const app = LP.apps.byId[id] || LP.apps.byId.menu;
    if (core.current && core.current.stop) { try { core.current.stop(); } catch (e) { console.error(e); } }
    core.overlay = null;
    core.current = app;
    LP.launchpad.invalidate();
    core.hudFields = {}; core.hudMsg = '';
    if (app.id !== 'menu') U.store.set('lastApp', app.id);
    try { if (app.start) app.start(api); } catch (e) { console.error(e); }
    document.body.dataset.app = app.id;
    core.buildPanel();
    core.updateSidebar();
    core.refreshLabels();
    core.renderHud();
  };

  core.refreshLabels = function () {
    const a = core.current;
    const leg = Object.assign({}, a.buttons || {});
    leg.home = a.id !== 'menu';
    LP.display.setLegends(leg);
    LP.display.setLabels(a.label ? (x, y) => a.label(x, y) : null);
  };

  core.refresh = function () { core.buildPanel(); core.refreshLabels(); core.renderHud(); };

  core.input = function (ev) {
    const a = core.current;
    if (!a) return;
    core.lastInput = ev;
    if (ev.type === 'button' && ev.side === 'top' && ev.i === 7) {
      if (ev.down && a.id !== 'menu') { LP.audio.sfx.click(); core.launch('menu'); }
      return;
    }
    if (core.overlay) {
      if (ev.down && core.overlay.age > 0.4) core.endOverlay();
      return;
    }
    try {
      if (ev.type === 'pad') { if (a.onPad) a.onPad(ev.x, ev.y, ev.vel, ev.down); }
      else if (a.onButton) a.onButton(ev.side, ev.i, ev.down, ev.vel);
    } catch (e) { console.error(e); }
  };

  core.showText = function (str, color, opts) {
    opts = opts || {};
    core.overlay = { scroller: new LP.font.Scroller(str, color || [255, 255, 255], opts), onDone: opts.onDone, age: 0 };
  };
  core.endOverlay = function () {
    const o = core.overlay; core.overlay = null;
    if (o && o.onDone) { try { o.onDone(); } catch (e) { console.error(e); } }
  };

  core.tick = function () {
    const t = U.now();
    let dt = t - (core.lastT || t);
    core.lastT = t;
    if (dt > 0.1) dt = 0.1;
    LP.transport.schedule();
    for (const f of core.bg) { try { f(dt, t); } catch (e) { console.error(e); } }
    const a = core.current;
    if (!a) return;
    try { if (a.update) a.update(dt, t); } catch (e) { console.error(e); }
    if (core.overlay) {
      core.overlay.age += dt;
      core.overlay.scroller.update(dt);
      if (core.overlay.scroller.done) core.endOverlay();
    }
    const fb = core.fb;
    fb.clear();
    try { if (a.render) a.render(fb, t); } catch (e) { console.error(e); }
    if (core.overlay) { fb.clearGrid(); core.overlay.scroller.render(fb, t); }
    if (a.id !== 'menu') fb.button('top', 7, [120, 120, 120]);
    if (core.testUntil > t) core.testPattern(fb, t);
    if (t - core.lastFlush >= LP.launchpad.profile().interval) { core.lastFlush = t; LP.launchpad.flush(fb); }
    if (!document.hidden && t - core.lastDom > 0.025) { core.lastDom = t; LP.display.render(fb); }
  };

  core.testPattern = function (fb, t) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) fb.set(x, y, U.hsv((x + y) * 22 + t * 200, 1, 1));
    for (const s of ['top', 'right', 'left', 'bottom', 'bottom2']) for (let i = 0; i < 8; i++) fb.button(s, i, U.hsv(i * 45 + t * 200, 1, 1));
    fb.setLogo(U.hsv(t * 200, 1, 1));
  };

  /* ---------- HUD (au-dessus du Launchpad virtuel) ---------- */
  core.setHud = function (fields, msg) {
    core.hudFields = fields || {};
    if (msg !== undefined) core.hudMsg = msg;
    core.renderHud();
  };
  core.renderHud = function () {
    const el = document.getElementById('hud');
    if (!el || !core.current) return;
    const a = core.current;
    el.innerHTML = '';
    el.append(h('div', { class: 'hud-title' }, h('span', { class: 'emoji' }, a.emoji || ''), a.name));
    const pills = h('div', { class: 'hud-pills' });
    for (const k in core.hudFields) {
      const v = core.hudFields[k];
      if (v === undefined || v === null || v === '') continue;
      pills.append(h('div', { class: 'pill' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, String(v))));
    }
    el.append(pills);
    el.append(h('div', { class: 'hud-msg' }, core.hudMsg || ''));
  };

  core.toast = function (msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(core._toastT);
    core._toastT = setTimeout(() => el.classList.remove('show'), 2600);
  };

  /* ---------- Barre latérale & panneau ---------- */
  const CATS = LP.CATS = [['jeu', 'Jeux'], ['musique', 'Musique'], ['outil', 'Outils']];
  core.buildSidebar = function () {
    const nav = document.getElementById('sidebar');
    nav.innerHTML = '';
    nav.append(h('button', { class: 'app-item home', 'data-id': 'menu', onclick: () => core.launch('menu') }, h('span', { class: 'emoji' }, '🏠'), h('span', null, 'Accueil')));
    for (const [cat, title] of CATS) {
      const items = LP.apps.list.filter((a) => a.cat === cat && !a.hidden);
      if (!items.length) continue;
      nav.append(h('div', { class: 'cat' }, title));
      for (const a of items) {
        nav.append(h('button', { class: 'app-item', 'data-id': a.id, onclick: () => core.launch(a.id) },
          h('span', { class: 'dot', style: { background: U.rgb(a.color), boxShadow: '0 0 8px ' + U.rgb(a.color) } }),
          h('span', { class: 'emoji' }, a.emoji || ''),
          h('span', null, a.name)));
      }
    }
  };
  core.updateSidebar = function () {
    document.querySelectorAll('#sidebar .app-item').forEach((b) => b.classList.toggle('active', b.dataset.id === core.current.id));
  };

  core.buildPanel = function () {
    const el = document.getElementById('panel');
    const a = core.current;
    el.innerHTML = '';
    el.append(h('div', { class: 'panel-head' }, h('span', { class: 'emoji big' }, a.emoji || ''), h('h2', null, a.name)));
    if (a.desc) el.append(h('p', { class: 'desc' }, a.desc));
    if (a.help && a.help.length) {
      el.append(h('h3', null, 'Contrôles'));
      el.append(h('dl', { class: 'help' }, a.help.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])));
    }
    if (a.panel) {
      const box = h('div', { class: 'settings' });
      el.append(h('h3', null, 'Réglages'));
      el.append(box);
      try { a.panel(box, api); } catch (e) { console.error(e); }
    }
  };

  /* ---------- Horloge (Worker : continue même si la fenêtre est en arrière-plan) ---------- */
  core.startTicker = function () {
    const ms = 16;
    try {
      const src = 'let id=null;onmessage=function(e){clearInterval(id);id=setInterval(function(){postMessage(0)},e.data)}';
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = core.tick;
      w.postMessage(ms);
      core.worker = w;
    } catch (e) {
      setInterval(core.tick, ms);
    }
  };
})(window.LP);
