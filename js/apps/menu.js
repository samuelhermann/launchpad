/* Accueil : chaque appli est une tuile 2x2 sur le Launchpad. */
(function (LP) {
  'use strict';
  const U = LP.U, h = U.h;

  LP.apps.register({
    id: 'menu', name: 'Accueil', hidden: true, emoji: '🏠', color: [255, 255, 255],
    desc: 'Appuie sur une tuile du Launchpad (ou choisis dans la liste à gauche) pour lancer un jeu ou un instrument.',
    help: [
      ['Tuiles 2×2', 'Lancer l’application'],
      ['Bouton ⌂ (en haut à droite)', 'Revenir ici depuis n’importe quelle appli'],
      ['Colonne de droite', 'Luminosité du Launchpad'],
      ['Échap (clavier)', 'Revenir à l’accueil']
    ],
    buttons: { right: ['100%', '', '', '', '', '', '', '10%'] },

    tiles() { return LP.apps.list.filter((a) => !a.hidden).slice(0, 16); },

    start(api) {
      this.api = api;
      this.flash = null;
      api.hud({}, 'Choisis une application sur le Launchpad ou dans la liste.');
    },

    label(x, y) {
      if (x % 2 || y % 2) return '';
      const a = this.tiles()[(y / 2) * 4 + x / 2];
      return a ? a.emoji : '';
    },

    render(fb, t) {
      const tiles = this.tiles();
      for (let k = 0; k < 16; k++) {
        const tx = (k % 4) * 2, ty = Math.floor(k / 4) * 2;
        const a = tiles[k];
        if (!a) {
          for (let j = 0; j < 4; j++) {
            const x = tx + (j % 2), y = ty + (j >> 1);
            fb.set(x, y, U.hsv(x * 45 + y * 20, 1, 0.1));
          }
          continue;
        }
        const icon = typeof a.icon === 'function' ? a.icon(Math.floor(t * 2) / 2) : (a.icon || [a.color, a.color, a.color, a.color]);
        for (let j = 0; j < 4; j++) fb.set(tx + (j % 2), ty + (j >> 1), icon[j]);
      }
      if (this.flash) {
        const f = this.flash, k = 1 - f.age / 0.25;
        if (k > 0) fb.rect(f.x, f.y, 2, 2, U.scale([255, 255, 255], k));
      }
      for (let i = 0; i < 7; i++) fb.button('top', i, U.hsv(i * 45, 1, 0.45));
      const b = LP.launchpad.brightness;
      for (let i = 0; i < 8; i++) {
        const lvl = (8 - i) / 8;
        fb.button('right', i, lvl <= b + 0.01 ? U.scale([255, 255, 255], 0.12 + 0.6 * lvl) : [8, 8, 8]);
      }
      fb.setLogo(U.hsv(Math.floor(t) * 40, 1, 1));
    },

    update(dt) { if (this.flash) { this.flash.age += dt; if (this.flash.age > 0.25) this.flash = null; } },

    onPad(x, y, v, down) {
      if (!down) return;
      const k = Math.floor(y / 2) * 4 + Math.floor(x / 2);
      const a = this.tiles()[k];
      if (!a) return;
      LP.audio.sfx.click();
      this.api.launch(a.id);
    },

    onButton(side, i, down) {
      if (side === 'right' && down) LP.launchpad.setBrightness((8 - i) / 8);
    },

    panel(el, api) {
      el.append(h('p', { class: 'note' }, 'Toutes les applications :'));
      const grid = h('div', { class: 'home-grid' });
      for (const a of LP.apps.list) {
        if (a.hidden) continue;
        grid.append(h('button', { class: 'home-card', onclick: () => api.launch(a.id) },
          h('span', { class: 'emoji big' }, a.emoji),
          h('span', null, h('b', null, a.name), h('small', null, a.short || ''))));
      }
      el.append(grid);
      el.append(h('h3', null, 'Astuce'));
      el.append(api.ui.note('La batterie et le séquenceur mélodique continuent de jouer quand tu changes d’appli : lance un rythme, puis va jouer du clavier ou du light show par-dessus !'));
    }
  });
})(window.LP);
