# start-work : commencer un ticket en un geste

Conception du 13 novembre 2026, pour un mod Herdr à nous (`mods/start-work/`), inspiré de celui de
[aguiddir/herdr-config](https://github.com/aguiddir/herdr-config/tree/main/mods/start-work).

## Pourquoi

Commencer un ticket, aujourd'hui, c'est cinq gestes à la main :

1. copier la clé Jira (`MERLIN-2321`) ou le numéro d'une issue GitHub ;
2. `wt switch --create <branche>` ;
3. lancer `claude` dans le worktree ;
4. passer le ticket « En cours » dans Jira (et se l'assigner) ;
5. lancer `/superpowers:brainstorming` en donnant le ticket à Claude.

Le mod les ramène à un seul : choisir le ticket. On obtient un space Herdr ouvert sur un nouveau
worktree, Claude lancé dedans, avec le premier message déjà écrit mais **pas envoyé**, pour pouvoir
le compléter.

## Objectifs

- Un raccourci ouvre une fenêtre de recherche, depuis un terminal ouvert dans un dépôt git.
- Champ vide : mes tickets Jira ouverts, des projets du dépôt, et mes issues GitHub ouvertes du dépôt.
- Une saisie cherche dans Jira (projets du dépôt) et dans les issues GitHub du dépôt. Une clé
  (`MERLIN-2321`) ou un `#5355` tapé en entier est trouvé directement, même hors de ces listes.
- Un texte libre sans ticket donne un travail « sans ticket ».
- Sous la liste : la **base** (la branche par défaut du dépôt, `master` ou `main` d'après
  `origin/HEAD`, ou une branche `sprint-*`) et le **nom de branche**, pré-rempli et modifiable.
- Valider (`↵`) :
  1. pour un ticket Jira : me l'assigner, et le passer « En cours » s'il n'était pas commencé ;
  2. créer le worktree avec worktrunk, depuis la base choisie ;
  3. ouvrir un space Herdr dessus, avec Claude ;
  4. écrire dans Claude, sans l'envoyer, `/superpowers:brainstorming <ticket>`.
- Si le ticket a déjà une branche ou une PR ouverte, le bouton devient **Reprendre** : il ouvre le
  worktree existant (ou le crée sur la branche existante), ou affiche le space déjà ouvert dessus,
  sans toucher à Jira ni écrire de prompt.

## Non-objectifs

- Les PR (les relire, les reprendre) : ce sera pr-inbox, une conception à part.
- Nettoyer les branches mergées, créer un ticket, pousser une branche, ouvrir une PR.
- S'assigner une issue GitHub ou en changer l'état.
- D'autres agents que Claude Code.

## Anti-objectifs (un échec même si ça marche)

- **Envoyer le prompt** : il doit rester modifiable.
- **Un travail à moitié fait sans le dire** : si une étape échoue, le message dit laquelle et ce qui
  est déjà fait. Jira passe d'abord : s'il refuse, rien n'est créé.
- Écrire sur GitHub, toucher au checkout principal (pas de `checkout`, pas de `stash`).
- Perdre ce qu'il y avait dans le presse-papier.
- Exiger une configuration par dépôt avant de servir.

## Contraintes

- macOS, Herdr 0.1.15, mods en JavaScript gpui-kit (voir `~/.config/herdr-app/AGENTS.md`,
  `herdr.d.ts`, `gpui-kit.d.ts`). Pas de `setTimeout` : `cx.timer`. Les appels passent par `exec`.
- Outils déjà installés et connectés : `wt` (worktrunk), `jira` (jira-cli 1.7, jeton dans
  `JIRA_API_TOKEN`, serveur `https://vidalgroup.atlassian.net`, compte
  `jean-christophe.gay@vidal.fr`), `gh`, `claude`. Pas d'`acli`.
- Les worktrees vont où worktrunk les met : `~/dev/agents-worktree/<repo>/<branche>`
  (`~/.herdr/worktrees` y pointe). worktrunk lance ses hooks à la création : on les garde.
- La logique pure va dans `lib.js`, sans import de Herdr, testée par `lib.test.mjs` (`node:test`),
  que la CI du dépôt dotfiles lance déjà (`.github/workflows/test.yml`).
- C'est un mod à nous, pas un clone : pas de `cloned_from`, rien à suivre par `herdr-upstream`.
  Commité dans yadm sans `gpui-kit.d.ts` ni `jsconfig.json`.

## Approches envisagées

| | Approche | Pour | Contre |
|---|---|---|---|
| **A (retenue)** | Notre mod Herdr : une fenêtre, le mod enchaîne tout | l'interface voulue (recherche, base, branche) ; tout en un geste | le plus gros morceau ; ne sert que dans Herdr |
| B | Un script `start-work` + fzf, lancé dans un terminal | simple, utilisable hors Herdr | ni menu de base ni branche éditable ; coller le prompt dans le nouveau Claude depuis un script est fragile |
| C | Reprendre le mod du collègue et l'adapter | démarrage rapide | 27 Ko pensés pour un autre déroulé (onglets Jira/Issues/PR, `acli`, `git worktree`) ; une copie modifiée qu'on ne suit plus |

A, choisi par Jean-Christophe : B renonce aux deux choix de l'interface (base, branche) ; C fait
porter un code taillé pour un autre usage. On reprend en revanche, en le créditant, ce que le
collègue a déjà résolu dans son `lib.js` : `slug`, le nom de branche, `existingWork` (la branche ou
la PR d'un ticket) et `spaceIn` (le space déjà ouvert sur un worktree).

## Ce qui est décidé

### Le dépôt

Celui du terminal actif (`focused().cwd`, sinon le dossier du space) : `git rev-parse` donne son
checkout principal et son nom. Hors d'un dépôt git, la fenêtre le dit et n'offre rien. *(Décision
de conception)* Espaces de cette machine seulement : dans un space d'une autre machine (`machine`
non nul), la fenêtre le dit et n'offre rien, car git, `wt` et `gh` d'un côté et le presse-papier
de l'autre ne tourneraient pas au même endroit. Le dépôt
GitHub est celui d'`origin` (`gh` le trouve seul depuis le dossier).

### Les projets Jira d'un dépôt

Déduits de l'historique, sans configuration : les clés `[A-Z][A-Z0-9]+-\d+` en tête des sujets de
commit des 12 derniers mois, gardées si elles apparaissent au moins 3 fois. Pour arthur cela donne
`APIREST` (77), `MERLIN` (68), `ZAPI` (6). `mods/start-work/config.json` peut remplacer cette liste
pour un dépôt : `{ "jira": { "arthur": ["MERLIN", "APIREST"] } }`. Aucun projet trouvé : pas de
résultats Jira, la fenêtre le dit, GitHub et le texte libre marchent.

### La liste et la recherche

- Champ vide : `assignee = currentUser() AND project in (<projets>) AND statusCategory != Done
  ORDER BY updated DESC`, puis `gh issue list --assignee @me --state open`.
- Saisie : `project in (<projets>) AND statusCategory != Done AND text ~ "<saisie>"` et
  `gh issue list --state open --search "<saisie>"`. Résultats Jira d'abord, puis GitHub, 20 de
  chaque au plus.
- Clé exacte (`MERLIN-2321`, insensible à la casse) : le ticket est lu directement, quel que soit
  son projet ou son état. `#5355` : l'issue est lue directement.
- Toujours en dernière ligne, si la saisie n'est ni une clé ni un `#n` : « Sans ticket : <saisie> ».
- Chaque ligne : la source (JIRA ou GH), la clé ou le numéro, le titre, l'état, et la personne
  assignée si ce n'est pas moi.
- Jira est lu avec `jira issue list --jql … --plain` (ou sa sortie brute JSON), GitHub avec
  `gh … --json number,title,state,assignees`.

```
┌ Commencer un travail ──────────────────────────────────────┐
│ > inflexions                                               │
│ JIRA  MERLIN-2330  Inflexions des noms composés   Ouvert   │
│ JIRA  APIREST-1540 Recherche : pluriels           En cours │
│ GH    #5355        Inflections dans la recherche           │
│       Sans ticket : inflexions                             │
│ Base : master ▾   Branche : MERLIN-2330-inflexions-des-... │
│ ☑ M'assigner et passer En cours          [ Créer ]         │
└────────────────────────────────────────────────────────────┘
```

Clavier : `↑↓` choisit, `↵` crée (ou reprend), `esc` ferme, `tab` passe du champ de recherche au
nom de branche.

### La base

Un menu : la branche par défaut (`origin/HEAD`, après un `git fetch origin`), puis les branches
`sprint-*` d'origin, la plus récente d'abord. La branche par défaut est choisie au départ.

### Le nom de branche

Pré-rempli selon la ligne choisie, modifiable à la main (une saisie à la main reste tant qu'on ne
change pas de ligne) :

- Jira : `<CLÉ>-<slug du titre>` (`MERLIN-2330-inflexions-des-noms-composes`) ;
- issue : `<n>-<slug du titre>` (`5355-inflections-dans-la-recherche`) ;
- sans ticket : `<slug du texte>`.

Le slug : sans accents, minuscules, tirets, 50 caractères au plus coupés à un tiret. Un nom
invalide (`git check-ref-format --branch`) est refusé avant toute action.

### Reprendre

Si le ticket a du travail **en cours**, la branche proposée est celle-là et le bouton devient
**Reprendre**. Le travail en cours (`existingWork`, adapté) : une PR ouverte dont le titre commence
par la clé, sinon une PR ouverte sur une branche qui porte la clé ou le numéro, sinon la branche
locale ou d'origin la plus récente qui les porte, hors `backup/`, **et pas encore mergée dans la
base** (`git merge-base --is-ancestor`, et pour un squash merge une PR mergée sur cette branche la
classe aussi comme livrée). Une branche déjà livrée est ignorée : le bouton reste **Créer**, et un
ticket livré repart sur une branche neuve.

Taper un autre nom de branche que celle proposée repasse le bouton à **Créer** (avec Jira et le
prompt) : c'est la façon d'ouvrir un second chantier sur un ticket encore ouvert. Choix de
Jean-Christophe, plutôt qu'un second bouton « Reprendre » toujours visible.

Reprendre :

- branche déjà sortie dans un worktree, avec un space ouvert dessus : on affiche ce space ;
- sortie sans space : un space s'ouvre sur ce worktree, avec Claude ;
- pas sortie : `wt switch <branche>` (sans `--create`) la sort, puis comme ci-dessus.

Reprendre ne touche pas à Jira et n'écrit pas de prompt : Claude démarre vide.

### Jira : m'assigner et passer « En cours »

Une case, cochée par défaut, visible pour un ticket Jira. Cochée, avant tout le reste :

1. si le ticket n'est pas à moi : `jira issue assign <clé> $(jira me)` ;
2. si son état est de catégorie « à faire » (`statusCategory = new`) : lire les transitions
   possibles (`GET /rest/api/3/issue/<clé>/transitions`, avec `JIRA_API_TOKEN`), prendre celle qui
   mène à un état de catégorie `indeterminate` **et** dont le nom ou l'état d'arrivée correspond à
   `en cours|in progress` (insensible à la casse et aux accents), puis `jira issue move <clé>
   "<nom de la transition>"`. Sur MERLIN et APIREST c'est « In Progress » → « En cours » ; la
   catégorie seule ne suffit pas, six transitions y sont `indeterminate` (« Bloqué », « En
   validation »…).
3. aucune transition ne correspond : on continue, et un toast dit que l'état n'a pas changé.

Un échec de l'assignation arrête tout, avant de créer quoi que ce soit. *(Décision de conception)*
Un échec de la lecture des transitions ou de `jira issue move` (erreur HTTP, délai dépassé), une
fois l'assignation faite, n'arrête pas : comme une transition introuvable, on continue et le toast
dit « assigné, état inchangé » avec l'erreur. L'état est un confort, l'assignation ne se défait pas,
et bloquer le travail pour ça serait pire.

### Le worktree

`wt switch --create <branche> --base <base> --no-cd`, lancé depuis le checkout principal, sans
`--execute` : le space Herdr lance Claude lui-même. Le chemin du worktree est ensuite lu dans
`git worktree list --porcelain` (la branche donne le dossier). worktrunk fait le reste : son chemin,
ses hooks.

### Le space et Claude

`space.new { folder: <worktree>, argv: ["claude"] }`, sans nom : le space suit le dossier et se
range sous son dépôt dans la barre latérale.

### Le prompt pré-rempli

Claude Code ne sait pas pré-remplir sa saisie (un prompt passé en argument part tout de suite), et
`hc send` appuie toujours sur Entrée. Le mod passe donc par le presse-papier :

1. trouver le terminal du nouveau space (`terminals()`, label `herdr.space`) et attendre que Claude
   soit prêt (son statut d'agent passe à `idle`, avec une limite de temps) ;
2. *(Décision de conception)* ne coller que si l'on regarde toujours ce space : `space.new` le
   sélectionne, mais si, pendant l'attente, un autre space est devenu actif, on ne vole pas le focus
   et on passe au repli (le toast) ;
3. *(Décision de conception)* ne toucher au presse-papier que s'il ne contient que du texte
   (`osascript -e 'clipboard info'`) : image, fichiers copiés ou texte riche, on ne colle pas et on
   passe au repli, plutôt que de les perdre ;
4. garder le presse-papier (`pbpaste`), y mettre le prompt (`pbcopy`) ;
5. donner le focus à ce terminal (`pane.focus { terminal }`) et coller (`terminal.paste`), ce qui
   n'envoie pas Entrée ;
6. remettre l'ancien presse-papier.

Le prompt :

- Jira : `/superpowers:brainstorming <CLÉ> : <titre>` (Claude lit le ticket avec le connecteur
  Atlassian) ;
- issue : `/superpowers:brainstorming <url de l'issue> : <titre>` ;
- sans ticket : `/superpowers:brainstorming <texte>`.

Le repli : si Claude n'est pas prêt dans le délai, si l'on a quitté le space, si le presse-papier
n'est pas du texte, ou si le collage échoue, le prompt reste dans un toast, pour le copier à la
main ; un presse-papier touché est remis dans tous les cas.

### Ouvrir la fenêtre

Un raccourci global dans `keys.json`, `cmd-shift-j` (libre aujourd'hui) →
`mod.open:start-work`, ouvert en dialogue (`openOverlay { kind: "dialog" }`, environ 640 × 440).

## Laissé au constructeur

- La mise en page exacte, les couleurs (`theme()`), les messages d'erreur.
- Le délai d'attente de Claude et la fréquence de la recherche pendant la saisie (attendre une
  courte pause avant d'interroger Jira et GitHub, annuler une réponse dépassée).
- Le format de sortie de `jira` à parser (`--plain` ou `--raw`), et le seuil de 3 occurrences.
- Le découpage entre `main.js` et `lib.js`, du moment que la logique sans Herdr (slug, nom de
  branche, détection des projets, choix de la transition, `existingWork`, construction du JQL et
  du prompt) est dans `lib.js` et testée.
