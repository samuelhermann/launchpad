/*
 * Stream Deck : chaque pad est un bouton configurable (8 pages de 64).
 * Actions : ouvrir un site, raccourcis Mac (via Hammerspoon), OBS (WebSocket), commandes internes.
 */
(function (LP) {
  'use strict';
  const U = LP.U, h = U.h;
  const HS = LP.hammer, OBS = LP.obs;

  const PAL = [[255, 0, 0], [255, 110, 0], [255, 220, 0], [90, 255, 0], [0, 255, 120], [0, 220, 255],
    [0, 80, 255], [150, 0, 255], [255, 0, 200], [255, 255, 255], [255, 150, 120], [110, 110, 130]];
  const TYPES = [
    { id: 'url', name: '🌐 Ouvrir un site' },
    { id: 'keys', name: '⌨️ Raccourci clavier (Mac)', hs: true },
    { id: 'app', name: '🚀 Ouvrir une application (Mac)', hs: true },
    { id: 'media', name: '🎵 Lecture / volume / luminosité (Mac)', hs: true },
    { id: 'text', name: '✍️ Taper un texte (Mac)', hs: true },
    { id: 'shortcut', name: '⚡ Lancer un Raccourci Apple', hs: true },
    { id: 'obsScene', name: '🎬 OBS : changer de scène', obs: true },
    { id: 'obsMute', name: '🎙️ OBS : couper / remettre un son', obs: true },
    { id: 'obsRecord', name: '⏺ OBS : enregistrement marche/arrêt', obs: true },
    { id: 'obsStream', name: '📡 OBS : live marche/arrêt', obs: true },
    { id: 'internal', name: '🎛️ Launchpad Arcade (musique, Pomodoro…)' }
  ];
  const MEDIA = [['PLAY', '⏯ Lecture / pause'], ['NEXT', '⏭ Morceau suivant'], ['PREVIOUS', '⏮ Morceau précédent'],
    ['SOUND_UP', '🔊 Volume +'], ['SOUND_DOWN', '🔉 Volume −'], ['MUTE', '🔇 Muet'],
    ['BRIGHTNESS_UP', '🔆 Luminosité +'], ['BRIGHTNESS_DOWN', '🔅 Luminosité −']];
  const MODS = [['cmd', '⌘ Cmd'], ['shift', '⇧ Maj'], ['alt', '⌥ Option'], ['ctrl', '⌃ Ctrl']];
  const SYM = { cmd: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃' };
  const DIGIT_KC = { 0: 29, 1: 18, 2: 19, 3: 20, 4: 21, 5: 23, 6: 22, 7: 26, 8: 28, 9: 25 }; // touches physiques (AZERTY ou QWERTY)
  const SPECIAL = [['space', 'Espace'], ['return', 'Entrée'], ['escape', 'Échap'], ['tab', 'Tab'], ['delete', 'Effacer ⌫'],
    ['forwarddelete', 'Suppr ⌦'], ['left', '←'], ['right', '→'], ['up', '↑'], ['down', '↓'], ['home', 'Début'], ['end', 'Fin'],
    ['pageup', 'Page ↑'], ['pagedown', 'Page ↓']];
  const KEYS = 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => [c, c.toUpperCase()])
    .concat('0123456789'.split('').map((d) => [d, d]))
    .concat(SPECIAL)
    .concat([...Array(12).keys()].map((i) => ['f' + (i + 1), 'F' + (i + 1)]));
  const APPS = ['Spotify', 'Safari', 'Google Chrome', 'Finder', 'Music', 'Messages', 'Mail', 'Calendar', 'Notes', 'System Settings',
    'Discord', 'zoom.us', 'OBS', 'GarageBand', 'Visual Studio Code', 'Terminal', 'Slack', 'WhatsApp', 'Photos', 'Preview'];

  function examples() {
    const p = new Array(64).fill(null);
    const put = (x, y, b) => { p[y * 8 + x] = b; };
    put(0, 0, { label: 'YouTube', color: 0, type: 'url', url: 'https://www.youtube.com' });
    put(1, 0, { label: 'Gmail', color: 1, type: 'url', url: 'https://mail.google.com' });
    put(2, 0, { label: 'Google', color: 6, type: 'url', url: 'https://www.google.com' });
    put(3, 0, { label: 'Claude', color: 10, type: 'url', url: 'https://claude.ai' });
    put(0, 1, { label: 'Spotify', color: 4, type: 'app', app: 'Spotify' });
    put(1, 1, { label: 'Finder', color: 5, type: 'app', app: 'Finder' });
    put(2, 1, { label: 'Capture', color: 9, type: 'keys', mods: ['cmd', 'shift'], key: '4' });
    put(3, 1, { label: 'Copier', color: 11, type: 'keys', mods: ['cmd'], key: 'c' });
    put(4, 1, { label: 'Coller', color: 11, type: 'keys', mods: ['cmd'], key: 'v' });
    put(0, 2, { label: '⏮', color: 7, type: 'media', media: 'PREVIOUS' });
    put(1, 2, { label: '⏯', color: 7, type: 'media', media: 'PLAY' });
    put(2, 2, { label: '⏭', color: 7, type: 'media', media: 'NEXT' });
    put(3, 2, { label: 'Vol −', color: 8, type: 'media', media: 'SOUND_DOWN' });
    put(4, 2, { label: 'Vol +', color: 8, type: 'media', media: 'SOUND_UP' });
    put(5, 2, { label: 'Muet', color: 8, type: 'media', media: 'MUTE' });
    put(0, 3, { label: 'Scène 1', color: 3, type: 'obsScene', scene: 'Scène' });
    put(1, 3, { label: 'Scène 2', color: 3, type: 'obsScene', scene: 'Scène 2' });
    put(2, 3, { label: 'Micro', color: 2, type: 'obsMute', input: 'Mic/Aux' });
    put(3, 3, { label: 'REC', color: 0, type: 'obsRecord' });
    put(4, 3, { label: 'Live', color: 8, type: 'obsStream' });
    put(0, 4, { label: 'Pomodoro', color: 0, type: 'internal', action: 'pomo' });
    put(1, 4, { label: 'Musique', color: 1, type: 'internal', action: 'transport' });
    put(2, 4, { label: 'Visu', color: 5, type: 'internal', action: 'open:visualizer' });
    const pages = [p];
    for (let i = 1; i < 8; i++) pages.push(new Array(64).fill(null));
    return pages;
  }

  const keyLabel = (b) => (b.mods || []).map((m) => SYM[m] || '').join('') + ((KEYS.find((k) => k[0] === b.key) || [0, b.key || '?'])[1]);

  function errText(e) {
    const m = (e && e.message) || String(e);
    return ({
      'hs-off': 'Raccourcis Mac : installe d’abord le pont Hammerspoon (panneau de droite, « Connexions »).',
      'hs-down': 'Hammerspoon ne répond pas : vérifie qu’il est lancé et que le code est installé.',
      'hs-token': 'Hammerspoon refuse la demande : recopie le code (le jeton a changé).',
      'hs-fail': 'Hammerspoon n’a pas pu faire l’action (autorisation « Accessibilité » ?).',
      'obs-off': 'OBS n’est pas connecté (panneau de droite, « Connexions »).',
      popup: 'Chrome a bloqué le site : autorise les pop-ups (icône dans la barre d’adresse) ou installe le pont Hammerspoon.',
      empty: 'Ce bouton n’est pas encore réglé.'
    })[m] || ('Erreur : ' + m);
  }

  LP.apps.register({
    id: 'streamdeck', name: 'Stream Deck', cat: 'outil', emoji: '🎛️', color: [0, 150, 255],
    short: 'Boutons raccourcis : sites, Mac, OBS',
    icon: [[255, 0, 0], [0, 220, 255], [90, 255, 0], [150, 0, 255]],
    desc: 'Transforme le Launchpad en panneau de boutons : ouvrir un site, lancer une appli, raccourcis clavier, lecture/volume, OBS (scènes, micro, enregistrement, live)… 8 pages de 64 boutons. Les raccourcis Mac passent par l’appli gratuite Hammerspoon (voir « Connexions »).',
    help: [
      ['Pads', 'Déclencher le bouton'],
      ['Colonne droite', 'Changer de page (8 pages)'],
      ['Haut 1', 'Mode édition (puis clique un pad pour le régler)'],
      ['Boutons OBS', 'S’allument selon l’état : scène active, micro coupé, enregistrement…']
    ],
    buttons: { top: ['✏️'], right: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'] },

    start(api) {
      this.api = api;
      const saved = U.store.get('sd.pages', null);
      this.pages = Array.isArray(saved) && saved.length === 8 ? saved : examples();
      this.page = U.clamp(U.store.get('sd.page', 0), 0, 7);
      this.edit = this.edit || false;
      this.sel = -1;
      this.flashes = {};
      if (!this.subscribed) {
        this.subscribed = true;
        const upd = () => { if (LP.core.current === this) { this.updateStatus(); this.hud(); } };
        HS.on('status', upd); OBS.on('status', upd); OBS.on('state', upd);
      }
      this.hud();
    },

    save() { U.store.set('sd.pages', this.pages); },
    cur() { return this.pages[this.page]; },

    hud() {
      const hs = !HS.enabled ? 'non installé' : HS.status === 'ok' ? '✓ prêt' : HS.status === 'error' ? '✗ ne répond pas' : 'à tester';
      const obs = OBS.status === 'ok' ? '✓ ' + (OBS.current || 'connecté') : OBS.status === 'connecting' ? 'connexion…' : '–';
      this.api.hud({ Page: (this.page + 1) + ' / 8', Hammerspoon: hs, OBS: obs },
        this.edit ? '✏️ Mode édition : clique un pad (écran ou Launchpad) pour le régler dans le panneau de droite.' : '');
    },

    label(x, y) { const b = this.cur()[y * 8 + x]; return b ? String(b.label || '').slice(0, 8) : ''; },

    state(b) {
      switch (b.type) {
        case 'obsScene': return OBS.status === 'ok' && OBS.current === b.scene ? 1 : 0;
        case 'obsMute': return OBS.status === 'ok' && OBS.muted[b.input] ? 2 : 0;
        case 'obsRecord': return OBS.status === 'ok' && OBS.recording ? 2 : 0;
        case 'obsStream': return OBS.status === 'ok' && OBS.streaming ? 2 : 0;
        case 'internal':
          if (b.action === 'transport') return LP.transport.playing ? 1 : 0;
          if (b.action === 'pomo') return LP.pomodoro && LP.pomodoro.running ? 1 : 0;
          return 0;
        default: return 0;
      }
    },

    render(fb, t) {
      const page = this.cur();
      const now = U.now();
      for (let i = 0; i < 64; i++) {
        const x = i % 8, y = i >> 3, b = page[i];
        let c = null;
        if (b) {
          const st = this.state(b);
          let k = st ? 1 : 0.25;
          if (st === 2 && Math.floor(t * 2) % 2) k = 0.4;
          c = U.scale(PAL[b.color] || PAL[9], k);
        } else if (this.edit) c = [6, 6, 9];
        const f = this.flashes[i];
        if (f && now < f.until) c = f.color;
        if (this.edit && this.sel === i && Math.floor(t * 3) % 2) c = [255, 255, 255];
        if (c) fb.set(x, y, c);
      }
      fb.button('top', 0, this.edit ? [255, 140, 0] : [40, 20, 0]);
      for (let p = 0; p < 8; p++) {
        const used = this.pages[p].some((b) => b);
        fb.button('right', p, p === this.page ? [255, 255, 255] : used ? [40, 40, 70] : [6, 6, 6]);
      }
    },

    onPad(x, y, v, down) {
      if (!down) return;
      const i = y * 8 + x;
      if (this.edit) { this.sel = i; this.api.refresh(); return; }
      this.trigger(i);
    },

    async trigger(i) {
      const b = this.cur()[i];
      if (!b) return;
      this.flashes[i] = { until: U.now() + 0.15, color: [255, 255, 255] };
      try { await this.run(b); }
      catch (e) {
        this.flashes[i] = { until: U.now() + 0.6, color: [255, 0, 0] };
        this.api.toast(errText(e));
      }
    },

    async run(b) {
      switch (b.type) {
        case 'url': return this.openUrl(b.url);
        case 'keys': {
          if (!b.key) throw new Error('empty');
          const a = { type: 'keys', mods: b.mods || [] };
          if (/^[0-9]$/.test(b.key)) a.keycode = DIGIT_KC[b.key]; else a.key = b.key;
          return HS.send(a);
        }
        case 'app': if (!b.app) throw new Error('empty'); return HS.send({ type: 'app', app: b.app });
        case 'media': return HS.send({ type: 'media', key: b.media || 'PLAY' });
        case 'text': if (!b.text) throw new Error('empty'); return HS.send({ type: 'text', text: b.text });
        case 'shortcut': if (!b.shortcut) throw new Error('empty'); return HS.send({ type: 'shortcut', name: b.shortcut });
        case 'obsScene': if (!b.scene) throw new Error('empty'); return OBS.request('SetCurrentProgramScene', { sceneName: b.scene });
        case 'obsMute': if (!b.input) throw new Error('empty'); return OBS.request('ToggleInputMute', { inputName: b.input });
        case 'obsRecord': return OBS.request('ToggleRecord');
        case 'obsStream': return OBS.request('ToggleStream');
        case 'internal': return this.internal(b.action);
        default: throw new Error('empty');
      }
    },

    async openUrl(url) {
      url = String(url || '').trim();
      if (!url) throw new Error('empty');
      if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
      if (/^javascript:/i.test(url)) throw new Error('Adresse non autorisée');
      if (HS.enabled && HS.status === 'ok') return HS.send({ type: 'url', url });
      const w = window.open(url, '_blank');
      if (!w) throw new Error('popup');
      try { w.opener = null; } catch (e) { /* ignore */ }
    },

    internal(action) {
      if (action === 'transport') LP.transport.toggle();
      else if (action === 'pomo') LP.pomodoro.toggle();
      else if (action === 'pomoNext') LP.pomodoro.next(false);
      else if (action && action.startsWith('open:')) LP.core.launch(action.slice(5));
      else throw new Error('empty');
    },

    onButton(side, i, down) {
      if (!down) return;
      if (side === 'top' && i === 0) this.setEdit(!this.edit);
      if (side === 'right') { this.page = i; this.sel = -1; U.store.set('sd.page', i); this.api.refresh(); }
      this.hud();
    },

    setEdit(v) { this.edit = v; this.sel = -1; this.hud(); this.api.refresh(); },

    updateStatus() {
      const hs = document.getElementById('sdHs');
      if (hs) { hs.dataset.s = HS.enabled ? HS.status : 'unknown'; hs.textContent = !HS.enabled ? 'Pas encore installé' : HS.status === 'ok' ? 'Connecté' : HS.status === 'error' ? 'Ne répond pas' : 'À tester'; }
      const ob = document.getElementById('sdObs');
      if (ob) {
        ob.dataset.s = OBS.status === 'ok' ? 'ok' : OBS.status;
        ob.textContent = OBS.status === 'ok' ? 'Connecté' + (OBS.current ? ' — scène « ' + OBS.current + ' »' : '') : OBS.status === 'connecting' ? 'Connexion…' : OBS.status === 'error' ? OBS.error : 'Déconnecté';
      }
    },

    /* ---------- Panneau ---------- */
    panel(el, api) {
      el.append(api.ui.buttons([{ label: this.edit ? '✅ Terminer les modifications' : '✏️ Modifier les boutons', onClick: () => this.setEdit(!this.edit) }]));
      el.append(api.ui.seg('Page', [...Array(8).keys()].map((p) => ({ value: p, label: String(p + 1) })), this.page, (v) => { this.page = v; this.sel = -1; U.store.set('sd.page', v); api.refresh(); }));
      if (this.edit) {
        if (this.sel < 0) el.append(api.ui.note('Clique sur un pad du Launchpad (à l’écran ou en vrai) pour le régler.'));
        else this.editor(el, api);
      }

      el.append(h('h3', null, 'Connexions'));
      // Hammerspoon
      const hsPill = h('span', { class: 'pill-status', id: 'sdHs' });
      el.append(api.ui.row('Raccourcis Mac (Hammerspoon)', hsPill));
      const code = h('textarea', { class: 'code', readonly: true, spellcheck: false }, HS.lua());
      el.append(h('details', { class: 'howto', open: !HS.enabled }, h('summary', null, 'Installer le pont Hammerspoon (une seule fois)'),
        h('ol', null,
          h('li', null, 'Télécharge Hammerspoon (gratuit) sur hammerspoon.org, glisse-le dans Applications et lance-le.'),
          h('li', null, 'Réglages Système → Confidentialité et sécurité → Accessibilité : active Hammerspoon (pour qu’il puisse taper des raccourcis).'),
          h('li', null, 'Clique sur l’icône 🔨 de Hammerspoon (en haut de l’écran) → « Open Config ». Colle le code ci-dessous à la fin du fichier et enregistre.'),
          h('li', null, 'Icône 🔨 → « Reload Config ». Le message « pont Stream Deck actif » s’affiche.'),
          h('li', null, 'Clique sur « Tester la connexion » ci-dessous.')),
        code,
        api.ui.buttons([
          { label: '📋 Copier le code', onClick: () => { (navigator.clipboard ? navigator.clipboard.writeText(HS.lua()) : Promise.reject()).then(() => api.toast('Code copié !'), () => { code.select(); document.execCommand('copy'); api.toast('Code copié !'); }); } },
          { label: '🔑 Nouveau jeton', cls: 'ghost', onClick: () => { HS.newToken(); api.toast('Nouveau jeton : recopie le code dans Hammerspoon.'); api.refresh(); } }
        ])));
      el.append(api.ui.buttons([
        { label: '🔌 Tester la connexion', onClick: async () => { const ok = await HS.ping(); api.toast(ok ? '✅ Hammerspoon est prêt !' : errText(new Error(HS.status === 'error' ? 'hs-down' : 'hs-fail'))); } },
        HS.enabled ? { label: 'Désactiver', cls: 'ghost', onClick: () => { HS.enable(false); api.refresh(); } } : null
      ].filter(Boolean)));

      // OBS
      const obsPill = h('span', { class: 'pill-status', id: 'sdObs' });
      el.append(api.ui.row('OBS Studio', obsPill));
      const url = h('input', { type: 'text', value: OBS.url, spellcheck: false });
      const pw = h('input', { type: 'password', value: OBS.password, placeholder: 'Mot de passe du serveur WebSocket' });
      el.append(api.ui.row('Adresse', url));
      el.append(api.ui.row('Mot de passe', pw));
      el.append(api.ui.buttons([
        { label: OBS.status === 'ok' ? '🔄 Reconnecter' : '🔌 Connecter', onClick: () => { OBS.configure(url.value.trim(), pw.value); OBS.connect(); } },
        OBS.status !== 'off' ? { label: 'Déconnecter', cls: 'ghost', onClick: () => { OBS.disconnect(); api.refresh(); } } : null
      ].filter(Boolean)));
      el.append(h('details', { class: 'howto' }, h('summary', null, 'Activer la connexion dans OBS'),
        h('ol', null,
          h('li', null, 'Dans OBS : Outils → Paramètres du serveur WebSocket.'),
          h('li', null, 'Coche « Activer le serveur WebSocket » (port 4455).'),
          h('li', null, 'Clique « Afficher les informations de connexion » et copie le mot de passe.'),
          h('li', null, 'Colle-le ci-dessus puis « Connecter ». Ensuite, en mode édition, choisis tes scènes et ton micro dans les listes.'))));
      this.updateStatus();

      el.append(h('h3', null, 'Sauvegarde'));
      const imp = h('input', {
        type: 'file', accept: 'application/json,.json', onchange: async () => {
          try {
            const data = JSON.parse(await imp.files[0].text());
            if (!Array.isArray(data) || data.length !== 8 || !data.every((p) => Array.isArray(p) && p.length === 64)) throw new Error('format');
            this.pages = data; this.save(); api.toast('Boutons importés.'); api.refresh();
          } catch (e) { api.toast('Fichier invalide.'); }
        }
      });
      el.append(api.ui.buttons([
        { label: '💾 Exporter mes boutons', cls: 'ghost', onClick: () => {
          const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(this.pages, null, 1)], { type: 'application/json' })), download: 'stream-deck-launchpad.json' });
          document.body.append(a); a.click(); a.remove();
        } },
        { label: 'Remettre l’exemple', cls: 'ghost', onClick: () => { if (confirm('Remplacer tous tes boutons par l’exemple ?')) { this.pages = examples(); this.save(); api.refresh(); } } }
      ]));
      el.append(api.ui.row('Importer des boutons (.json)', imp));
      el.append(api.ui.note('Garde la page Launchpad Arcade ouverte (elle peut être derrière les autres fenêtres) : les boutons marchent pendant que tu utilises d’autres applis.'));
    },

    editor(el, api) {
      const page = this.cur(), i = this.sel;
      const b = page[i];
      const box = h('div', { class: 'editor' });
      box.append(h('b', null, 'Bouton colonne ' + (i % 8 + 1) + ', ligne ' + ((i >> 3) + 1)));
      el.append(box);
      if (!b) {
        box.append(api.ui.buttons([{ label: '➕ Créer un bouton ici', onClick: () => { page[i] = { label: 'Bouton', color: 5, type: 'url', url: '' }; this.save(); api.refresh(); } }]));
        return;
      }
      const changed = (refresh) => { this.save(); LP.core.refreshLabels(); if (refresh) api.refresh(); };
      const name = h('input', { type: 'text', value: b.label || '', maxlength: 14, oninput: () => { b.label = name.value; changed(false); } });
      box.append(api.ui.row('Nom (affiché sur le pad à l’écran)', name));
      const sw = h('div', { class: 'swatches' });
      PAL.forEach((c, k) => sw.append(h('button', { class: k === b.color ? 'on' : '', style: { background: U.rgb(c) }, title: 'Couleur ' + (k + 1), onclick: () => { b.color = k; changed(true); } })));
      box.append(api.ui.row('Couleur', sw));
      box.append(api.ui.select('Action', TYPES.map((t) => ({ value: t.id, label: t.name })), b.type, (v) => { b.type = v; changed(true); }));

      const field = (label, key, attrs) => {
        const inp = h('input', Object.assign({ type: 'text', value: b[key] || '', oninput: () => { b[key] = inp.value; changed(false); } }, attrs || {}));
        box.append(api.ui.row(label, inp));
        return inp;
      };
      const pickOrType = (label, key, list) => {
        if (list.length) {
          const opts = list.map((s) => ({ value: s, label: s }));
          if (b[key] && list.indexOf(b[key]) < 0) opts.unshift({ value: b[key], label: b[key] + ' (introuvable dans OBS)' });
          if (!b[key]) opts.unshift({ value: '', label: '— Choisir —' });
          box.append(api.ui.select(label, opts, b[key] || '', (v) => { b[key] = v; changed(false); }));
        } else field(label + ' (connecte OBS pour avoir la liste)', key);
      };

      switch (b.type) {
        case 'url': field('Adresse du site', 'url', { type: 'url', placeholder: 'https://…' }); break;
        case 'keys': {
          const mods = h('div', { class: 'mods' });
          MODS.forEach(([m, lab]) => {
            const c = h('input', { type: 'checkbox', checked: (b.mods || []).indexOf(m) >= 0, onchange: () => {
              b.mods = MODS.map((x) => x[0]).filter((x) => (x === m ? c.checked : (b.mods || []).indexOf(x) >= 0));
              changed(false); preview.textContent = 'Raccourci : ' + keyLabel(b);
            } });
            mods.append(h('label', null, c, lab));
          });
          box.append(api.ui.row('Touches de modification', mods));
          box.append(api.ui.select('Touche', [{ value: '', label: '— Choisir —' }].concat(KEYS.map((k) => ({ value: k[0], label: k[1] }))), b.key || '', (v) => {
            b.key = v; changed(false); preview.textContent = 'Raccourci : ' + keyLabel(b);
          }));
          const preview = h('p', { class: 'note' }, 'Raccourci : ' + keyLabel(b));
          box.append(preview);
          break;
        }
        case 'app': {
          const dl = h('datalist', { id: 'sdApps' }, APPS.map((a) => h('option', { value: a })));
          box.append(dl);
          field('Nom de l’application', 'app', { list: 'sdApps', placeholder: 'Spotify' });
          box.append(api.ui.note('Pour les applis Apple, utilise le nom anglais : Music, Calendar, Notes, System Settings…'));
          break;
        }
        case 'media': box.append(api.ui.select('Touche', MEDIA.map((m) => ({ value: m[0], label: m[1] })), b.media || 'PLAY', (v) => { b.media = v; changed(false); })); break;
        case 'text': {
          const ta = h('textarea', { rows: 3, oninput: () => { b.text = ta.value; changed(false); } }, b.text || '');
          box.append(api.ui.row('Texte à taper', ta));
          break;
        }
        case 'shortcut': field('Nom du raccourci (app Raccourcis)', 'shortcut', { placeholder: 'Mon raccourci' }); break;
        case 'obsScene': pickOrType('Scène', 'scene', OBS.scenes); break;
        case 'obsMute': pickOrType('Source audio', 'input', OBS.inputs); break;
        case 'internal': {
          const opts = [['transport', '🥁 Lancer / arrêter la musique'], ['pomo', '🍅 Pomodoro : démarrer / pause'], ['pomoNext', '⏭ Pomodoro : phase suivante']]
            .concat(LP.apps.list.filter((a) => !a.hidden && a.id !== 'streamdeck').map((a) => ['open:' + a.id, 'Ouvrir « ' + a.name + ' »']));
          box.append(api.ui.select('Commande', opts.map((o) => ({ value: o[0], label: o[1] })), b.action || 'transport', (v) => { b.action = v; changed(false); }));
          if (!b.action) { b.action = 'transport'; changed(false); }
          break;
        }
        default: break;
      }
      const t = TYPES.find((x) => x.id === b.type) || {};
      if (t.hs && !(HS.enabled && HS.status === 'ok')) box.append(api.ui.note('⚠️ Cette action passe par Hammerspoon : installe le pont (Connexions, plus bas).'));
      if (t.obs && OBS.status !== 'ok') box.append(api.ui.note('⚠️ Connecte OBS (Connexions, plus bas).'));
      box.append(api.ui.buttons([
        { label: '▶ Tester', onClick: () => this.trigger(i) },
        { label: '🗑️ Supprimer', cls: 'ghost', onClick: () => { page[i] = null; this.save(); api.refresh(); } }
      ]));
    }
  });
})(window.LP);
