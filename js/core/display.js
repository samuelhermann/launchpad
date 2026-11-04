/* Framebuffer (ce que l'app dessine) + Launchpad virtuel à l'écran. */
(function (LP) {
  'use strict';
  const U = LP.U;
  const SIDES = ['top', 'right', 'left', 'bottom', 'bottom2'];

  class FrameBuffer {
    constructor() {
      this.grid = [];
      for (let i = 0; i < 64; i++) this.grid.push([0, 0, 0]);
      this.btn = {};
      for (const s of SIDES) { this.btn[s] = []; for (let i = 0; i < 8; i++) this.btn[s].push([0, 0, 0]); }
      this.logo = [0, 0, 0];
    }
    clear() {
      this.clearGrid();
      for (const s of SIDES) for (const p of this.btn[s]) { p[0] = 0; p[1] = 0; p[2] = 0; }
      this.logo[0] = this.logo[1] = this.logo[2] = 0;
    }
    clearGrid() { for (const p of this.grid) { p[0] = 0; p[1] = 0; p[2] = 0; } }
    set(x, y, c) {
      if (x < 0 || x > 7 || y < 0 || y > 7 || !c) return;
      const p = this.grid[y * 8 + x];
      p[0] = c[0]; p[1] = c[1]; p[2] = c[2];
    }
    add(x, y, c) {
      if (x < 0 || x > 7 || y < 0 || y > 7 || !c) return;
      const p = this.grid[y * 8 + x];
      p[0] = Math.min(255, p[0] + c[0]); p[1] = Math.min(255, p[1] + c[1]); p[2] = Math.min(255, p[2] + c[2]);
    }
    get(x, y) { return this.grid[y * 8 + x]; }
    fill(c) { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) this.set(x, y, c); }
    rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); }
    button(side, i, c) {
      const arr = this.btn[side];
      if (!arr || i < 0 || i > 7 || !c) return;
      const p = arr[i]; p[0] = c[0]; p[1] = c[1]; p[2] = c[2];
    }
    setLogo(c) { this.logo[0] = c[0]; this.logo[1] = c[1]; this.logo[2] = c[2]; }
  }
  LP.FrameBuffer = FrameBuffer;

  /* ---------- Launchpad virtuel ---------- */
  const OFF = 30;
  const D = LP.display = {
    root: null,
    full: false,
    cells: [], // {el, kind, x, y, side, i, last, label}
    onInput: null,
    legends: null,
    labelFn: null
  };

  D.build = function (root, full) {
    D.root = root || D.root;
    D.full = !!full;
    D.root.innerHTML = '';
    D.cells = [];
    const dev = U.h('div', { class: 'lp-device ' + (D.full ? 'full' : 'compact') });
    const n = D.full ? 10 : 9;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        // Coordonnées dans la disposition complète 10x10
        const R = r, C = D.full ? c : c + 1;
        let cell = null;
        if (R >= 1 && R <= 8 && C >= 1 && C <= 8) cell = { kind: 'pad', x: C - 1, y: R - 1 };
        else if (R === 0 && C >= 1 && C <= 8) cell = { kind: 'btn', side: 'top', i: C - 1 };
        else if (C === 9 && R >= 1 && R <= 8) cell = { kind: 'btn', side: 'right', i: R - 1 };
        else if (C === 0 && R >= 1 && R <= 8) cell = { kind: 'btn', side: 'left', i: R - 1 };
        else if (R === 9 && C >= 1 && C <= 8) cell = { kind: 'btn', side: 'bottom', i: C - 1 };
        else if (R === 0 && C === 9) cell = { kind: 'logo' };
        if (!cell) { dev.append(U.h('div', { class: 'cell blank' })); continue; }
        const label = U.h('span', { class: 'lbl' });
        const el = U.h('div', { class: 'cell ' + cell.kind + (cell.side ? ' side-' + cell.side : '') }, label);
        cell.el = el; cell.labelEl = label; cell.last = -1;
        if (cell.kind !== 'logo') attachPointer(el, cell);
        D.cells.push(cell);
        dev.append(el);
      }
    }
    D.root.append(dev);
    D.applyLabels();
  };

  function attachPointer(el, cell) {
    const fire = (down) => {
      if (!D.onInput) return;
      if (cell.kind === 'pad') D.onInput({ type: 'pad', x: cell.x, y: cell.y, vel: down ? 100 : 0, down, virtual: true });
      else D.onInput({ type: 'button', side: cell.side, i: cell.i, vel: down ? 127 : 0, down, virtual: true });
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      el.classList.add('pressed');
      fire(true);
    });
    const up = () => {
      if (!el.classList.contains('pressed')) return;
      el.classList.remove('pressed');
      fire(false);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  D.setLegends = function (legends) { D.legends = legends || {}; D.applyLabels(); };
  D.setLabels = function (fn) { D.labelFn = fn || null; D.applyLabels(); };

  D.applyLabels = function () {
    for (const c of D.cells) {
      let txt = '';
      if (c.kind === 'pad' && D.labelFn) txt = D.labelFn(c.x, c.y) || '';
      else if (c.kind === 'btn' && D.legends && D.legends[c.side]) txt = D.legends[c.side][c.i] || '';
      if (c.kind === 'btn' && c.side === 'top' && c.i === 7 && D.legends && D.legends.home) txt = '⌂';
      if (c.labelEl.textContent !== txt) c.labelEl.textContent = txt;
    }
  };

  D.render = function (fb) {
    for (const c of D.cells) {
      let col;
      if (c.kind === 'pad') col = fb.grid[c.y * 8 + c.x];
      else if (c.kind === 'logo') col = fb.logo;
      else col = fb.btn[c.side][c.i];
      const r = col[0] | 0, g = col[1] | 0, b = col[2] | 0;
      const key = (r << 16) | (g << 8) | b;
      if (key === c.last) continue;
      c.last = key;
      const m = Math.max(r, g, b);
      const k = (255 - OFF) / 255;
      const dr = OFF + r * k, dg = OFF + g * k, db = OFF + b * k;
      c.el.style.backgroundColor = `rgb(${dr | 0},${dg | 0},${db | 0})`;
      c.el.style.boxShadow = m > 40 ? `0 0 ${(6 + m / 18) | 0}px rgba(${r},${g},${b},${(0.25 + m / 600).toFixed(2)})` : 'none';
      c.el.classList.toggle('lit', m > 150);
    }
  };
})(window.LP);
