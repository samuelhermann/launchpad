/* Peinture : dessiner avec les pads. Sert aussi à tester son Launchpad. */
(function (LP) {
  'use strict';
  const U = LP.U, h = U.h;
  const PAL = [[255, 0, 0], [255, 120, 0], [255, 230, 0], [0, 255, 0], [0, 220, 255], [0, 40, 255], [200, 0, 255], [255, 255, 255]];

  LP.apps.register({
    id: 'paint', name: 'Peinture & test', cat: 'outil', emoji: '🎨', color: [255, 0, 150],
    short: 'Dessine sur la grille / teste les pads',
    icon: [[255, 0, 200], [0, 220, 255], [255, 230, 0], [255, 255, 255]],
    desc: 'Choisis une couleur dans la colonne de droite et dessine sur la grille. Toucher un pad déjà de cette couleur l’efface. Ton dessin est sauvegardé. Pratique aussi pour vérifier que tous les pads et boutons répondent.',
    help: [
      ['Pads', 'Peindre / effacer'],
      ['Colonne droite', 'Choisir la couleur'],
      ['Haut 1', 'Tout effacer'],
      ['Haut 2', 'Tout remplir'],
      ['Haut 3', 'Son quand on peint (oui/non)']
    ],
    buttons: { top: ['✕', '■', '♪'] },

    start(api) {
      this.api = api;
      this.cur = U.store.get('paint.color', 0);
      this.sound = U.store.get('paint.sound', true);
      this.pix = U.store.get('paint.pix', null) || new Array(64).fill(-1);
      this.flash = [];
      this.offRaw = this.offRaw || LP.launchpad.on('raw', (r) => { if (LP.core.current === this) this.showRaw(r); });
      this.hud();
    },

    hud(extra) { this.api.hud({ Couleur: this.cur + 1 }, extra || 'Dessine ! Touche un bouton pour vérifier qu’il répond.'); },

    showRaw(r) {
      const kind = (r.status & 0xF0) === 0xB0 ? 'CC' : 'Note';
      this.hud('Message MIDI reçu : ' + kind + ' ' + r.data1 + ' — valeur ' + r.data2);
    },

    save() { U.store.set('paint.pix', this.pix); },

    update(dt) { this.flash = this.flash.filter((f) => (f.age += dt) < 0.3); },

    render(fb) {
      for (let i = 0; i < 64; i++) if (this.pix[i] >= 0) fb.set(i % 8, Math.floor(i / 8), PAL[this.pix[i]]);
      PAL.forEach((c, i) => fb.button('right', i, i === this.cur ? c : U.scale(c, 0.15)));
      fb.button('top', 0, [100, 0, 0]);
      fb.button('top', 1, PAL[this.cur]);
      fb.button('top', 2, this.sound ? [0, 200, 255] : [0, 25, 35]);
      for (let i = 3; i < 7; i++) fb.button('top', i, [15, 15, 15]);
      for (const s of ['left', 'bottom', 'bottom2']) for (let i = 0; i < 8; i++) fb.button(s, i, [15, 15, 15]);
      for (const f of this.flash) if (f.side) fb.button(f.side, f.i, U.scale([255, 255, 255], 1 - f.age / 0.3));
      fb.setLogo(PAL[this.cur]);
    },

    onPad(x, y, v, down) {
      if (!down) return;
      const i = y * 8 + x;
      this.pix[i] = this.pix[i] === this.cur ? -1 : this.cur;
      if (this.sound) LP.audio.sfx.note(LP.music.midiFor(x + (7 - y) * 2, 4), 0.3, 'chip', this.api.vel(v));
      this.save();
    },

    onButton(side, i, down) {
      if (!down) return;
      this.flash.push({ side, i, age: 0 });
      if (side === 'right') { this.cur = i; U.store.set('paint.color', i); this.hud(); }
      if (side === 'top') {
        if (i === 0) { this.pix.fill(-1); this.save(); }
        if (i === 1) { this.pix.fill(this.cur); this.save(); }
        if (i === 2) { this.sound = !this.sound; U.store.set('paint.sound', this.sound); this.api.refresh(); }
      }
    },

    panel(el, api) {
      const row = h('div', { class: 'btns' });
      PAL.forEach((c, i) => row.append(h('button', { style: { background: U.rgb(c), width: '34px', height: '28px', outline: i === this.cur ? '2px solid #fff' : 'none' }, onclick: () => { this.cur = i; U.store.set('paint.color', i); api.refresh(); } })));
      el.append(api.ui.row('Couleur', row));
      el.append(api.ui.toggle('Jouer une note en peignant', this.sound, (v) => { this.sound = v; U.store.set('paint.sound', v); }));
      el.append(api.ui.buttons([
        { label: 'Tout effacer', onClick: () => { this.pix.fill(-1); this.save(); } },
        { label: '🌈 Tester les LED', cls: 'ghost', onClick: () => { LP.core.testUntil = U.now() + 2.5; } }
      ]));
      el.append(api.ui.note('Le message MIDI reçu s’affiche au-dessus du Launchpad à chaque appui : utile si un bouton ne répond pas.'));
    }
  });
})(window.LP);
