/* Stockage de fichiers (sons du sampler…) dans IndexedDB : ils restent après fermeture de la page. */
(function (LP) {
  'use strict';
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('IndexedDB indisponible')); return; }
      const r = indexedDB.open('launchpad-arcade', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('files')) r.result.createObjectStore('files'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  function tx(mode, fn) {
    return open().then((db) => new Promise((res, rej) => {
      const t = db.transaction('files', mode);
      const st = t.objectStore('files');
      let out;
      const r = fn(st);
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    }));
  }
  LP.db = {
    get: (key) => tx('readonly', (st) => st.get(key)),
    set: (key, val) => tx('readwrite', (st) => st.put(val, key)),
    del: (key) => tx('readwrite', (st) => st.delete(key)),
    keys: () => tx('readonly', (st) => st.getAllKeys())
  };
})(window.LP);
