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
│ Spaces      │ tabs …  +  [Files][Changes][PR][Surv][Jal]│           │
│             ├───────────────────────────────────────────┤  panneau  │
│             │                                           │  latéral  │
│─────────────│          tab courant (ses panes)          │ (Files /  │
│ Agents      │                                           │ Changes / │
│             │                                           │ PR / Surv │
│             │                                           │ / Jal)    │
├─────────────┴───────────────────────────────────────────┴───────────┤
│ branche · N agents · N t'attendent · N PR à toi :8080 ⌘⇧P commandes │
└─────────────────────────────────────────────────────────────────────┘
```

- **Sidebar** (`⌘B` pour la replier) : les spaces (`spaces-jc`, avec l'icône JetBrains du dépôt quand il en a une ; le bouton dossier de son en-tête ouvre `projects`), puis les agents de tous les spaces. Glisser un space le réordonne.
- **Barre d'onglets** (`tabs-jc`) : double-clic sur un tab pour le renommer, glisser pour le déplacer, `+` ouvre le menu « nouveau » (terminal, agent, space).
- **Panneau latéral** : les boutons à droite des tabs l'ouvrent sur Files, Changes, Pull request, Surveillance des PR, CI des branches longues ou Journal ; recliquer le referme. Il est mémorisé **par space**.
- **Barre d'état** (`status-jc`) : la machine pour un space distant, la branche, le nombre d'agents et combien t'attendent, « N PR à toi » (en violet, comme « à toi » dans le panneau PR ; clic = ouvre la surveillance) quand la surveillance a abandonné une PR ou qu'un merge armé d'une PR surveillée a été refusé, l'**usage Claude** (`Claude 5 h N % jusqu'à HH:MM · semaine N %`, écrit par la status line de Claude Code dans `~/.cache/claude-usage.json`), puis les **ports** ouverts par les programmes du space (point vert = répond, clignotant = démarre ; clic = ouvre `http://localhost:<port>/`). Le raccourci de droite ouvre la palette. Les agents qui t'attendent et les PR à toi s'additionnent en pastille sur l'icône du Dock.

---

## 3. Raccourcis

### Les indispensables

| Touche | Action |
|---|---|
| `⌘⇧P` | Palette de commandes (tout ce que Herdr sait faire) |
| `⌘P` | Picker : aller à un tab, un space ou un agent (ceux qui t'attendent en premier ; `⌃D` ferme le tab sélectionné) |
| `⌘⇧O` | **projects** : ouvrir un space sur un dépôt de `~/dev` (ou aller à celui déjà ouvert) |
| `⌘⇧J` | **start-work** : démarrer un ticket Jira / une issue, ou reprendre une PR, dans un worktree avec Claude (§4) |
| `⌘⇧R` | Ouvrir / fermer le **panneau Pull request** (§4) |
| `⌘⇧U` | Ouvrir / fermer le **panneau Surveillance des PR** (§4) ; ouvert, il prend le clavier : ↑/↓, Entrée (agent ou PR), `p` (pause), `t` (worktree), `/` (filtre), Échap |
| `⌘⇧I` | Ouvrir / fermer le **panneau CI des branches longues** (§4) |
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

Chaque mod a son README avec le détail et les arbres de décision : [`start-work`](mods/start-work/README.md), [`projects`](mods/projects/README.md), [`pr`](mods/pr/README.md), [`journal`](mods/journal/README.md), [`status-jc`](mods/status-jc/README.md) (dont la surveillance des PR), [`spaces-jc`](mods/spaces-jc/README.md), [`tabs-jc`](mods/tabs-jc/README.md). La structure du layout `jc` est dans [`layouts/README.md`](layouts/README.md).

### start-work (`⌘⇧J`)

Depuis un terminal dans un dépôt :

1. Le champ vide liste **mes** tickets Jira et issues GitHub ouverts. Taper filtre ; `MERLIN-2321`, `#123` ou l'URL GitHub collée va droit au ticket ou à la PR ; un texte libre propose aussi « Sans ticket ».
2. `↑` `↓` pour choisir, choisir la **base** (master ou un `sprint-*` récent), ajuster la branche si besoin.
3. **Créer** : m'assigne le ticket Jira et le passe En cours (case à décocher), crée le worktree avec worktrunk, ouvre un space avec Claude et y tape `/superpowers:brainstorming <ticket>` (`/superpowers:systematic-debugging` pour un bug) sans l'envoyer.
4. Si le ticket a déjà une branche ou une PR ouverte, le bouton devient **Reprendre** : il ouvre le worktree existant (ou montre le space déjà ouvert dessus).
5. Une PR (`#5471`) se reprend toujours sur sa propre branche, sans prompt. Une PR venant d'un fork ne marche pas (sa branche n'est pas sur `origin`).

Les projets Jira du dépôt sont devinés depuis les sujets de commit ; sinon les nommer dans `mods/start-work/config.json` : `{"jira": {"arthur": ["MERLIN"]}}`.

### projects (`⌘⇧O`)

Les dépôts git à la racine de `~/dev` (sans les worktrees ni `agents-worktree`) : d'abord ceux ouverts récemment, puis les autres par date de dernier commit. Taper filtre sur le nom, `↵` ouvre un space sur le dépôt (un shell en haut, Claude en dessous), ou va au space déjà ouvert dessus (marqué « ouvert »).

### Panneau PR

Bouton « Pull request » dans la barre d'onglets (ou `⌘⇧R`) : la PR de la branche du space, puis un tableau Build (Jenkins, avec la console et la relance), Déployée (URLs des conteneurs), Checks (résumé, dépliable d'un clic, sans le check Jenkins) et Squash (commits `fixup!` à replier) ; sans PR, un bouton **Créer la PR**. **Rafraîchir** dans l'en-tête relit la PR. **Merger quand tout est vert** arme un « rebase and merge » : `status-jc` fusionne la PR dans la minute où tous ses checks passent au vert, même panneau fermé ; un nouveau commit ou un `fixup!`/`amend!`/`squash!` désarme, **Désarmer** sur la ligne Merge aussi. Le panneau **Surveillance des PR** (bouton à côté, icône de tracé, ou `⌘⇧U`) a son propre en-tête : le temps avant le prochain tour, le bouton de rafraîchissement (un tour tout de suite) et **?** qui déplie une aide (étapes, couleurs, boutons) ; chaque statut a son infobulle. Son interrupteur **Surveillance** suit mes PR ouvertes (actives dans les 7 derniers jours ; un brouillon seulement tant qu'un space ou une pane montre sa branche) toutes les 2 minutes (le rafraîchissement de l'en-tête pour un tour tout de suite) (depuis `status-jc`, même panneau fermé) et lance un agent Claude visible quand la PR est en conflit avec sa base (rebase puis push forcé), quand le build Jenkins casse, quand Sonar remonte des problèmes, ou pour `pr-review --fix --copilot` (avec une revue GitHub Copilot), la QA, `pr-demo --narrate --auto` (sans validation du scénario, narration en français, seulement si `AGENTS.md` ou `CLAUDE.md` de la branche par défaut a une section `## Demo`) puis `pr-risk` quand tout est vert, et une fois la PR approuvée par un humain (ou sans approbation quand le verdict `pr-risk` sur son code demande 0 revue humaine : la PR finit « ok », le merge reste à toi) replie ses commits `fixup!` (`git rebase --autosquash` puis push forcé, un agent seulement sur conflit ; **Squasher** sur la ligne Squash le fait tout de suite, après un second clic de confirmation) ; un seul `qa` ou `pr-demo` à la fois par dépôt (ports de l'appli fixes), et un `qa` ou `pr-demo` encore ouvert et arrêté 45 min après son lancement passe sa PR « à toi » (toast une fois) puisqu'il bloque les autres ; les onglets `pr-review`, `pr-demo` et `pr-risk` (et leur space s'il est seul) se ferment une fois leur commentaire posté, celui de `qa` s'il s'arrête sans rapport, ceux de rebase, squash, Jenkins et Sonar une fois leur agent fini, et un clic sur la case d'une étape rouvre la session Claude de son agent. Chaque PR surveillée a une bande de 9 étapes (en entier dans À toi et sur la ligne choisie, une barre fine ailleurs, sous le titre mis en avant) (git, jenk, sonar, rev, qa, demo, risk, appr, merge : vert fait, orange en cours ou en attente d'approbation, rouge en échec, violet à toi, gris à venir, pointillé jamais fait dans ce repo ; un brouillon n'a que git, jenk et sonar), le temps passé sur l'étape en cours et une estimation de « prête à approuver », et, sous elle, les actions qui s'y appliquent, en toutes lettres : **Passer prête pour review**, **Squasher N fixup!** (sur un brouillon, une PR approuvée ou la ligne choisie au clavier, second clic pour confirmer le push forcé ; sur conflit, « conflit : un agent squash le résout… » remplace le bouton tant que l'agent travaille), **Merger quand tout est vert** ou **Désarmer le merge** ; un bandeau donne les agents occupés (son − / + règle combien de 1 à 9 peuvent tourner à la fois, 3 par défaut), karadoc quand il est pris et le prochain tour, et son bouton **Brouillons (N)** (« Brouillons masqués (N) » une fois cliqué) masque ou réaffiche les brouillons. Une PR que la surveillance a finie dit qui agit ensuite (« attend relecture », « squash à venir », « prête à merger », « merge armé ») ; elle replie son explication mais garde son titre. Une PR « à toi » abandonnée sur Jenkins ou Sonar ouvre au clic la console du build ou l'analyse Sonar (« Ouvrir le log Jenkins » sous la ligne) ; son numéro ouvre la PR. Un filtre (`/` depuis la liste) garde les PR dont le dépôt, le titre, le space ou le `#N` contient chaque mot tapé. La liste commence par **À toi (N)** (ce que toi seul peux débloquer), puis **Rien d'autre pour toi (N)**, replié par défaut, avec un groupe par dépôt, et en bas **Brouillons hors surveillance (N)**, replié aussi (le terminal d'une ligne ouvre un space sur le brouillon, que la surveillance reprend alors) (son icône JetBrains, sinon sa lettre, comme dans les spaces), celui de la PR la plus urgente d'abord ; chaque section est triée par urgence (à toi, erreur, pas de clone local, agent en cours, en attente, brouillon, en pause, ok), une PR montrée par un space porte son nom (« space renono »), avec leur titre et une ligne qui dit pourquoi elles ont leur état (CI en cours, agent lancé, karadoc pris…). Une PR sans aucun check attend sa CI si la branche par défaut du clone local a un `Jenkinsfile` ou un `.github/workflows/`, sinon elle passe tout de suite à la review. Aucun agent ne part non plus quand la branche de la PR est checkout dans le clone ou un de ses worktrees avec du travail pas encore poussé : la PR passe « à toi » et reprend une fois tout poussé. Un clic droit sur une ligne (brouillon hors surveillance compris) ouvre un menu avec ses actions : passer prête pour review, merger quand tout est vert, squasher, ouvrir la PR, travailler dessus, pause. Le bouton pause d'une ligne met cette PR en pause : plus aucun agent ni toast pour elle, un agent déjà lancé finit ; le bouton lecture la reprend. Le bouton ⌨ ouvre un espace Claude pour travailler sur la PR : le worktree de la branche (créé par `wt` au besoin) pour un brouillon, le `-watch` (recréé s'il manque) pour une PR prête, mise en pause tant que cet espace reste ouvert. Détails : `docs/2026-11-14-pr-watch-design.md`, `docs/2026-11-18-pr-watch-open-design.md`, `docs/2026-11-20-pr-watch-pipeline-design.md`.

### Panneau CI des branches longues

Bouton CI (icône lecture dans un cercle) après « Surveillance des PR », ou `⌘⇧I` : le dernier build Jenkins (GitHub Actions sur une machine sans `jenkins` dans `config.json`) de `main`, `master`, `develop`, `sprint-*` et `release/*` des dépôts des propriétaires listés dans `config.json` (voir plus bas) où j'ai mergé une PR ou poussé un commit ces 7 derniers jours, les dépôts rouges en tête. Sur un build rouge : la console, la relance et **Corriger**, qui ouvre un space Claude sur une branche `fix/ci-<branche>-<N>` partie de la branche cassée ; l'agent relance si l'échec vient de l'infra ou d'un test instable, sinon corrige et ouvre une PR brouillon, que la Surveillance suit ensuite. Rafraîchi toutes les minutes panneau ouvert seulement. Détails : `docs/2026-11-24-ci-watch-design.md`.

### Panneau Journal

Bouton « Journal » (icône liste) après « CI des branches longues » : ce que la surveillance et le merge armé ont fait, toutes PR confondues, lu dans `~/Library/Logs/herdr-watch.log`. Les 20 dernières lignes, la plus récente en haut ; **Plus** en ajoute 20, **Tout le journal** ouvre le fichier dans `less` dans un nouvel onglet (`/` pour chercher). Un clic sur une ligne ouvre la PR. Les non-lues sont en clair au-dessus d'un trait « lu », la pastille du bouton compte les non-lues qui demandent d'agir (« à toi », « erreur », « merge refusé »), un simple point signale les autres, **Tout lu** remet les deux à zéro. Au plus une ligne par PR et par tour, surveillance active : agent lancé, changement d'état (dont la fin d'un agent, sauf une PR qui alterne entre deux états sur le même commit ; une erreur de lecture GitHub seulement au 2e tour d'affilée, et une seule ligne quand toutes les PR échouent), toast, PR fusionnée ou sortie de la surveillance, surveillance activée ou coupée. Détails : `docs/2026-11-18-watch-journal-design.md`.

### spaces-jc, status-jc et tabs-jc

Clones des mods `spaces`, `workspace-status` et `tabs` de Herdr : l'icône JetBrains du dépôt comme avatar de space, les ports cliquables dans la barre d'état, les boutons PR et Journal dans la barre d'onglets (le panneau mémorisé par space vient du mod d'origine).

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

- **Machine perso ou boulot** : `config.json`, rendu par `yadm alt` depuis `config.json##template` selon la classe yadm (éditer le template, jamais le rendu). `owners` (obligatoire) : les propriétaires GitHub dont la Surveillance, le panneau CI et le merge armé suivent les PR et dépôts. `jenkins.folder` : le panneau CI lit Jenkins ; absent, il lit GitHub Actions. `jira` (`url`, `me`) : `start-work` cherche et prend les tickets Jira ; absent, pas de Jira. `dockerQa` : le panneau PR cherche les conteneurs de QA. Sans `config.json`, ces mods n'appellent pas GitHub et disent « lance yadm alt ».
- **Raccourcis** : `keys.json`. Une fois édité, Herdr ne le met plus à jour : `herdr-upstream` (lancé par `dot`) y fusionne ses nouveaux raccourcis par défaut, lus dans le binaire, avec `keys.default.json` comme base. Committer les deux ensemble. Éviter les `⌃lettre` que le shell utilise (`⌃C`, `⌃R`, `⌃W`…).
- **Layout ou mod livré par Herdr** : ne jamais l'éditer (écrasé au démarrage). Le cloner (`layout.clone`, `mod.clone`) et committer l'original avec le clone ; `dot` reporte ensuite les mises à jour de Herdr dans nos clones (voir `~/.config/CLAUDE.md`).
- **Vérifier un mod** : `herdr-app check ~/.config/herdr-app/mods/<nom>`, et les tests : `node --test ~/.config/herdr-app/mods/*/*.test.mjs`.
- Ne pas committer `gpui-kit.d.ts` ni `jsconfig.json` que Herdr écrit dans chaque mod.
