# Herdr sans Vidal : une config par classe yadm

## Intention

Je veux faire tourner Herdr sur ma machine perso, avec mon compte GitHub perso, sans rien de propre
à Vidal. Aujourd'hui l'organisation `softwarevidal`, Jenkins, Jira et les hôtes Docker de QA sont
écrits en dur dans les mods. Sur la machine perso :

- la Surveillance (`status-jc`) ne trouverait aucune PR ;
- la vue CI (`pr`, `⌘⇧I`) ne trouverait aucun dépôt, et ne lit que Jenkins ;
- `start-work` interrogerait le Jira de Vidal avec mon email du boulot.

## Objectifs

- Un seul fichier de réglages, rendu par yadm selon la classe (`Work` / `Personal`), lu par chaque
  mod qui en a besoin.
- Les PR et dépôts suivis sont ceux d'une **liste explicite de propriétaires** GitHub (mon login et
  les organisations où je travaille), pas une organisation unique.
- Sur la machine perso, la vue CI lit **GitHub Actions** au lieu de Jenkins, avec le même rendu et
  les mêmes boutons (log, relance, Corriger).
- Ce qui n'existe qu'au boulot disparaît quand la config ne le déclare pas : Jira dans `start-work`,
  le scan des conteneurs de QA dans le panneau PR.

## Non-objectifs

- Suivre mes PR sur des dépôts tiers hors de la liste : la Surveillance y pousserait des fixups.
- Déduire les organisations automatiquement (`gh api user/orgs`) : une org dormante ou sans droit de
  push entrerait dans la boucle sans que je l'aie décidé.
- Mélanger Jenkins et Actions sur une même machine : la config choisit l'un ou l'autre.
- Changer la convention des chemins (`~/dev/<repo>`, `~/dev/agents-worktree/<repo>/`) : c'est la
  mienne, pas celle de Vidal. Deux dépôts de même nom sous deux propriétaires partageraient ce dossier :
  accepté.
- `/Volumes/sourcecode/<repo>` dans `findClone` de `status-jc` : absent sur la machine perso, il est
  ignoré tout seul. Laissé tel quel.
- Les textes des prompts d'agents qui citent `jk` pour le pas `jenkins` de la Surveillance : ce pas
  ne se déclenche que sur un check Jenkins, donc jamais sur la machine perso.

## Anti-objectifs

- Retomber en silence sur les valeurs Vidal quand la config manque : ça relancerait des agents sur
  le mauvais compte sans que je le voie.
- Une config éparpillée par mod qui recopie la liste des propriétaires.

## Contraintes

- Un mod n'importe pas les fichiers d'un autre : chaque mod lit le fichier lui-même
  (`readTextFile(`${appHome()}/config.json`)`, comme `start-work` lit déjà le sien).
- Le processeur de templates de yadm ne gère que la forme multi-ligne
  `{% if yadm.class == "Work" %}` / `{% else %}` / `{% endif %}`, une directive par ligne.
- Le dépôt dotfiles est **public** : la liste de mes organisations perso y sera visible. Accepté
  (même chose que l'email déjà présent dans `start-work/work.js`).
- Le rendu (`config.json`) est gitignoré, comme `.gitconfig`.
- Les modules purs (`*-model.js`, `model.js`, `watch.js`, `lib.js`) n'importent rien de Herdr : ils
  reçoivent la config en argument, pour rester testables avec `node --test`.

## Approches envisagées

- **A. Un fichier commun rendu par yadm selon la classe** (retenue) :
  `~/.config/herdr-app/config.json##template`. Une seule source, le mécanisme de classe que les
  dotfiles utilisent déjà pour `.gitconfig`, une nouvelle machine configurée par `yadm alt`. Prix :
  les organisations perso sont dans un dépôt public.
- **B. Un `config.json` par mod, non suivi, écrit à la main** (modèle de `start-work`) : liste des
  propriétaires recopiée dans `status-jc` et `pr`, rien de reproductible sur une nouvelle machine.
- **C. Détection sans config** (`jk` installé → Jenkins, `jira` configuré → Jira) : fragile, installer
  `jk` en perso changerait le comportement ; les propriétaires resteraient à écrire quelque part.

## Le fichier

`~/.config/herdr-app/config.json##template`, rendu en `~/.config/herdr-app/config.json` :

```json
{% if yadm.class == "Work" %}
{
  "owners": ["softwarevidal"],
  "jenkins": { "folder": "team.software/github" },
  "jira": { "url": "https://vidalgroup.atlassian.net", "me": "jean-christophe.gay@vidal.fr" },
  "dockerQa": true
}
{% else %}
{
  "owners": ["jcgay"]
}
{% endif %}
```

- `owners` (obligatoire, non vide) : propriétaires GitHub des PR et dépôts suivis.
- `jenkins` (facultatif) : présent, la vue CI lit Jenkins sous `folder` ; absent, elle lit GitHub
  Actions.
- `jira` (facultatif) : présent, `start-work` cherche et prend les tickets Jira ; absent, plus de Jira.
- `dockerQa` (facultatif, faux par défaut) : vrai, le panneau PR cherche les conteneurs de QA sur
  `dockersw`, `docker-sw2`, `dockerbo`.

La liste perso exacte des organisations est à compléter par moi dans le template.

Le `config.json` de `start-work` (projets Jira par dépôt) reste à sa place : c'est un réglage par
dépôt, sans rapport avec la machine.

## Config absente ou invalide

Fichier absent, JSON illisible ou `owners` vide : aucun appel GitHub ni agent. Chaque endroit
concerné affiche la même erreur, « config.json absent ou invalide : lance `yadm alt` » :

- la Surveillance (`status-jc`) arrête **toutes** ses boucles, pas seulement `round()` :
  `mergeRound`, `openRound` et `squashRound` (qui pousse en `--force`) agissent aussi sur GitHub et
  lancent des agents. Le registre est gardé tel quel (merges armés, squashes en attente) et reprend
  quand la config revient. L'erreur est publiée comme ses erreurs de recherche, visible dans la vue
  `watch` (mon choix) ;
- la vue CI affiche l'erreur au-dessus de la liste ;
- `start-work` affiche l'erreur en note et fonctionne sans Jira ; il ne vérifie pas `owners`, qu'il
  n'utilise pas. Une config valide sans `jira` ne donne aucune note (mon choix : sans note, Jira
  disparaîtrait sans raison visible sur la machine du boulot avant `yadm alt`).

Le fichier est relu à chaque tour (Surveillance, vue CI) : un `yadm alt` prend effet sans
redémarrer Herdr.

## Ce qui change par mod

### `status-jc` (Surveillance)

`gh search prs --author=@me --state=open --owner=<o1> --owner=<o2> …` au lieu de
`--owner=softwarevidal` (`watcher.js:232`). Le reste travaille déjà sur `owner/repo`.

### `pr`, vue PR et aide

- Le texte d'aide de la vue `watch` (`main.js:492`) cite les propriétaires de la config au lieu de
  « softwarevidal ».
- `dockerQa` faux : `containers()` renvoie une liste vide sans lancer de commande.

### `pr`, vue CI

- `ORG` et `JOBS_FOLDER` disparaissent de `ci-model.js`.
- Recherche des dépôts : les deux `gh search` prennent un `--owner` par propriétaire. Les dépôts
  sont gardés en `owner/name` (aujourd'hui `reposOf` ne garde que le nom) ; l'affichage peut
  continuer à montrer le nom seul quand il n'y a qu'un propriétaire.
- `gh pr list -R` et `findClone` utilisent `owner/name` au lieu de `${ORG}/${repo}`.
- **Source Jenkins** (`jenkins` présent) : inchangée, avec `jenkins.folder` au lieu de
  `JOBS_FOLDER`.
- **Source Actions** (`jenkins` absent) :
  - les branches longues d'un dépôt (`isLong`, inchangée) viennent de
    `gh api repos/<owner/name>/branches`, gardées 15 min avec les dépôts ; les runs de chacune de
    `gh run list -R <owner/name> --branch <b> --created >=<J-7> --json databaseId,number,…`, bornés
    par la date et non par un nombre : les runs de PR sur tout le dépôt, ou un cron horaire, repousseraient
    le dernier run d'un workflow plus rare hors d'un `--limit` ;
  - par branche, le dernier run de chaque workflow ; une ligne par branche, rouge si un de ces derniers runs est en échec (`failure`,
    `timed_out`, `startup_failure` ; un run `cancelled`, souvent par `cancel-in-progress`, n'est pas
    un échec), en cours si un tourne, verte sinon. Le numéro (`number` du run, pas son id) et l'URL
    de la ligne sont ceux du run rouge le plus récent (ou du plus récent tout court) ;
  - même fenêtre de 7 jours (`createdAt`) ; un dépôt sans run sur une branche longue sort de la liste ;
  - **Log** ouvre l'URL du run de la ligne ; **Relance** fait `gh run rerun <id> --failed` sur
    **chaque** run rouge de la branche (mon choix : n'en relancer qu'un laisserait la ligne rouge) ;
  - **Corriger** : même worktree `fix/ci-<branche>-<N>` (N = numéro du run rouge le plus récent) ; le
    prompt liste tous les runs rouges de la branche (workflow et id), lit
    `gh run view <id> -R <owner/name> --log-failed` pour chacun, relance avec
    `gh run rerun <id> --failed` si l'échec vient de l'infra ou d'un test instable, sinon corrige et
    ouvre une PR brouillon ;
  - le message « Jenkins injoignable (VPN ?) » ne s'applique pas ; une erreur `gh` s'affiche comme
    les autres.
- Les fonctions pures de la source Actions vont dans `ci-model.js`, avec leurs tests dans
  `ci-model.test.mjs` (JSON de `gh run list` en entrée).

### `tabs-jc`

Rien : le bouton CI et `⌘⇧I` restent, la vue CI choisit sa source.

### `start-work`

- `ME` et `JIRA` viennent de `config.jira.me` et `config.jira.url`. Seuls les appels `curl`
  (`myName`, `transitions`) s'en servent : la CLI `jira` lit son propre fichier
  (`~/.config/.jira/.config.yml`, propre à chaque machine). On ne lui passe pas l'URL : un
  commentaire le dit dans le code (mon choix).
- `jira` absent : aucun appel Jira ni à `myName()`, la ligne « prendre le ticket » ne s'affiche pas,
  un texte en forme de clé est cherché comme du texte, et la note « aucun projet Jira trouvé » ne
  s'affiche plus. Le champ dit « Ticket, #issue ou #PR, ou décris le travail » sur les deux
  machines : son texte est fixé à la création, avant que la config soit lue.

## Documentation

Dans le même commit que le code : `herdr-app/README.md`, les `README.md` de `pr`, `status-jc` et
`start-work`, `~/.config/CLAUDE.md` (le fichier dans « Herdr desktop app » et dans la section
templates), et `.gitignore` pour le rendu `config.json`. Les anciens designs (`ci-watch`, `pr-watch`)
restent tels quels : ce sont des archives.

## Laissé au constructeur

- Où placer la lecture de la config dans chaque mod (au démarrage puis à chaque tour, ou un petit
  helper recopié par mod).
- Le découpage en commits et l'ordre (org d'abord, Actions ensuite, ou l'inverse).
- La forme exacte des messages d'erreur, tant qu'ils nomment `yadm alt`.
