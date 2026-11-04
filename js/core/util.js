/* Utilitaires partagés : couleurs, aléatoire, stockage, DOM. */
window.LP = window.LP || {};
(function (LP) {
  'use strict';
  const U = {};

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.rand = (n) => Math.floor(Math.random() * n);
  U.randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  U.choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  U.now = () => performance.now() / 1000;

  /* Couleurs : tableaux [r, g, b] en 0..255 */
  U.hsv = (h, s, v) => {
    if (s === undefined) s = 1;
    if (v === undefined) v = 1;
    h = (((h % 360) + 360) % 360) / 60;
    const i = Math.floor(h), f = h - i;
    const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
    let r, g, b;
    switch (i) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q;
    }
    return [r * 255, g * 255, b * 255];
  };
  U.scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  U.mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  U.add = (a, b) => [Math.min(255, a[0] + b[0]), Math.min(255, a[1] + b[1]), Math.min(255, a[2] + b[2])];
  U.rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

  U.C = {
    off: [0, 0, 0],
    white: [255, 255, 255],
    grey: [70, 70, 70],
    dim: [25, 25, 30],
    red: [255, 0, 0],
    orange: [255, 100, 0],
    gold: [255, 170, 0],
    yellow: [255, 220, 0],
    lime: [150, 255, 0],
    green: [0, 255, 0],
    teal: [0, 255, 150],
    cyan: [0, 220, 255],
    blue: [0, 60, 255],
    purple: [140, 0, 255],
    magenta: [255, 0, 200],
    pink: [255, 60, 130]
  };

  /* Stockage local (protégé : peut échouer en navigation privée) */
  U.store = {
    get(key, def) {
      try {
        const v = localStorage.getItem('lpa.' + key);
        return v === null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem('lpa.' + key, JSON.stringify(val)); } catch (e) { /* ignore */ }
    }
  };

  /* Mini constructeur DOM */
  U.h = function (tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === undefined || v === null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k in el && typeof v !== 'string') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      const list = Array.isArray(c) ? c.flat(Infinity) : [c];
      for (const x of list) {
        if (x === null || x === undefined || x === false) continue;
        el.append(x instanceof Node ? x : document.createTextNode(String(x)));
      }
    }
    return el;
  };

  /* Petit système d'événements */
  U.emitter = function (obj) {
    const map = {};
    obj.on = (ev, fn) => { (map[ev] = map[ev] || []).push(fn); };
    obj.emit = (ev, data) => { (map[ev] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); };
    return obj;
  };

  U.fmtTime = (s) => {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  /* Supprime les accents (pour l'affichage texte sur le Launchpad) */
  U.plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

  LP.U = U;
})(window.LP);
