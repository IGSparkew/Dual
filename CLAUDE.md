# CLAUDE.md — Production Studio

> DAW visuel — surcouche graphique bidirectionnelle pour Strudel.
> Le code Strudel est la **source de vérité unique**.

---

## Principe fondamental

Chaque action visuelle = modification de code Strudel. Chaque modification de code = mise à jour visuelle.
L'UI ne stocke jamais d'état audio séparé. Tout passe par le code.

```
UI graphique → génère du code Strudel → Strudel évalue → Events/Haps → superdough joue le son
                                                              ↓
                                                     Panel Registry → UI se met à jour
```

---

## Stack technique

| Composant | Choix |
|---|---|
| Bundler | Vite 5 |
| Language | TypeScript 5 |
| UI | React 18 |
| State | Zustand |
| Code editor | CodeMirror 6 (`@uiw/react-codemirror`) |
| Rendu haute perf | Canvas 2D (piano roll, drum grid, automation, VU-mètres) |
| Audio | Strudel (`@strudel/core`, `@strudel/transpiler`, `@strudel/webaudio`, `@strudel/mini`) + superdough |
| Styles | CSS Modules |
| Desktop | Electron (app **Dual**) + electron-builder |
| Tests | Vitest |
| Licence | AGPL-3.0 |

---

## Commandes

```bash
npm run dev                 # Serveur de développement (Vite + Electron, port 3000)
npm run build               # tsc && vite build
npm run preview             # Preview du build
npm run dist                # Build + packaging electron-builder
npm test                    # vitest run (suite complète)
npm run make:module         # Scaffold d'un nouveau module
npm run vendor:samples      # Vendorise les dough-samples dans public/samples/
npm run vendor:soundfonts   # Vendorise les soundfonts GM
npm run package:remote-packs # Prépare les packs de samples distants (tier 2)
```

---

## Structure du projet

```
src/
├── core/                        # Noyau (aucune dépendance UI)
│   ├── types/                   # Types partagés (hap, clip, transport, fx, sound, sample-drag, desktop…)
│   ├── engine/                  # Moteur Strudel — interfaces à la racine, `impl/` à côté
│   │   ├── StrudelBridge.ts / impl/StrudelBridgeImpl.ts
│   │   ├── Scheduler.ts / impl/SchedulerImpl.ts
│   │   ├── HapExtractor.ts / impl/HapExtractorImpl.ts
│   │   ├── SampleLoader.ts / impl/SampleLoaderImpl.ts    # sound map, packs, preview, import user
│   │   ├── AudioExporter.ts / impl/AudioExporterImpl.ts  # export WAV
│   │   └── RenderPatternOffline.ts / impl/…
│   ├── interpreter/             # Synchro bidirectionnelle (interfaces + `impl/`)
│   │   ├── CodeRegion.ts        # parseur AST des régions de code (clips nommés)
│   │   ├── CodeToVisual.ts / VisualToCode.ts / AstManipulator.ts / SyncController.ts
│   ├── project/                 # ProjectManager (new/open/save), share link, pont menu natif
│   ├── state/                   # Zustand store unique (store.ts)
│   └── events/                  # Event bus pub/sub + types standardisés
│       ├── EventBus.ts / EventBusImpl.ts
│       └── event-types.ts
│
├── layout/                      # Panel System
│   ├── api/                     # PanelApi / PanelApiImpl, PanelCanvasApi / …Impl
│   ├── registry/                # PanelRegistry, LayoutRegistry, ExtensionSlots (+ Impl)
│   ├── components/              # LayoutManager, LayoutRenderer, PanelContainer, SplitPane, PanelIcon
│   └── loaders/                 # layout-loader.ts (charge /layouts/*.json)
│
└── ui/                          # Shell (App.tsx) + composants partagés
    └── shared/                  # Notifications, PromptDialog, SamplePacksMenu, BrowserDrawer…

modules/      # Modules graphiques (built-in + utilisateurs) — chargés dynamiquement
├── session/                 # Session View — grille de clips (+ cible des drops de samples)
├── editor/                  # Code Editor — CodeMirror + coloration Strudel
├── drum-grid/               # Drum Grid — step sequencer type FL Studio sur mini-notation s()
├── piano-roll/              # Piano Roll — notes + gammes (.scale())
├── arrangement/             # Arrangement — timeline des clips
├── mixer/                   # Mixer — faders, knobs, meters
├── effects/                 # FX Rack — ajoute des effets audio au son des clips (room, delay, lpf… cf. doc Strudel en ligne)
├── automation/              # Automation — courbes → patterns Strudel (stub)
├── browser/                 # Sample Browser — sons enregistrés, preview, import user, drag vers la session
├── transport/               # Transport — play/pause/stop/BPM
├── shared/                  # Helpers partagés entre modules (loop-length, mini-notation)
└── [user-modules]/          # Modules créés par les utilisateurs (même API, même structure)

config/       # app.json, keybindings.json, default-layout.json
layouts/      # Layouts core (bundlés au build + seed de userdata/layouts)
public/samples/ # Samples core vendorés (dough-samples) — Vite en dev, extraResources en prod
electron/     # Process main Electron : paths, userdata, protocole dual://, ipc, preload
userdata/     # Données utilisateur (layouts, samples, modules, projects, themes, presets)
              # créé/seedé au lancement à côté de l'exécutable — gitignoré
```

---

## Conventions de code

### Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Composants React | `PascalCase.tsx` | `SplitPane.tsx` |
| Rendu principal d'un module | `<Pascal>Module.tsx` | `SessionModule.tsx`, `PianoRollModule.tsx` |
| Logique d'un module (pure) | `<id>.ts` (kebab) | `session.ts`, `piano-roll.ts` |
| Interfaces | `PascalCase.ts` | `Scheduler.ts` |
| Implémentations | `PascalCaseImpl.ts` | `SchedulerImpl.ts` |
| Modules TS purs | `kebab-case.ts` | `event-types.ts`, `piano-roll-renderer.ts` |
| Types **partagés** | Fichiers dédiés dans `src/core/types/` | `hap.ts`, `clip.ts` |
| Styles | CSS Modules | `Component.module.css` |
| Canvas | Rendu dans `*-renderer.ts`, interactions dans `*-interaction.ts` | `piano-roll-renderer.ts`, `note-interaction.ts` |

> ⚠️ Le fichier de rendu d'un module se suffixe `Module` (jamais `Panel`), et son
> fichier de logique porte simplement l'id du module (`session.ts`, pas
> `session-model.ts` ni `SessionModuleApi.ts`). Voir **Module System →
> Organisation d'un module**.

### Imports

Toujours utiliser les alias Vite :

```ts
import { useStore } from '@core/state/store';
import { eventBus } from '@core/events/EventBusImpl';
import type { PanelApi } from '@layout/api/PanelApi';
import { DrumGridModule } from '@modules/drum-grid/DrumGridModule';
import { Notifications } from '@ui/shared/Notifications';
```

Alias disponibles : `@core` → `src/core`, `@layout` → `src/layout`, `@ui` → `src/ui`, `@modules` → `modules`.

### Langue

- **Commentaires et documentation dans le code** : anglais
- **Documentation projet** (docs/, README) : anglais

---

## Pattern Interface / Impl

Les services techniques sont découpés en **interface** (contrat) + **implémentation** suffixée `Impl`. Cela découple les consommateurs de la logique concrète et facilite les tests.

```ts
// Scheduler.ts — Interface (contrat)
export interface Scheduler {
  play(): void;
  pause(): void;
  stop(): void;
  setBpm(bpm: number): void;
  getState(): TransportState;
}

// SchedulerImpl.ts — Implementation
export class SchedulerImpl implements Scheduler {
  play() { /* ... */ }
  // ...
}

// Export singleton
export const scheduler: Scheduler = new SchedulerImpl();
```

**Services concernés :**
- **Engine** : `StrudelBridge`, `Scheduler`, `HapExtractor`, `SampleLoader`
- **Interpreter** : `CodeToVisual`, `VisualToCode`, `AstManipulator`, `SyncController`
- **Layout** : `PanelRegistry`, `PanelApi`, `PanelCanvasApi`, `ExtensionSlots`
- **Events** : `EventBus`

Les composants React (panneaux, UI partagée) n'utilisent **pas** ce pattern — ce sont des `.tsx` classiques.

---

## Module System

### Chaque module a un manifest + s'enregistre dans le registry

```json
{
  "id": "piano-roll",
  "name": "Piano Roll",
  "version": "1.0.0",
  "icon": "piano",
  "description": "MIDI note editor from Strudel haps",
  "defaultSlot": "center-top",
  "minSize": { "width": 400, "height": 200 },
  "capabilities": ["haps:read", "code:write", "state:read"]
}
```

```ts
// modules/piano-roll/index.ts
import { panelRegistry } from '@layout/registry/PanelRegistryImpl';
import manifest from './manifest.json';
import { PianoRollModule } from './PianoRollModule';

panelRegistry.register({ ...manifest, component: PianoRollModule });
```

### Organisation d'un module

> Principe : **la logique est pure et sans état ; React et le store sont les
> seuls points de contact avec le monde extérieur.** Zustand tient l'état, le
> module est sans état (un sac de fonctions pures `(api, code) → résultat`).

```
modules/session/
├── manifest.json            # { id, name, defaultSlot, capabilities }
├── index.ts                 # enregistrement uniquement (colle minuscule)
├── SessionModule.tsx        # rendu principal — seul point de contact store/React
├── SessionModule.module.css
├── session.ts               # ★ logique pure + types dérivés colocalisés
├── models/                  # modèles PERSISTANTS du module (sidecar .json) — si besoin
└── components/              # sous-composants du rendu (+ leurs props colocalisées)
```

| Fichier | Responsabilité | Nature |
|---|---|---|
| `index.ts` | importer + `panelRegistry.register({...})` — rien d'autre | colle |
| `<Module>.tsx` | rendu, orchestration, branchement au store | React |
| `<id>.ts` | dérivation (code→modèle) + mutation (action→code) | **pur** |
| `models/*.ts` | entités persistantes (survivent à un recalcul, vont au `.json`) | types |
| `components/*.tsx` | sous-composants + leurs props | React |

**Où va chaque type** (critères disjoints) :
- **partagé** entre modules / avec le cœur → `src/core/types/`
- **persistant** propre au module → `models/`
- **vue dérivée** produite par une fonction → colocalisée dans `<id>.ts` (ou la
  props colocalisée dans le `.tsx` qui la consomme)

> ⚠️ **Jamais de dossier `types/` dans un module.** Une vue dérivée reste à côté
> de sa fonction ; les props restent dans leur composant ; le persistant va dans
> `models/`. Le code Strudel est la source de vérité : la plupart des « modèles »
> sont en réalité une *dérivation du code*, pas un état persistant.

> Écriture **toujours** via `api.code.write` / `modifyCode` (jamais de
> `setActiveCode` à la main) ; aucun `slice`/`split`/`regex` sur le texte du
> document dans la logique → passer par les verbes de `api.code.*`.

### Règle clé

Les modules built-in s'enregistrent **exactement** comme les modules utilisateurs. Même API, même cycle de vie, même manifest. Tout ce qu'un module interne peut faire, un module utilisateur peut le faire aussi.

> Un module enregistré n'est pas forcément un panneau de layout : le Sample
> Browser est monté dans un tiroir latéral ouvert depuis le header
> (`src/ui/shared/BrowserDrawer.tsx`) — même manifest, même `PanelApi`, seul
> l'hôte diffère. Une fois ouvert il reste monté (sinon filtre et banques
> dépliées sautent).

### Module API (SDK injecté dans chaque module)

```ts
panelAPI.subscribeToHaps(callback)       // Receive haps on each evaluation
panelAPI.getCode()                        // Get current Strudel code
panelAPI.modifyCode(transformFn)          // Modify code via AST
panelAPI.getState(selector)               // Read from Zustand store
panelAPI.dispatch(action)                 // Dispatch to store
panelAPI.emit(eventType, payload)         // Emit inter-panel event
panelAPI.on(eventType, handler)           // Listen to inter-panel events
panelAPI.showNotification(message, type)  // UI notification
panelAPI.canvas.surface(el)               // DPR-fit backing store + 2D context prêt
panelAPI.canvas.loop(draw)                // Boucle rAF unique avec delta-temps
panelAPI.canvas.createSet(onRelease)      // Collection de canvas par clé (listes)

// Sons (sound map superdough)
panelAPI.getSounds()                      // Noms enregistrés, triés
panelAPI.subscribeToSounds(callback)      // Rejoué à la souscription + à chaque pack chargé
panelAPI.getSoundInfos()                  // Noms + forme (sample/synth/soundfont, drum/pitched, variants)
panelAPI.previewSound(name, note?)        // Audition hors transport, n'écrit rien
panelAPI.canImportSamples()               // false hors Electron — conditionne l'UI d'import
panelAPI.importSamples(request)           // Écrit userdata/samples/<name>/ + enregistre sans redémarrer
```

### Extension Slots

Points d'injection dans les modules existants. Modules built-in et utilisateurs injectent dans les mêmes slots :

`toolbar:left`, `toolbar:right`, `context-menu:clip`, `context-menu:note`, `channel-strip:top`, `channel-strip:bottom`, `fx-rack:slot`, `browser:actions`, `status-bar`

---

## Événements inter-modules

| Événement | Payload | Émetteur |
|---|---|---|
| `haps:updated` | `{ haps, source }` | Engine |
| `code:changed` | `{ code, origin }` | Code Editor |
| `clip:selected` | `{ clipId, patternCode }` | Session View |
| `note:created` | `{ note, begin, end }` | Piano Roll / Drum Grid modules |
| `note:deleted` | `{ note, begin, end }` | Piano Roll / Drum Grid modules |
| `transport:state` | `{ playing, bpm, position }` | Transport |
| `mixer:changed` | `{ clipId, param, value }` | Mixer |
| `fx:changed` | `{ clipId, fxChain }` | FX Rack |
| `layout:changed` | `{ layout }` | Layout Manager |
| `sample:dropped` | `{ samplePath, targetClipId }` | Session (après un drop venu du Browser) |

### Drag & drop de samples

Un son traîné hors du Browser ne passe **pas** par l'event bus mais par le
`DataTransfer`, sous un type MIME privé (`application/x-dual-sample`). Le contrat
partagé est `@core/types/sample-drag` (`writeSampleDrag` / `readSampleDrag` /
`hasSampleDrag`).

> Règle : **le module qui reçoit le drop écrit le code**, jamais le Browser — la
> convention de clip appartient à la cible (la session écrit ses consts
> gate/gain dans `session.ts`). Les deux modules ne s'importent pas l'un l'autre,
> leur seul contrat est le payload.

---

## Synchro bidirectionnelle

### Code → Visuel

Le code est évalué via `@strudel/transpiler`. Les patterns retournent des **haps** via `queryArc()`. L'UI les interprète :

| Propriété du hap | Rendu visuel |
|---|---|
| `value` (note) | Position verticale piano roll |
| `whole.begin/end` | Position et largeur du clip |
| `.gain()` | Fader du mixer |
| `.room()`, `.delay()` | Indicateurs FX |
| `.s()` (sample) | Icône/nom dans le clip |
| `.pan()` | Knob panoramique |

### Visuel → Code

| Action visuelle | Code Strudel généré |
|---|---|
| Dessiner une note | `note("c3 e3 g3")` |
| Tourner le knob volume | `.gain(x)` |
| Activer reverb | `.room(0.5)` |
| Grouper clips | `stack(clip1, clip2)` |
| Dessiner automation | `.gain(sine.range(0.2, 0.8).slow(4))` |
| Mute | `.gain(0)` ou commentaire `//` |

### Anti-boucle

`SyncController` utilise un flag de source (`user_edit` vs `ui_action`) + debounce pour éviter les cycles infinis code → UI → code → ...

---

## Packages Strudel

| Package | Rôle |
|---|---|
| `@strudel/core` | Pattern, queryArc, events/haps |
| `@strudel/transpiler` | Transpilation du code utilisateur |
| `@strudel/webaudio` | Binding superdough, webaudioOutput |
| `@strudel/mini` | Mini-notation (`"bd sd [hh hh] cp"`) |
| `superdough` | Moteur audio (synth, sampler, effets) |

---

## Roadmap (7 phases, ~32 semaines)

> État au 2026-07-27, branche `dev`, app **Dual** v0.7.0.

1. ✅ **Phase 1 (sem. 1–5)** — Fondations : intégration Strudel, Panel System, Code Editor (`modules/editor`), `CodeRegion` (parseur AST), Session View (`modules/session`), Transport (`modules/transport`)
2. ✅ **Phase 2 (sem. 6–10)** — Visualisation : Piano Roll (`modules/piano-roll`), interactions souris, gammes (`@strudel/tonal`), synchro bidirectionnelle (`SyncController`), Drum Grid (`modules/drum-grid`) — inclut en bonus **Mesures/loop length** (`.slow(n)`, non prévu au plan initial)
3. ✅ **Phase 3 (sem. 11–14)** — Mixer & Groupes : mixer visuel (`modules/mixer`, faders/pan/solo/mute/VU-mètres), modèle `stack()` de clips nommés (voir [[named-clips-model]]), **Arrangement** timeline (`modules/arrangement`, non prévu au plan initial) — rack d'effets livré en avance (voir Phase 4)
4. 🚧 **Phase 4 (sem. 15–18)** — Effets & Presets : FX Rack livré (`modules/effects`, catalogue 13 unités, chaînes, duck sidechain par orbit) ; **presets JSON** et **enveloppes** restent à faire
5. ⬜ **Phase 5 (sem. 19–22)** — Automations : `modules/automation` n'est encore qu'un stub (`.gitkeep`) — éditeur d'automation, automation clip/globale, dessin libre → pattern à faire
6. 🚧 **Phase 6 (sem. 23–27)** — Samples & Projet : gestion de projet livrée (new/open/save, menu natif, export WAV, share link, voir [[project-management-export]]) ; **Sample Browser v1 livré** (`modules/browser` — 3 onglets samples/userdata/soundfonts, preview, import `user_`, drag vers la session, voir [[sample-browser]]) ; restent le **chopper** et la gestion (suppression/renommage) des packs importés
7. 🚧 **Phase 7 (sem. 28–32)** — Modules utilisateurs : socle Electron « Dual » livré (chemins, `userdata/`, protocole `dual://`, `extraResources`, voir [[electron-desktop]]) ; loader dynamique de modules user, sandbox et SDK docs restent à faire

**Hors roadmap initiale, livré en parallèle** : desktop Electron (app **Dual**), infra de tests vitest (voir [[sound-map-banks]] pour le gotcha Node 25), packs de samples distants (tier 2 : `vcsl-*`, `tidal-drum-machines`), intégration Git dans l'app (voir [[git-topology-fix]]).

**Priorités** : `CRITIQUE` (bloquant) > `HAUTE` (core) > `MOYENNE` (non bloquant) > `BASSE` (futur)

**Prochaines étapes probables** : Automations (Phase 5) — seul module encore à l'état de stub ; sinon sample chopper / gestion des packs pour clore la Phase 6, ou presets/enveloppes pour la Phase 4.

---

## Risques identifiés

- **AGPL-3.0** — code source obligatoirement distribué
- **Génération de code depuis l'UI** — manipuler l'AST (acorn) plutôt que du texte brut
- **Boucles infinies synchro** — flag de source dans SyncController
- **Limitations Strudel pour un DAW** — solo, mute, routing nécessitent des workarounds
- **Documentation superdough limitée** — lire le code source, contribuer upstream
- **Performances queryArc** — cache des haps, requêtes incrémentales sur gros projets

## Délégation
- Toute manipulation de l'API Strudel (imports, evalScope, types) → strudel-specialist en premier, developer ensuite.
- Nouvelle feature → developer → tester → reviewer.