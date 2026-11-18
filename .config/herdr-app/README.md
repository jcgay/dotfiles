# Herdr — antisèche

Mémo perso pour se servir de l'app Herdr au quotidien, calé sur **cette** config : le layout `jc`, les raccourcis de `keys.json` et nos mods. La doc complète, réécrite par Herdr à chaque démarrage, est dans `AGENTS.md` (et `herdr-app --skill`).

---

## 1. Le modèle

| Mot | C'est quoi |
|---|---|
| **Space** | Un lieu de travail, en général un dépôt ou un worktree. Il porte le nom de son dossier tant qu'on ne le renomme pas. |
| **Tab** | Une tâche dans un space : ses terminaux et leurs découpes. Fermer le dernier tab ferme le space. |
| **Pane** | Un terminal à l'écran, ou un mod posé à côté. |
| **Agent** | Un terminal dont le programme publie un état (Claude) : `working`, `blocked` (il t'attend), `done` (fini pendant que tu regardais ailleurs), `idle`. |

Les terminaux tournent dans **herdr-core** (`hc`), pas dans la fenêtre : fermer ou mettre à jour l'app ne tue rien. Les tabs, splits et terminaux se retrouvent au redémarrage.

---

## 2. L'écran (layout `jc`)

```
┌─────────────┬───────────────────────────────────────────┬───────────┐
│ Spaces      │ tabs ……………………………  +  [Files][Changes][PR] │           │
│             ├───────────────────────────────────────────┤  panneau  │
│             │                                           │  latéral  │
│─────────────│          tab courant (ses panes)          │ (Files /  │
│ Agents      │                                           │ Changes / │
│             │                                           │   PR)     │
├─────────────┴───────────────────────────────────────────┴───────────┤
│ machine · branche · N agents · N needs you      :8080 ●   ⌘⇧P cmds  │
└─────────────────────────────────────────────────────────────────────┘
```

- **Sidebar** (`⌘B` pour la replier) : les spaces (`spaces-jc`, avec l'icône JetBrains du dépôt quand il en a une), puis les agents de tous les spaces. Glisser un space le réordonne.
- **Barre d'onglets** (`tabs-jc`) : double-clic sur un tab pour le renommer, glisser pour le déplacer, `+` ouvre le menu « nouveau » (terminal, agent, space).
- **Panneau latéral** : les trois boutons à droite des tabs l'ouvrent sur Files, Changes ou Pull request ; recliquer le referme. Il est mémorisé **par space**.
- **Barre d'état** (`status-jc`) : machine, branche, nombre d'agents et combien t'attendent, puis les **ports** ouverts par les programmes du space (point vert = répond, clignotant = démarre ; clic = ouvre `http://localhost:<port>/`). Le raccourci de droite ouvre la palette. Le nombre d'agents qui t'attendent s'affiche aussi en pastille sur l'icône du Dock.

---

## 3. Raccourcis

### Les indispensables

| Touche | Action |
|---|---|
| `⌘⇧P` | Palette de commandes (tout ce que Herdr sait faire) |
| `⌘P` | Picker : aller à un tab, un space ou un agent (ceux qui t'attendent en premier ; `⌃D` ferme le tab sélectionné) |
| `⌘⇧J` | **start-work** : démarrer un ticket Jira / une issue, ou reprendre une PR, dans un worktree avec Claude (§4) |
| `⌘/` | Aide de Herdr |
| `⌘,` | Réglages (thème, machines, alertes) |

### Spaces, tabs, agents

| Touche | Action |
|---|---|
| `⌘N` | Nouveau space |
| `⌘T` / `⌘W` | Nouveau tab / fermer le tab |
| `⌘1` … `⌘9` | Aller au tab n |
| `⌃1` … `⌃9` | Aller au space n |
| `⌃Tab` / `⌃⇧Tab` (ou `⌘⇧]` / `⌘⇧[`) | Tab suivant / précédent |
| `⌘⌥]` / `⌘⌥[` | Space suivant / précédent |
| `⌘]` / `⌘[` | **Agent suivant / précédent** (dans l'ordre de la liste Agents) |
| `F2` / `⇧F2` | Renommer le tab / le space |

### Panes

| Touche | Action |
|---|---|
| `⌘D` / `⌘⇧D` | Split à droite / en bas |
| `⌘⇧W` | Fermer le pane (tue son terminal) |
| `⌘⇧Entrée` | Zoomer / dézoomer le pane |
| `⌘⌥←↑→↓` | Aller au pane voisin |
| `⌘⌥⇧←↑→↓` | Échanger avec le pane voisin |

### Dans un terminal

| Touche | Action |
|---|---|
| `⌘F` | Chercher dans l'écran et l'historique (Entrée / ⇧Entrée pour naviguer, Échap pour fermer) |
| `⌘C` / `⌘V` | Copier / coller (des fichiers copiés depuis le Finder sont collés comme un glisser-déposer) |
| `⌃V` | Coller une **image** (capture d'écran pour Claude) |
| `⌘A` | Tout sélectionner, historique compris |
| `⌥←` / `⌥→` | Mot précédent / suivant |
| `⌘←` / `⌘→` | Début / fin de ligne |
| `⌥⌫` / `⌘⌫` | Effacer le mot / la ligne avant le curseur |

### Fenêtre

| Touche | Action |
|---|---|
| `⌘B` | Replier / déplier la sidebar |
| `⌘⇧L` | Changer de layout |
| `⌘=` / `⌘-` / `⌘0` | Zoom + / − / normal |
| `⌘M` | Réduire la fenêtre |
| `⌘H` / `⌘⌥H` / `⌘Q` | Masquer / masquer les autres / quitter |

### À la souris

- **Maintenir ⇧** pour sélectionner du texte quand le programme capture la souris (vim, Claude) ; **⇧ clic droit** ouvre toujours le menu de Herdr.
- **⌘ clic** sur une adresse de terminal (`t3`, `vps/t7`) dans le texte : l'ouvre en aperçu (« peek »), avec « garder comme tab » ou fermer.
- Glisser une sélection au-delà du bord fait défiler.

---

## 4. Nos mods

Chaque mod a son README avec le détail et les arbres de décision : [`start-work`](mods/start-work/README.md), [`pr`](mods/pr/README.md), [`status-jc`](mods/status-jc/README.md) (dont la surveillance des PR), [`spaces-jc`](mods/spaces-jc/README.md), [`tabs-jc`](mods/tabs-jc/README.md). La structure du layout `jc` est dans [`layouts/README.md`](layouts/README.md).

### start-work (`⌘⇧J`)

Depuis un terminal dans un dépôt :

1. Le champ vide liste **mes** tickets Jira et issues GitHub ouverts. Taper filtre ; `MERLIN-2321`, `#123` ou l'URL GitHub collée va droit au ticket ou à la PR ; un texte libre propose aussi « Sans ticket ».
2. `↑` `↓` pour choisir, choisir la **base** (master ou un `sprint-*` récent), ajuster la branche si besoin.
3. **Créer** : m'assigne le ticket Jira et le passe En cours (case à décocher), crée le worktree avec worktrunk, ouvre un space avec Claude et y tape `/superpowers:brainstorming <ticket>` sans l'envoyer.
4. Si le ticket a déjà une branche ou une PR ouverte, le bouton devient **Reprendre** : il ouvre le worktree existant (ou montre le space déjà ouvert dessus).
5. Une PR (`#5471`) se reprend toujours sur sa propre branche, sans prompt. Une PR venant d'un fork ne marche pas (sa branche n'est pas sur `origin`).

Les projets Jira du dépôt sont devinés depuis les sujets de commit ; sinon les nommer dans `mods/start-work/config.json` : `{"jira": {"arthur": ["MERLIN"]}}`.

### Panneau PR

Bouton « Pull request » dans la barre d'onglets : la PR de la branche du space, puis un tableau Build (Jenkins), Déployée (URLs des conteneurs) et Checks (résumé, dépliable d'un clic, sans le check Jenkins). **Merger quand tout est vert** arme un « rebase and merge » : `status-jc` fusionne la PR dans la minute où tous ses checks passent au vert, même panneau fermé ; un nouveau commit ou un `fixup!`/`amend!`/`squash!` désarme, ✕ sur la ligne Merge aussi. Son interrupteur **Surveillance** suit mes PR ouvertes toutes les 5 minutes (depuis `status-jc`, même panneau fermé) et lance un agent Claude visible quand le build Jenkins casse, quand Sonar remonte des problèmes, ou pour `pr-risk`, `pr-review --fix` puis `pr-demo --narrate` (narration en français) quand tout est vert ; l'onglet `pr-risk` (et son space s'il est seul) se ferme une fois son commentaire posté. Les PR surveillées sont triées par urgence (à toi, erreur, pas de clone local, agent en cours, en attente, brouillon, ok), avec leur titre et une ligne qui dit pourquoi elles ont leur état (CI en cours, agent lancé, karadoc pris…). Une PR sans aucun check attend sa CI si le clone local a un `Jenkinsfile` ou un `.github/workflows/`, sinon elle passe tout de suite à la review. Aucun agent ne part non plus quand la branche de la PR est checkout dans le clone ou un de ses worktrees avec du travail pas encore poussé : la PR passe « à toi » et reprend une fois tout poussé. Le bouton ⏸ d'une ligne met cette PR en pause : plus aucun agent ni toast pour elle, un agent déjà lancé finit ; ▶ la reprend. Détails : `docs/2026-11-14-pr-watch-design.md`.

### spaces-jc, status-jc et tabs-jc

Clones des mods `spaces`, `workspace-status` et `tabs` de Herdr : l'icône JetBrains du dépôt comme avatar de space, les ports cliquables dans la barre d'état, le bouton PR dans la barre d'onglets (le panneau mémorisé par space vient du mod d'origine).

L'avatar d'un space prend le `.idea/icon.svg` (sinon `icon.png`) du checkout principal, ou `icon_dark.svg` sur un thème sombre ; sans icône, la lettre colorée reste. Une icône ajoutée ou changée s'affiche en une à deux minutes.

---

## 5. En ligne de commande

```sh
herdr-app ls                 # spaces, tabs, terminaux (sous-agents sous leur parent)
herdr-app status             # ce qui est à l'écran, erreurs des fichiers et des mods
herdr-app commands           # toutes les commandes et leurs arguments
herdr-app do tab.new --name "fix login" --argv '["claude"]' --task "regarde le bug de login"

hc ls                        # tous les terminaux de herdr-core
hc read t3 --lines 50        # lire l'écran d'un terminal
hc send t3 "texte"           # lui écrire
hc wait t3                   # attendre qu'un agent ait fini
```

---

## 6. Personnaliser sans casser

- **Raccourcis** : `keys.json`. Une fois édité, Herdr ne le met plus à jour : `herdr-upstream` (lancé par `dot`) y fusionne ses nouveaux raccourcis par défaut, lus dans le binaire, avec `keys.default.json` comme base. Committer les deux ensemble. Éviter les `⌃lettre` que le shell utilise (`⌃C`, `⌃R`, `⌃W`…).
- **Layout ou mod livré par Herdr** : ne jamais l'éditer (écrasé au démarrage). Le cloner (`layout.clone`, `mod.clone`) et committer l'original avec le clone ; `dot` reporte ensuite les mises à jour de Herdr dans nos clones (voir `~/.config/CLAUDE.md`).
- **Vérifier un mod** : `herdr-app check ~/.config/herdr-app/mods/<nom>`, et les tests : `node --test ~/.config/herdr-app/mods/*/*.test.mjs`.
- Ne pas committer `gpui-kit.d.ts` ni `jsconfig.json` que Herdr écrit dans chaque mod.
