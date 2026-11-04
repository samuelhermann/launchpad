/*
 * Pomodoro : travail / pause courte / pause longue.
 * Le minuteur (LP.pomodoro) tourne en tâche de fond : il continue quand on change d'appli,
 * et même après un rechargement de la page (l'heure de fin est sauvegardée).
 */
(function (LP) {
  'use strict';
  const U = LP.U, h = U.h;

  const PHASES = {
    work: { name: 'Travail', color: [255, 40, 0], emoji: '🍅' },
    short: { name: 'Pause courte', color: [0, 230, 80], emoji: '☕' },
    long: { name: 'Pause longue', color: [0, 120, 255], emoji: '🌴' }
  };
  const DEF = { work: 25, short: 5, long: 15, every: 4, auto: true, sound: true, notify: false };

  const P = LP.pomodoro = U.emitter({
    PHASES,
    cfg: Object.assign({}, DEF, U.store.get('pomo.cfg', {})),
    phase: 'work', running: false, endAt: 0, remaining: 0, count: 0,
    today: { date: '', n: 0 },
    finishedAt: 0
  });

  const todayKey = () => new Date().toISOString().slice(0, 10);
  P.duration = (ph) => Math.max(0.01, P.cfg[ph || P.phase]) * 60000;
  P.left = () => (P.running ? Math.max(0, P.endAt - Date.now()) : P.remaining);
  P.fraction = () => P.left() / P.duration();

  P.save = function () {
    U.store.set('pomo.state', { phase: P.phase, running: P.running, endAt: P.endAt, remaining: P.remaining, count: P.count, today: P.today });
  };
  P.saveCfg = function () { U.store.set('pomo.cfg', P.cfg); };

  (function restore() {
    const s = U.store.get('pomo.state', null);
    if (s && PHASES[s.phase]) Object.assign(P, s);
    else P.remaining = P.duration('work');
    if (P.today.date !== todayKey()) P.today = { date: todayKey(), n: 0 };
    if (P.running && P.endAt <= Date.now()) { P.running = false; P.remaining = 0; }
    if (!P.running && P.remaining <= 0) P.remaining = P.duration();
  })();

  P.start = function () {
    if (P.running) return;
    if (P.remaining <= 0) P.remaining = P.duration();
    P.endAt = Date.now() + P.remaining;
    P.running = true;
    P.save(); P.emit('change');
  };
  P.pause = function () {
    if (!P.running) return;
    P.remaining = Math.max(0, P.endAt - Date.now());
    P.running = false;
    P.save(); P.emit('change');
  };
  P.toggle = function () { if (P.running) P.pause(); else P.start(); };
  P.reset = function () { P.running = false; P.remaining = P.duration(); P.save(); P.emit('change'); };
  P.setPhase = function (ph, autostart) {
    if (!PHASES[ph]) return;
    P.phase = ph; P.running = false; P.remaining = P.duration(ph);
    if (autostart) P.start(); else { P.save(); P.emit('change'); }
  };
  P.addMinutes = function (m) {
    if (P.running) P.endAt = Math.max(Date.now() + 1000, P.endAt + m * 60000);
    else P.remaining = Math.max(1000, P.remaining + m * 60000);
    P.save(); P.emit('change');
  };

  /* Passe à la phase suivante. completed = la phase est allée au bout */
  P.next = function (completed) {
    let nxt;
    if (P.phase === 'work') {
      if (completed) {
        P.count++;
        if (P.today.date !== todayKey()) P.today = { date: todayKey(), n: 0 };
        P.today.n++;
      }
      nxt = P.count > 0 && P.count % P.cfg.every === 0 ? 'long' : 'short';
    } else nxt = 'work';
    P.setPhase(nxt, completed && P.cfg.auto);
  };

  P.finish = function () {
    const ended = P.phase;
    P.finishedAt = U.now();
    if (P.cfg.sound) P.alarm();
    const msg = ended === 'work' ? 'Bravo ! C’est l’heure de la pause.' : 'La pause est finie, au travail !';
    LP.core.toast(PHASES[ended].emoji + ' ' + msg);
    if (P.cfg.notify && window.Notification && Notification.permission === 'granted') {
      try { new Notification('Pomodoro', { body: msg, silent: !P.cfg.sound }); } catch (e) { /* ignore */ }
    }
    P.next(true);
    P.emit('finish', ended);
  };

  P.alarm = function () {
    const A = LP.audio;
    if (!A.ready()) return;
    const t = A.ctx.currentTime;
    [0, 0.9].forEach((d) => [72, 76, 79, 84].forEach((m, i) => A.play(m, 0.5, 0.7, 'bell', t + d + i * 0.12)));
  };

  /* Tâche de fond : fin de phase, titre de l'onglet, indicateur de l'en-tête */
  let lastSec = -1;
  LP.core.addBackground(() => {
    if (P.running && Date.now() >= P.endAt) P.finish();
    const sec = Math.ceil(P.left() / 1000);
    if (sec === lastSec) return;
    lastSec = sec;
    const txt = U.fmtTime(sec);
    const active = P.running || P.left() < P.duration() - 999;
    document.title = P.running ? txt + ' ' + PHASES[P.phase].emoji + ' Launchpad Arcade' : 'Launchpad Arcade';
    const btn = document.getElementById('btnPomo');
    if (btn) {
      btn.classList.toggle('hidden', !active);
      btn.textContent = PHASES[P.phase].emoji + ' ' + txt + (P.running ? '' : ' ⏸');
    }
    const core = LP.core;
    if (core.current && core.current.id === 'pomodoro') core.current.hud();
  });
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnPomo');
    if (btn) btn.addEventListener('click', () => LP.core.launch('pomodoro'));
  });

  LP.apps.register({
    id: 'pomodoro', name: 'Pomodoro', cat: 'outil', emoji: '🍅', color: [255, 60, 30],
    short: 'Minuteur travail / pause, en sablier de lumière',
    icon: [[255, 40, 0], [255, 40, 0], [255, 40, 0], [0, 230, 80]],
    desc: 'Méthode Pomodoro : 25 minutes de travail, 5 minutes de pause, et une pause longue toutes les 4 séances. La grille est un sablier : les lumières s’éteignent au fil du temps. Le minuteur continue quand tu changes d’appli.',
    help: [
      ['Haut 1', 'Démarrer / pause'],
      ['Haut 2', 'Recommencer la phase'],
      ['Haut 3', 'Phase suivante'],
      ['Haut 4 / 5', '−1 / +1 minute'],
      ['Toucher un pad', 'Afficher les minutes restantes'],
      ['Colonne droite 1–4', 'Séances terminées du cycle'],
      ['Colonne droite 6 / 7 / 8', 'Travail / pause courte / pause longue']
    ],
    buttons: { top: ['▶⏸', '↺', '⏭', '−1', '+1'], right: ['', '', '', '', '', 'Trav.', 'Pause', 'Longue'] },

    start(api) {
      this.api = api;
      this.showDigits = 0;
      this.hud();
    },

    hud() {
      const ph = PHASES[P.phase];
      this.api.hud({
        Phase: ph.emoji + ' ' + ph.name,
        Restant: U.fmtTime(Math.ceil(P.left() / 1000)),
        Séance: ((P.count % P.cfg.every) + (P.phase === 'work' ? 1 : 0)) + ' / ' + P.cfg.every,
        'Aujourd’hui': P.today.n + ' 🍅'
      }, P.running ? '' : (P.left() < P.duration() - 999 ? 'En pause. Haut 1 (▶) pour reprendre.' : 'Appuie sur ▶ (haut gauche) ou sur le bouton ci-dessous pour démarrer.'));
    },

    update(dt) { if (this.showDigits > 0) this.showDigits -= dt; },

    render(fb, t) {
      const ph = PHASES[P.phase];
      const justDone = P.finishedAt && U.now() - P.finishedAt < 3;
      if (justDone) {
        // Célébration : clignotement de toute la grille (2 fois par seconde)
        const on = Math.floor((U.now() - P.finishedAt) * 4) % 2 === 0;
        if (on) fb.fill(U.scale(ph.color, 0.9));
      } else if (this.showDigits > 0) {
        const s = Math.ceil(P.left() / 1000);
        if (s >= 60) LP.font.digits(fb, Math.min(99, Math.ceil(s / 60)), [255, 255, 255], 1);
        else LP.font.digits(fb, s, [255, 200, 0], 1);
        fb.rect(0, 7, 8, 1, U.scale(ph.color, 0.5));
      } else {
        // Sablier : 64 cases ; le haut se vide en premier
        const lit = Math.ceil(P.fraction() * 64);
        const first = 64 - lit;
        const k = P.running ? 1 : 0.35;
        for (let i = first; i < 64; i++) fb.set(i % 8, Math.floor(i / 8), U.scale(ph.color, k));
        if (lit > 0 && P.running && Math.floor(t * 1.5) % 2) fb.set(first % 8, Math.floor(first / 8), U.scale(ph.color, 0.25));
      }
      fb.button('top', 0, P.running ? [255, 200, 0] : [0, 255, 0]);
      fb.button('top', 1, [255, 90, 0]);
      fb.button('top', 2, [0, 120, 255]);
      fb.button('top', 3, [70, 70, 70]); fb.button('top', 4, [70, 70, 70]);
      const done = P.count % P.cfg.every;
      for (let i = 0; i < Math.min(4, P.cfg.every); i++) fb.button('right', i, i < done ? [255, 40, 0] : [25, 5, 0]);
      ['work', 'short', 'long'].forEach((p, i) => fb.button('right', 5 + i, p === P.phase ? PHASES[p].color : U.scale(PHASES[p].color, 0.12)));
      fb.setLogo(ph.color);
    },

    onPad(x, y, v, down) { if (down) this.showDigits = 2.5; },

    onButton(side, i, down) {
      if (!down) return;
      if (side === 'top') {
        if (i === 0) P.toggle();
        else if (i === 1) P.reset();
        else if (i === 2) P.next(false);
        else if (i === 3) P.addMinutes(-1);
        else if (i === 4) P.addMinutes(1);
        if (i === 3 || i === 4) this.showDigits = 2;
      } else if (side === 'right' && i >= 5) P.setPhase(['work', 'short', 'long'][i - 5]);
      LP.audio.sfx.click();
      this.hud(); this.api.refresh();
    },

    onKey(e, down) { if (down && e.key === ' ') { P.toggle(); this.hud(); this.api.refresh(); return true; } return false; },

    panel(el, api) {
      el.append(api.ui.buttons([
        { label: P.running ? '⏸ Pause' : '▶ Démarrer', onClick: () => { P.toggle(); this.hud(); api.refresh(); } },
        { label: '↺ Recommencer', cls: 'ghost', onClick: () => { P.reset(); this.hud(); } },
        { label: '⏭ Phase suivante', cls: 'ghost', onClick: () => { P.next(false); this.hud(); api.refresh(); } }
      ]));
      el.append(api.ui.seg('Phase', Object.keys(PHASES).map((p) => ({ value: p, label: PHASES[p].emoji + ' ' + PHASES[p].name })), P.phase, (v) => { P.setPhase(v); this.hud(); }));
      const dur = (key, label, min, max) => api.ui.range(label, min, max, 1, P.cfg[key], (v) => {
        P.cfg[key] = v; P.saveCfg();
        if (!P.running && P.phase === key) P.remaining = P.duration();
        this.hud();
      }, (v) => v + ' min');
      el.append(dur('work', 'Durée du travail', 5, 90));
      el.append(dur('short', 'Pause courte', 1, 30));
      el.append(dur('long', 'Pause longue', 5, 60));
      el.append(api.ui.range('Pause longue toutes les', 2, 8, 1, P.cfg.every, (v) => { P.cfg.every = v; P.saveCfg(); this.hud(); }, (v) => v + ' séances'));
      el.append(api.ui.toggle('Enchaîner automatiquement la phase suivante', P.cfg.auto, (v) => { P.cfg.auto = v; P.saveCfg(); }));
      el.append(api.ui.toggle('Sonnerie à la fin de chaque phase', P.cfg.sound, (v) => { P.cfg.sound = v; P.saveCfg(); }));
      el.append(api.ui.toggle('Notification du Mac à la fin de chaque phase', P.cfg.notify, async (v) => {
        P.cfg.notify = v; P.saveCfg();
        if (v && window.Notification && Notification.permission !== 'granted') {
          const r = await Notification.requestPermission();
          if (r !== 'granted') api.toast('Notifications refusées par Chrome (réglages du site).');
        }
      }));
      el.append(api.ui.buttons([{ label: 'Remettre le compteur du cycle à 0', cls: 'ghost', onClick: () => { P.count = 0; P.save(); this.hud(); } }]));
      el.append(api.ui.note('Le temps restant s’affiche aussi dans l’onglet de Chrome et en haut de la page. La sonnerie a besoin que le son soit activé (bouton Démarrer de l’accueil).'));
    }
  });
})(window.LP);
