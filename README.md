# 🎮 Launchpad Arcade

Jeux et instruments de musique pour **Launchpad Novation RGB**, directement dans le navigateur (Web MIDI).
Aucune installation : une page web, Google Chrome, et ton Launchpad en USB.

Tout marche aussi **sans Launchpad**, à la souris (ou au doigt sur tablette), grâce au Launchpad virtuel affiché à l'écran.

## ✅ Compatibilité

| Launchpad | Détection | Remarques |
|---|---|---|
| Launchpad Pro MK3 | auto | boutons sur les 4 côtés, pads sensibles à la vélocité |
| Launchpad X | auto | pads sensibles à la vélocité |
| Launchpad Mini MK3 | auto | |
| Launchpad Pro (2015) | auto | |
| Launchpad MK2 | auto | |

- **Navigateur : Google Chrome** (ou Edge, Brave, Opera). ⚠️ **Safari ne gère pas le Web MIDI.**
- **Mac M1/M2/M3** : aucun pilote à installer, le Launchpad est reconnu directement par macOS.
- Si ton modèle n'est pas détecté, choisis-le à la main dans **Réglages**.

## 🚀 Démarrer sur ton Mac

### Option A : en ligne avec GitHub Pages (recommandé, une seule fois)
1. Sur GitHub : **Settings → Pages**.
2. *Source* : **Deploy from a branch**. Choisis la branche qui contient le code (`main` si tu l'as fusionnée, sinon `claude/gifted-wozniak-5bezx0`), le dossier `/ (root)`, puis **Save**.
3. Après environ 1 minute, le jeu est disponible à l'adresse **https://samuelhermann.github.io/launchpad/**. Ouvre-la dans Chrome.

### Option B : en local
1. Télécharge le projet (**Code → Download ZIP** sur GitHub) et décompresse-le.
2. Ouvre `index.html` **avec Chrome** (clic droit → *Ouvrir avec* → Google Chrome).

Si Chrome refuse l'accès MIDI depuis un fichier local, lance un petit serveur dans le dossier du projet :
```bash
python3 -m http.server 8000
```
puis ouvre http://localhost:8000 dans Chrome.

### Ensuite
1. Branche le Launchpad en USB.
2. Clique sur **▶ Démarrer**.
3. Chrome demande « contrôler et reprogrammer tes appareils MIDI » : clique sur **Autoriser**. C'est nécessaire pour allumer les LED en couleur.
4. Le Launchpad passe en mode *Programmer* et affiche le menu. À la fermeture de la page, il revient en mode normal.

## 🕹️ Commandes générales

- **Accueil** : chaque appli est une tuile 2×2 sur la grille. Appuie dessus pour la lancer.
- **Bouton ⌂** (en haut à droite du Launchpad) ou **Échap** : revenir à l'accueil.
- **Sur l'accueil, colonne de droite** : luminosité des LED.
- Les boutons du haut et de droite sont expliqués à l'écran, dans chaque appli : leur nom est écrit sur le Launchpad virtuel.

## 🎲 Jeux

| Jeu | Principe |
|---|---|
| 🐍 **Snake** | Mange les pommes et grandis. Dirige avec les 4 premiers boutons du haut (↑ ↓ ← →), en touchant un pad (le serpent tourne vers lui) ou avec les flèches du clavier. Il y a 3 vitesses, et un mode murs ou passe-muraille. |
| 🧠 **Mémoire : séquence** | Répète la suite de couleurs et de sons, qui s'allonge à chaque tour. 3 niveaux : 4 zones, 16 zones ou 64 pads. |
| 🃏 **Mémoire : paires** | Retrouve les paires cachées (4×4, 6×4 ou 6×6). En mode **Sons**, il faut les retrouver à l'oreille ! |
| 🔨 **Tape-taupe** | Tape les pads verts (+1), dorés (+5) et évite les bombes rouges. Deux modes : Chrono 45 s ou Survie (3 vies). |
| 🔴 **Puissance 4** | Aligne 4 jetons. Se joue à 2 sur le même Launchpad ou contre l'ordinateur (3 niveaux). |
| 🧱 **Casse-briques** | Touche un pad : la raquette se place dessous. Le jeu compte 5 niveaux, et certaines briques demandent 2 coups. |
| 💡 **Éteins-tout** | Chaque pad inverse lui-même et ses 4 voisins : il faut tout éteindre. Un bouton donne un indice (calculé par un vrai solveur). |

Les records sont sauvegardés dans le navigateur.

## 🎵 Musique

| Appli | Principe |
|---|---|
| 🥁 **Boîte à rythmes** | 8 instruments × 16 pas (2 pages). Tempo, swing et 7 rythmes tout prêts (Rock, House, Hip-hop, Funk, Reggaeton…). Un instrument se coupe depuis la colonne de droite. |
| 🎹 **Clavier / synthé** | La grille devient un clavier, dans la gamme de ton choix (impossible de jouer faux). 8 sons, un mode accords, et la vélocité sur X et Pro. |
| 🎼 **Séquenceur mélodique** | Dessine une mélodie et une ligne de basse qui tournent en boucle, calées sur la boîte à rythmes. |
| ✨ **Light show** | 8 animations (spectre, ondes, pluie, plasma, feux d'artifice, étoiles, texte défilant) qui réagissent aux sons de l'appli, au micro ou à un fichier MP3. |
| 🎨 **Peinture & test** | Dessine sur la grille. Affiche aussi chaque message MIDI reçu, pratique pour tester les pads. |

💡 **Astuce** : la boîte à rythmes et le séquenceur continuent de jouer quand tu changes d'appli. Lance un rythme, puis improvise au clavier, ou ouvre le light show !

## 🛠️ Dépannage

- **« Aucun Launchpad détecté »** : vérifie le câble USB (certains câbles ne font que charger). Ferme aussi **Ableton Live** et **Novation Components**, qui peuvent occuper le Launchpad. Il est détecté automatiquement dès qu'il est branché.
- **Les LED ne s'allument pas** : l'autorisation MIDI a peut-être été refusée. Clique sur le cadenas à gauche de l'adresse, puis **Paramètres du site → Appareils MIDI → Autoriser**, et recharge la page.
- **Mauvais modèle ou boutons décalés** : **Réglages** → choisis la sortie, l'entrée et le modèle à la main.
- **Pas de son** : clique une fois dans la page (Chrome bloque le son tant qu'on n'a pas interagi avec la page) et vérifie le volume 🔊 en haut.
- **Firmware** : en cas de souci, mets ton Launchpad à jour avec [Novation Components](https://components.novationmusic.com/).

## 👩‍💻 Technique

- HTML, CSS et JavaScript, sans dépendance ni étape de compilation.
- `js/core/launchpad.js` : détection des modèles, mode Programmer, envoi des LED en RGB par SysEx (seules les LED modifiées sont envoyées).
- `js/core/audio.js` : batterie et synthé générés en Web Audio (aucun fichier son).
- `js/core/transport.js` : horloge commune aux séquenceurs (programmation précise sur l'horloge audio).
- `js/apps/*.js` : une appli par fichier. Pour en ajouter une, appelle `LP.apps.register({...})` et ajoute la balise `<script>` dans `index.html`.
- Test automatique avec un Launchpad simulé : `node tests/smoke.js` (nécessite Playwright).
