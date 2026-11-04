/* Démarrage de l'application, écran d'accueil, réglages MIDI. */
(function (LP) {
  'use strict';
  const U = LP.U, h = U.h;
  const core = LP.core, L = LP.launchpad, A = LP.audio, T = LP.transport;

  function boot() {
    LP.display.onInput = core.input;
    L.onInput = core.input;
    LP.display.build(document.getElementById('device'), false);
    core.buildSidebar();
    core.launch('menu');
    core.startTicker();

    // Clavier de l'ordinateur
    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|SELECT|TEXTAREA/.test(tag) && e.key !== 'Escape') return;
      if (e.key === 'Escape') { if (core.current.id !== 'menu') core.launch('menu'); return; }
      const a = core.current;
      if (a.onKey && a.onKey(e, true)) { e.preventDefault(); return; }
      if (e.key === ' ' && a.cat === 'musique') { e.preventDefault(); T.toggle(); }
    });
    window.addEventListener('keyup', (e) => { const a = core.current; if (a.onKey) a.onKey(e, false); });

    // Statut MIDI
    const st = document.getElementById('midiStatus');
    const upd = () => {
      st.querySelector('.label').textContent = L.statusText();
      st.dataset.state = L.status;
      const full = L.status === 'connected' && L.model.full;
      if (full !== LP.display.full) { LP.display.build(null, full); core.refreshLabels(); }
      if (document.getElementById('settings').open) fillSettings();
    };
    L.on('status', upd); L.on('ports', upd);
    upd();
    st.addEventListener('click', openSettings);

    // Volume
    const vol = document.getElementById('masterVol');
    vol.value = A.volume;
    vol.addEventListener('input', () => A.setVolume(parseFloat(vol.value)));

    // Indicateur séquenceur
    const tb = document.getElementById('btnTransport');
    T.on('change', () => {
      tb.classList.toggle('hidden', !T.playing);
      tb.textContent = '■ Arrêter la musique (' + T.bpm + ' BPM)';
    });
    tb.addEventListener('click', () => T.stop());

    document.getElementById('btnSettings').addEventListener('click', openSettings);
    document.getElementById('btnFull').addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen();
    });

    // Écran de démarrage
    const ov = document.getElementById('startOverlay');
    const warn = document.getElementById('browserWarn');
    const ua = navigator.userAgent;
    const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Brave/.test(ua);
    if (!navigator.requestMIDIAccess) {
      warn.innerHTML = isSafari
        ? '⚠️ Safari ne gère pas le MIDI web. Ouvre cette page dans <b>Google Chrome</b> pour utiliser ton Launchpad. (Tu peux quand même jouer avec la souris.)'
        : '⚠️ Ce navigateur ne gère pas le MIDI web. Utilise <b>Google Chrome</b> pour le Launchpad. (Tu peux quand même jouer avec la souris.)';
      warn.hidden = false;
    }
    document.getElementById('btnStart').addEventListener('click', async () => {
      A.start();
      ov.classList.add('hide');
      core.started = true;
      await L.init();
      const last = U.store.get('lastApp', null);
      if (L.status === 'connected') { core.toast('🎉 ' + L.model.name + ' prêt !'); core.testUntil = U.now() + 0.8; }
      else if (L.status === 'nodevice') core.toast('Aucun Launchpad trouvé : branche-le, il sera détecté automatiquement.');
      else if (L.status === 'denied') core.toast('Accès MIDI refusé : autorise-le dans les réglages du site (cadenas).');
      if (last && LP.apps.byId[last] && new URLSearchParams(location.search).has('resume')) core.launch(last);
    });
    // Un clic n'importe où réactive l'audio si le navigateur l'a suspendu
    document.addEventListener('pointerdown', () => { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); });
  }

  /* ---------- Fenêtre de réglages ---------- */
  function openSettings() {
    const d = document.getElementById('settings');
    fillSettings();
    if (!d.open) d.showModal();
    clearInterval(openSettings.t);
    const tick = () => {
      const el = document.getElementById('ledStats');
      if (!d.open || !el) { clearInterval(openSettings.t); return; }
      el.textContent = L.status === 'connected' ? 'Débit actuel : ' + L.stats.ledsPerSec + ' LED/s (' + L.stats.bytesPerSec + ' octets/s)' : '';
    };
    tick();
    openSettings.t = setInterval(tick, 1000);
  }

  function fillSettings() {
    const body = document.getElementById('settingsBody');
    body.innerHTML = '';
    body.append(h('h3', null, 'Launchpad'));
    body.append(h('p', { class: 'status-line', 'data-state': L.status }, L.statusText()));
    if (L.status === 'connected') {
      body.append(h('p', { class: 'note' }, 'Port : ' + L.out.name + (L.manual ? ' (choix manuel)' : ' (détection auto)')));
    }
    if (L.status === 'idle') {
      body.append(h('p', { class: 'note' }, 'Clique sur « Démarrer » pour activer le MIDI.'));
    }
    if (L.access) {
      const ports = L.ports();
      const outSel = h('select', null, ports.outputs.map((p) => h('option', { value: p.id, selected: L.out && L.out.id === p.id }, p.name)));
      const inSel = h('select', null, ports.inputs.map((p) => h('option', { value: p.id, selected: L.inp && L.inp.id === p.id }, p.name)));
      const modSel = h('select', null, L.MODELS.map((m) => h('option', { value: m.id, selected: L.model && L.model.id === m.id }, m.name)));
      if (!ports.outputs.length) body.append(h('p', { class: 'note' }, 'Aucun port MIDI visible. Vérifie le câble USB et ferme Ableton Live / Novation Components si ouverts.'));
      else {
        body.append(LP.ui.row('Sortie MIDI', outSel));
        body.append(LP.ui.row('Entrée MIDI', inSel));
        body.append(LP.ui.row('Modèle', modSel));
        body.append(LP.ui.buttons([
          { label: 'Utiliser ce choix', onClick: () => L.useManual(outSel.value, inSel.value, modSel.value) },
          { label: 'Détection automatique', cls: 'ghost', onClick: () => L.useAuto() }
        ]));
      }
    }
    body.append(LP.ui.range('Luminosité des LED', 0.1, 1, 0.05, L.brightness, (v) => L.setBrightness(v), (v) => Math.round(v * 100) + ' %'));
    const auto = L.PROFILES[L.autoRate()].name;
    body.append(LP.ui.select('Vitesse d’envoi des LED', [{ value: 'auto', label: 'Automatique (' + auto + ' pour ce modèle)' }]
      .concat(Object.keys(L.PROFILES).map((id) => ({ value: id, label: L.PROFILES[id].name }))), L.rate, (v) => L.setRate(v)));
    body.append(h('p', { class: 'note' }, 'Si les lumières du Launchpad se figent ou ont du retard, choisis « Prudent » ou « Très prudent ».'));
    const live = h('p', { class: 'note', id: 'ledStats' });
    body.append(live);
    body.append(LP.ui.buttons([
      { label: '🔄 Reconnecter le Launchpad', cls: 'ghost', onClick: () => { L.reconnect(); core.toast('Launchpad reconnecté'); } },
      { label: '🌈 Tester les LED', cls: 'ghost', onClick: () => { core.testUntil = U.now() + 2.5; } }
    ]));
    body.append(h('p', { class: 'note' }, 'Si le Launchpad ne répond plus du tout, débranche-le puis rebranche-le : il est reconnecté automatiquement.'));
    if (L.lastRaw) body.append(h('p', { class: 'note' }, 'Dernier message reçu : ' + [L.lastRaw.status, L.lastRaw.data1, L.lastRaw.data2].join(' ')));
    body.append(h('h3', null, 'Son'));
    body.append(LP.ui.range('Réverbération', 0, 1, 0.05, A.reverbLevel, (v) => A.setReverb(v), (v) => Math.round(v * 100) + ' %'));
    body.append(LP.ui.range('Écho', 0, 1, 0.05, A.delayLevel, (v) => A.setDelay(v), (v) => Math.round(v * 100) + ' %'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.LP);
