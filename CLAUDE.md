# Launchpad Arcade : guide pour Claude Code

Jeux et instruments pour Launchpad Novation RGB, dans le navigateur (Web MIDI + Web Audio).
L'utilisateur parle français : réponds-lui en français, avec des explications simples.

## Matériel de l'utilisateur
- **Launchpad MK2** (badge « Launchpad MK2 connecté »), **Mac M1**, **Google Chrome**.
- Le MK2 n'a pas de pads sensibles à la vélocité. Il a une rangée de 8 boutons en haut (CC 104–111) et une colonne de 8 boutons à droite (notes 19, 29 … 89).

## Lancer / déboguer
- Ouvrir `index.html` dans Chrome, ou `python3 -m http.server 8000` puis http://localhost:8000.
- **Mode debug** : ajouter `?debug` à l'adresse (ex. `index.html?debug`), puis ouvrir la console de Chrome (Cmd+Option+J). Elle affiche les ports MIDI vus, le modèle choisi, chaque message reçu (avec l'événement décodé) et chaque message envoyé.
- Dans la console : `LP.core.current` (appli active), `LP.launchpad.model`, `LP.launchpad.stats`, `LP.launchpad.setRate('slow')`, `LP.core.launch('paint')`.
- L'appli **Peinture & test** affiche le dernier message MIDI reçu au-dessus du Launchpad virtuel.

## Tests
```bash
npm install
npx playwright install chromium
npm test
```
`tests/smoke.js` simule un Launchpad en Web MIDI (aucun matériel requis). Il vérifie la détection des 5 modèles, le mode Programmer, le lancement de chaque appli via les tuiles, la logique des jeux, le débit plafonné du MK2, l'auto-réparation des LED et l'affichage sur téléphone. **Lance les tests après chaque modification.**

## Architecture (sans compilation, scripts classiques)
Pas de modules ES ni de bundler : tout est attaché à `window.LP` pour fonctionner en `file://`. L'ordre des `<script>` dans `index.html` compte.

| Fichier | Rôle |
|---|---|
| `js/core/util.js` | `LP.U` : couleurs `[r,g,b]` 0–255, `hsv`, `store` (localStorage), `h()` (DOM), `emitter` (`on` renvoie une fonction de désinscription) |
| `js/core/font.js` | Police 5×7 défilante (`Scroller`) et chiffres 3×5 (`digits`) |
| `js/core/launchpad.js` | `LP.launchpad` : détection du modèle par nom de port, mode Programmer, décodage des entrées, envoi des LED par SysEx avec **débit plafonné** (profils `fast/normal/safe/slow`) et auto-réparation |
| `js/core/display.js` | `LP.FrameBuffer` (grille 8×8 + boutons `top/right/left/bottom/bottom2` + `logo`) et le Launchpad virtuel cliquable |
| `js/core/audio.js` | `LP.audio` : batterie synthétisée, synthé polyphonique (`noteOn/noteOff/play`, 8 presets), `sfx` |
| `js/core/transport.js` | `LP.music` (gammes, tonalité partagée), `LP.transport` (horloge des séquenceurs, motifs sauvegardés) |
| `js/core/audioin.js` | `LP.audioin` : sources audio partagées (sons de l'appli, onglet Chrome via `getDisplayMedia`, BlackHole/micro via `getUserMedia`, fichier) + analyse (8 bandes avec gain auto, battements/tempo, VU stéréo, forme d'onde). `AI.panel()` = panneau de choix de source |
| `js/core/bridges.js` | `LP.hammer` (pont HTTP local vers Hammerspoon, jeton secret, code Lua généré par `HS.lua()`), `LP.obs` (client OBS WebSocket v5 avec authentification SHA-256) |
| `js/core/store-db.js` | `LP.db` : stockage IndexedDB (sons du sampler) |
| `js/core/app.js` | `LP.apps.register`, `LP.core` (boucle ~60 Hz dans un Worker, routage des entrées, HUD, panneau), `LP.ui` (contrôles) |
| `js/main.js` | Démarrage, écran d'accueil, fenêtre Réglages |
| `js/apps/*.js` | Une appli par fichier |

### Contrat d'une appli
```js
LP.apps.register({
  id, name, cat: 'jeu' | 'musique' | 'outil', emoji, color: [r,g,b], short, desc,
  icon: [4 couleurs pour la tuile 2×2] ou (t) => [...],
  help: [['touche', 'action'], ...],
  buttons: { top: [...8 libellés], right: [...] },  // affichés sur le Launchpad virtuel
  start(api) {}, stop() {},
  update(dt, t) {},          // logique, à chaque tick
  render(fb, t) {},          // dessiner TOUT l'écran à chaque image (fb est vidé avant)
  onPad(x, y, vel, down) {}, // x,y : 0..7, y = 0 en HAUT ; vel 0..127
  onButton(side, i, down) {},// side 'top' | 'right' | ... ; i = 0 à gauche / en haut
  onKey(event, down) {},     // renvoyer true si la touche est utilisée
  panel(el, api) {},         // réglages dans le panneau de droite
  label(x, y) {}             // texte sur les pads du Launchpad virtuel
});
```
- Le bouton `top` n°7 (en haut à droite, ⌂) est réservé : retour à l'accueil.
- L'accueil a 3 onglets (`LP.CATS` : jeu / musique / outil), 16 tuiles maximum par onglet.
- Tâche qui doit tourner même quand l'appli n'est pas affichée : `LP.core.addBackground(fn)` (exemple : `LP.pomodoro`).
- **MK2 : peu de LED par seconde.** Conçois les animations avec des paliers (hauteurs entières, couleurs par niveaux) pour limiter les changements.
- `api` : `hud(champs, message)`, `text(str, couleur, {onDone})` (texte défilant qui bloque la grille), `best(clé, valeur, plusPetitMeilleur)`, `refresh()`, `vel(v)`, `toast(msg)`.
- **Ne jamais appeler une méthode `color`** dans une appli : elle écraserait la propriété `color` (la couleur de l'appli dans la liste). Ce bug a déjà eu lieu.

## Protocole MIDI (mode Programmer)
Les pads sont numérotés `10 × ligne + colonne`, avec la ligne 1 en bas (11 = bas-gauche, 88 = haut-droite). Couleurs en RGB par SysEx `F0 00 20 29 02 <dev> …`.

| Modèle | dev | Passage en Programmer | Commande LED | Valeurs | Haut | Droite |
|---|---|---|---|---|---|---|
| Pro MK3 | 0E | `0E 01` | `03` + `[03 led r g b]…` | 0–127 | CC 91–98 | CC 89…19 |
| X | 0C | `0E 01` | idem | 0–127 | CC 91–98 | CC 89…19 |
| Mini MK3 | 0D | `0E 01` | idem | 0–127 | CC 91–98 | CC 89…19 |
| Pro (2015) | 10 | `21 01` puis `2C 03` | `0B` + `[led r g b]…` | 0–63 | CC 91–98 | CC 89…19 |
| **MK2** | 18 | `22 00` (disposition Session) | `0B` + `[led r g b]…` | 0–63 | **CC 104–111** | **notes** 89…19 |

## Droits d'auteur
Le dépôt est **public** : n'y ajoute jamais de sons protégés (ex. voix de Daft Punk). Le sampler charge les sons de l'utilisateur dans IndexedDB ; le dossier `sons-prives/` est ignoré par Git pour ses fichiers privés.

## Historique des problèmes
- **Lumières figées sur le MK2 en changeant de jeu** : le MK2 saturait (~2 800 LED/s envoyées). Corrigé par le plafond d'envoi (profil « Prudent » automatique pour MK2 et Pro 2015), l'auto-réparation et un redessin complet à chaque changement d'appli. L'utilisateur a constaté que **débrancher / rebrancher le MK2 le débloque** (ça confirme la saturation de son tampon interne ; la reconnexion à chaud est gérée par `onstatechange` → `scan()`). Bouton « Reconnecter le Launchpad » dans Réglages (`LP.launchpad.reconnect()`). À surveiller : si ça se reproduit avec la v2, baisser le débit (`setRate('slow')`) et mesurer `LP.launchpad.stats`.
- **En cours : « Peinture & test » ne fonctionne pas sur le MK2** (symptôme exact à préciser avec l'utilisateur). Piste : lancer avec `?debug`, appuyer sur des pads et des boutons de droite, puis regarder ce que la console reçoit et envoie.
