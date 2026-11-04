/* Accueil : 3 onglets (Jeux / Musique / Outils), chaque appli est une tuile 2x2. */
(function (LP) {
  'use strict';
  const U = LP.U, h = U.h;
  const TAB_COLORS = [[0, 255, 80], [255, 0, 200], [255, 140, 0]];

  LP.apps.register({
    id: 'menu', name: 'Accueil', hidden: true, emoji: '🏠', color: [255, 255, 255],
    desc: 'Choisis un onglet avec les 3 premiers boutons du haut (Jeux, Musique, Outils), puis appuie sur une tuile pour lancer l’application. Tu peux aussi cliquer dans la liste à gauche.',
    help: [
      ['Haut 1 / 2 / 3', 'Onglet Jeux / Musique / Outils'],
      ['Tuiles 2×2', 'Lancer l’application'],
      ['Bouton ⌂ (en haut à droite)', 'Revenir ici depuis n’importe quelle appli'],
      ['Colonne de droite', 'Luminosité du Launchpad'],
      ['Échap (clavier)', 'Revenir à l’accueil']
    ],
    buttons: { top: ['Jeux', 'Musiq', 'Outils'], right: ['100%', '', '', '', '', '', '', '10%'] },

    cats() { return LP.CATS.map((c) => c[0]); },
    tiles(tab) {
      const cat = this.cats()[tab === undefined ? this.tab : tab];
      return LP.apps.list.filter((a) => !a.hidden && a.cat === cat).slice(0, 16);
    },

    start(api) {
      this.api = api;
      this.tab = U.clamp(U.store.get('menu.tab', 0), 0, this.cats().length - 1);
      this.hud();
    },

    hud() { this.api.hud({ Onglet: LP.CATS[this.tab][1] }, 'Choisis une application sur le Launchpad ou dans la liste.'); },

    setTab(i) {
      if (i < 0 || i >= this.cats().length) return;
      this.tab = i; U.store.set('menu.tab', i);
      LP.audio.sfx.click();
      this.hud(); this.api.refresh();
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
          const c = U.scale(TAB_COLORS[this.tab], 0.05);
          for (let j = 0; j < 4; j++) fb.set(tx + (j % 2), ty + (j >> 1), c);
          continue;
        }
        const icon = typeof a.icon === 'function' ? a.icon(Math.floor(t * 2) / 2) : (a.icon || [a.color, a.color, a.color, a.color]);
        for (let j = 0; j < 4; j++) fb.set(tx + (j % 2), ty + (j >> 1), icon[j]);
      }
      TAB_COLORS.forEach((c, i) => fb.button('top', i, i === this.tab ? c : U.scale(c, 0.12)));
      const b = LP.launchpad.brightness;
      for (let i = 0; i < 8; i++) {
        const lvl = (8 - i) / 8;
        fb.button('right', i, lvl <= b + 0.01 ? U.scale([255, 255, 255], 0.12 + 0.6 * lvl) : [8, 8, 8]);
      }
      fb.setLogo(TAB_COLORS[this.tab]);
    },

    onPad(x, y, v, down) {
      if (!down) return;
      const a = this.tiles()[Math.floor(y / 2) * 4 + Math.floor(x / 2)];
      if (!a) return;
      LP.audio.sfx.click();
      this.api.launch(a.id);
    },

    onButton(side, i, down) {
      if (!down) return;
      if (side === 'right') LP.launchpad.setBrightness((8 - i) / 8);
      if (side === 'top' && i < this.cats().length) this.setTab(i);
    },

    onKey(e, down) {
      if (!down) return false;
      if (e.key === 'ArrowLeft') { this.setTab((this.tab + this.cats().length - 1) % this.cats().length); return true; }
      if (e.key === 'ArrowRight') { this.setTab((this.tab + 1) % this.cats().length); return true; }
      return false;
    },

    panel(el, api) {
      el.append(api.ui.seg('Onglet', LP.CATS.map((c, i) => ({ value: i, label: c[1] })), this.tab, (v) => this.setTab(v)));
      const grid = h('div', { class: 'home-grid' });
      for (const a of this.tiles()) {
        grid.append(h('button', { class: 'home-card', onclick: () => api.launch(a.id) },
          h('span', { class: 'emoji big' }, a.emoji),
          h('span', null, h('b', null, a.name), h('small', null, a.short || ''))));
      }
      el.append(grid);
      el.append(h('h3', null, 'Astuce'));
      el.append(api.ui.note('La batterie, le séquenceur et le Pomodoro continuent de tourner quand tu changes d’appli : lance un rythme, puis va jouer du clavier ou du visualiseur par-dessus !'));
    }
  });
})(window.LP);
