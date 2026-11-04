/*
 * Ponts vers l'extérieur du navigateur (utilisés par le Stream Deck) :
 *  - LP.hammer : Hammerspoon (appli gratuite pour Mac) exécute les raccourcis clavier,
 *                lance des applis, touches multimédia… La page lui parle en HTTP local,
 *                avec un jeton secret pour qu'aucun autre site ne puisse le piloter.
 *  - LP.obs    : OBS Studio via son serveur WebSocket intégré (protocole v5).
 */
(function (LP) {
  'use strict';
  const U = LP.U;

  /* ---------- SHA-256 (pour l'authentification OBS) ---------- */
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  function sha256(bytes) {
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(nb); m.set(bytes); m[l] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(nb - 4, (l * 8) >>> 0); dv.setUint32(nb - 8, Math.floor(l * 8 / 0x100000000));
    const W = new Uint32Array(64);
    const rot = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rot(W[i - 15], 7) ^ rot(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rot(W[i - 2], 17) ^ rot(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], hh = H[7];
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += hh;
    }
    const out = new Uint8Array(32), odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
    return out;
  }
  const utf8 = (s) => new TextEncoder().encode(s);
  const b64 = (bytes) => { let s = ''; for (const x of bytes) s += String.fromCharCode(x); return btoa(s); };
  async function sha256b64(str) {
    if (window.crypto && crypto.subtle && window.isSecureContext) {
      try { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(str)))); } catch (e) { /* repli JS */ }
    }
    return b64(sha256(utf8(str)));
  }
  LP.sha256b64 = sha256b64;
  LP.sha256 = (str) => b64(sha256(utf8(str)));

  /* ---------- Hammerspoon ---------- */
  const randomToken = () => {
    const a = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = U.rand(256); });
    return Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
  };

  const HS = LP.hammer = U.emitter({
    port: 8765,
    token: U.store.get('hs.token', null),
    enabled: U.store.get('hs.enabled', false),
    status: 'unknown' // unknown | ok | error
  });
  if (!HS.token) { HS.token = randomToken(); U.store.set('hs.token', HS.token); }

  HS.setStatus = function (s) { if (HS.status !== s) { HS.status = s; HS.emit('status', s); } };
  HS.enable = function (v) { HS.enabled = v; U.store.set('hs.enabled', v); HS.emit('status', HS.status); };

  HS.send = async function (action) {
    if (!HS.enabled) throw new Error('hs-off');
    const body = JSON.stringify(Object.assign({}, action, { token: HS.token }));
    let res;
    try {
      res = await fetch('http://127.0.0.1:' + HS.port + '/', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
    } catch (e) { HS.setStatus('error'); throw new Error('hs-down'); }
    const txt = await res.text().catch(() => '');
    if (res.status === 403) { HS.setStatus('error'); throw new Error('hs-token'); }
    if (!res.ok) throw new Error('hs-fail');
    HS.setStatus('ok');
    return txt;
  };

  HS.ping = async function () {
    HS.enable(true);
    try { await HS.send({ type: 'ping' }); return true; } catch (e) { return false; }
  };

  HS.newToken = function () { HS.token = randomToken(); U.store.set('hs.token', HS.token); HS.setStatus('unknown'); };

  /* Code Lua à coller dans la configuration de Hammerspoon */
  HS.lua = function () {
    return `-- Launchpad Arcade : pont Stream Deck pour Hammerspoon
-- Colle ce bloc dans ~/.hammerspoon/init.lua puis « Reload Config ».
-- Le jeton empêche les autres sites web de déclencher tes raccourcis : garde-le secret.
local LPA_TOKEN = "${HS.token}"
local LPA_PORT = ${HS.port}

local function lpaKey(mods, key)
  hs.eventtap.event.newKeyEvent(mods, key, true):post()
  hs.timer.usleep(20000)
  hs.eventtap.event.newKeyEvent(mods, key, false):post()
end

local LPA_MEDIA = { PLAY = true, NEXT = true, PREVIOUS = true, FAST = true, REWIND = true,
  SOUND_UP = true, SOUND_DOWN = true, MUTE = true, BRIGHTNESS_UP = true, BRIGHTNESS_DOWN = true }

local function lpaRun(a)
  if a.type == "ping" then return true
  elseif a.type == "keys" then
    local mods = {}
    for _, m in ipairs(a.mods or {}) do if m == "cmd" or m == "ctrl" or m == "alt" or m == "shift" or m == "fn" then table.insert(mods, m) end end
    lpaKey(mods, a.keycode and tonumber(a.keycode) or a.key)
  elseif a.type == "app" then hs.application.launchOrFocus(a.app)
  elseif a.type == "url" then hs.urlevent.openURL(a.url)
  elseif a.type == "media" and LPA_MEDIA[a.key] then
    hs.eventtap.event.newSystemKeyEvent(a.key, true):post()
    hs.eventtap.event.newSystemKeyEvent(a.key, false):post()
  elseif a.type == "text" then hs.eventtap.keyStrokes(a.text)
  elseif a.type == "shortcut" then hs.task.new("/usr/bin/shortcuts", nil, { "run", a.name }):start()
  else return false end
  return true
end

local LPA_HEADERS = {
  ["Access-Control-Allow-Origin"] = "*",
  ["Access-Control-Allow-Methods"] = "POST, OPTIONS",
  ["Access-Control-Allow-Headers"] = "*",
  ["Access-Control-Allow-Private-Network"] = "true",
  ["Content-Type"] = "text/plain; charset=utf-8"
}

lpaServer = hs.httpserver.new(false, false)
lpaServer:setInterface("localhost")
lpaServer:setPort(LPA_PORT)
lpaServer:setCallback(function(method, path, headers, body)
  if method == "OPTIONS" then return "", 204, LPA_HEADERS end
  local ok, a = pcall(hs.json.decode, body or "")
  if not ok or type(a) ~= "table" or a.token ~= LPA_TOKEN then return "refuse", 403, LPA_HEADERS end
  local ok2, res = pcall(lpaRun, a)
  if ok2 and res then return "ok", 200, LPA_HEADERS end
  return "erreur", 500, LPA_HEADERS
end)
lpaServer:start()
hs.alert.show("Launchpad Arcade : pont Stream Deck actif")
`;
  };

  /* ---------- OBS (WebSocket v5) ---------- */
  const OBS = LP.obs = U.emitter({
    url: U.store.get('obs.url', 'ws://127.0.0.1:4455'),
    password: U.store.get('obs.pw', ''),
    auto: U.store.get('obs.auto', false),
    status: 'off', // off | connecting | ok | error
    error: '',
    scenes: [], inputs: [], current: '', recording: false, streaming: false, muted: {},
    ws: null, pending: {}, rid: 0
  });

  OBS.setStatus = function (s, err) { OBS.status = s; if (err !== undefined) OBS.error = err; OBS.emit('status', s); };

  OBS.configure = function (url, password) {
    OBS.url = url || 'ws://127.0.0.1:4455'; OBS.password = password || '';
    U.store.set('obs.url', OBS.url); U.store.set('obs.pw', OBS.password);
  };

  OBS.disconnect = function () {
    clearTimeout(OBS._retry);
    OBS.auto = false; U.store.set('obs.auto', false);
    if (OBS.ws) { const w = OBS.ws; OBS.ws = null; try { w.close(); } catch (e) { /* ignore */ } }
    OBS.setStatus('off', '');
  };

  OBS.connect = function () {
    clearTimeout(OBS._retry);
    if (OBS.ws) { const w = OBS.ws; OBS.ws = null; try { w.close(); } catch (e) { /* ignore */ } }
    OBS.setStatus('connecting', '');
    let ws;
    try { ws = new WebSocket(OBS.url); } catch (e) { OBS.setStatus('error', 'Adresse invalide'); return; }
    OBS.ws = ws;
    ws.onmessage = (e) => { if (OBS.ws === ws) { try { OBS.handle(JSON.parse(e.data)); } catch (err) { console.warn(err); } } };
    ws.onclose = (e) => {
      if (OBS.ws !== ws) return;
      OBS.ws = null;
      Object.values(OBS.pending).forEach((p) => p.rej(new Error('obs-off')));
      OBS.pending = {};
      if (e.code === 4009) OBS.setStatus('error', 'Mot de passe OBS incorrect.');
      else OBS.setStatus('error', OBS.status === 'ok' ? 'OBS a été fermé.' : 'OBS ne répond pas : est-il ouvert, avec le serveur WebSocket activé ?');
      if (OBS.auto && e.code !== 4009) OBS._retry = setTimeout(OBS.connect, 5000);
    };
  };

  OBS.handle = async function (m) {
    if (m.op === 0) { // Hello
      const id = { rpcVersion: 1 };
      if (m.d.authentication) {
        const secret = await sha256b64(OBS.password + m.d.authentication.salt);
        id.authentication = await sha256b64(secret + m.d.authentication.challenge);
      }
      OBS.ws.send(JSON.stringify({ op: 1, d: id }));
    } else if (m.op === 2) { // Identified
      OBS.auto = true; U.store.set('obs.auto', true);
      OBS.setStatus('ok', '');
      OBS.refresh();
    } else if (m.op === 7) { // RequestResponse
      const p = OBS.pending[m.d.requestId];
      if (!p) return;
      delete OBS.pending[m.d.requestId];
      if (m.d.requestStatus && m.d.requestStatus.result) p.res(m.d.responseData || {});
      else p.rej(new Error((m.d.requestStatus && m.d.requestStatus.comment) || 'Erreur OBS'));
    } else if (m.op === 5) { // Event
      const d = m.d.eventData || {};
      switch (m.d.eventType) {
        case 'CurrentProgramSceneChanged': OBS.current = d.sceneName; break;
        case 'RecordStateChanged': OBS.recording = !!d.outputActive; break;
        case 'StreamStateChanged': OBS.streaming = !!d.outputActive; break;
        case 'InputMuteStateChanged': OBS.muted[d.inputName] = !!d.inputMuted; break;
        case 'SceneListChanged': case 'InputCreated': case 'InputRemoved': case 'InputNameChanged': case 'SceneNameChanged': OBS.refresh(); break;
        default: return;
      }
      OBS.emit('state');
    }
  };

  OBS.request = function (type, data) {
    return new Promise((res, rej) => {
      if (!OBS.ws || OBS.status !== 'ok') { rej(new Error('obs-off')); return; }
      const id = 'r' + (++OBS.rid);
      OBS.pending[id] = { res, rej };
      OBS.ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data || {} } }));
      setTimeout(() => { if (OBS.pending[id]) { delete OBS.pending[id]; rej(new Error('OBS ne répond pas')); } }, 4000);
    });
  };

  OBS.refresh = async function () {
    try {
      const sl = await OBS.request('GetSceneList');
      OBS.scenes = (sl.scenes || []).map((s) => s.sceneName).reverse();
      OBS.current = sl.currentProgramSceneName || '';
      OBS.recording = !!(await OBS.request('GetRecordStatus')).outputActive;
      OBS.streaming = !!(await OBS.request('GetStreamStatus')).outputActive;
      const il = await OBS.request('GetInputList');
      OBS.inputs = (il.inputs || []).map((i) => i.inputName);
      for (const name of OBS.inputs) {
        try { OBS.muted[name] = !!(await OBS.request('GetInputMute', { inputName: name })).inputMuted; } catch (e) { /* source sans son */ }
      }
      OBS.emit('state');
    } catch (e) { console.warn('OBS', e); }
  };

  // Reconnexion automatique au démarrage si OBS était connecté la dernière fois
  if (OBS.auto) setTimeout(OBS.connect, 1500);
})(window.LP);
