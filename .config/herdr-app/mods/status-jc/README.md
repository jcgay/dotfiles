# status-jc

Clone perso du mod `workspace-status` de Herdr (version 0.1.15, voir `mod.json`), la barre d'état en bas du layout `jc`.

## Ce que fait le mod

Il affiche la barre d'état : machine, branche, nombre d'agents et combien t'attendent, puis les ports ouverts par les programmes du space affiché, et le raccourci de la palette. Il héberge aussi la surveillance des PR : toutes les 2 minutes, et à la demande depuis le panneau, il lit tes PR ouvertes et lance des agents Claude dans des onglets visibles pour réparer Jenkins ou Sonar, puis pour la revue. Le panneau PR (`mods/pr/`) n'en est que l'affichage et l'interrupteur. Il fusionne aussi, toutes les minutes, les PR armées depuis le panneau dès que leurs checks sont verts (voir « Merge armé »).

## Barre d'état

De gauche à droite :

- le nom de la machine pour un space distant (rien pour ce Mac), la branche du space ;
- `N agents`, et `· N t'attend(ent)` pour les agents `blocked`. Ce nombre part aussi en pastille sur l'icône du Dock (`setBadge`, rappelé seulement quand il change) ;
- `N PR à toi`, en rouge, quand la surveillance a abandonné des PR (étiquette « à toi ») ou qu'un merge armé d'une PR surveillée a été refusé (`waitingOnMe` dans `watch.js`). Un clic ouvre le panneau Surveillance des PR, qui prend le clavier (`shared("watch-focus")`, comme `⌘⇧U`). Ce nombre s'ajoute à celui des agents dans la pastille du Dock ;
- les ports du space affiché, triés : point vert plein = répond, cercle qui clignote = démarre. Un clic ouvre `http://localhost:<port>/` ;
- le raccourci de la palette tel qu'il est vraiment lié dans `keys.json` (`commandes` seul s'il n'y en a pas). Un clic l'ouvre.

Les icônes viennent de `mods/workspace-chrome/*.svg` (mod livré par Herdr).

Les ports sont relus toutes les 5 s, et tout de suite quand tu changes de space :

1. `lsof -nP -iTCP -sTCP:LISTEN -Fpn` donne les process qui écoutent et leurs ports. Les ports à partir de 32768 (éphémères : démons, aides d'IDE) sont ignorés.
2. `ps -axo pid=,ppid=` et `lsof -a -d cwd` donnent les parents et le dossier courant de chaque process. Ces deux réponses sont réutilisées tant qu'aucun nouveau listener n'apparaît, pendant une minute au plus.
3. Le space d'un listener : le premier terminal Herdr parmi ses ancêtres (`npm run dev` lancé dans un tab). Sinon, le space dont un pane a pour dossier le plus profond qui contient son dossier courant (un JVM lancé par le démon Gradle n'est pas un descendant, mais tourne dans le worktree). Les spaces distants et les panes ouverts sur `~` ne comptent pas.
4. Seuls les ports du space affiché sont interrogés par `curl -m 2 http://127.0.0.1:<port>/` : un port inconnu ou pas encore `up` à chaque tour, un port `up` toutes les 30 s.
5. `up` si le code HTTP est entre 1 et 499, ou si curl sort en 52/56 (réponse vide ou coupée : une base de données, pas du HTTP, mais le port est ouvert). Tout le reste (500+, refus, timeout) : `starting`.

## Surveillance des PR

### Quand et quoi

Un premier tour 60 s après le démarrage du mod, puis toutes les 2 min, et dans les 5 s quand le rafraîchissement de la Surveillance des PR écrit `shared("pr-watch-now")` (ou dès la fin du tour en cours s'il y en a un). Les tours tournent aussi surveillance coupée : le panneau reste à jour, mais aucun agent ne part.

Un tour prend un bail `shared("pr-watch-lease")` : si une autre copie du mod en tient un de moins de 4 min, le tour ne fait rien. Il lit ensuite :

- `gh search prs --author=@me --state=open --owner=softwarevidal --updated=>=<aujourd'hui - 7 j>` : une PR sans activité depuis 7 jours sort de la liste (et du panneau) ;
- pour chaque PR, `gh pr view --json ...` (checks, commentaires, reviews) et `gh api .../commits/<sha>/check-runs` (Sonar) ;
- pour chaque dépôt, son clone local (dossiers des spaces locaux et de leurs panes, `~/dev/agents-worktree/<repo>/*`, `/Volumes/sourcecode/<repo>`, reconnu par son remote `origin`), s'il a une CI (`Jenkinsfile` ou `.github/workflows/`), une section `## Demo` dans `AGENTS.md` ou `CLAUDE.md`, le skill QA (`testing-api-pull-requests` dont `references/report.md` porte le marqueur, sous `.agents/` ou `.claude/`) et un dossier `karadoc/`. Tout est lu avec git sur la branche par défaut au dernier fetch (`origin/HEAD`, sinon `origin/main`, sinon `origin/master`), jamais sur la branche checkout : le clone peut être sur une PR qui ajoute le premier `Jenkinsfile`, et le dépôt n'a pas de CI tant qu'elle n'est pas mergée.

Jenkins = un check dont l'URL est un build Jenkins (un contexte `ko` l'emporte s'il y en a plusieurs). Sonar = le check-run `SonarCloud Code Analysis` ou `SonarQube Code Analysis` : `ko` si sa conclusion est `failure` ou si son résumé annonce au moins une nouvelle issue ou un hotspot. Un check Jenkins ou Sonar déjà vu sur un ancien commit et absent du nouveau compte comme « en cours ». Les marqueurs (`<!-- pr-risk -->`, `<!-- pr-review -->`, `<!-- pr-demo -->`, `<!-- testing-api-pull-requests -->`) ne comptent qu'en tête de tes propres commentaires ou reviews.

### Décision pour une PR

`decide()` dans `watch.js`. Une PR en conflit avec sa base (`mergeable` à `CONFLICTING`) passe avant tout : GitHub n'y lance aucune CI. Tant que GitHub répond `UNKNOWN` (juste après un push sur la base), la PR attend sans rien lancer ni remettre à 0. L'agent `rebase` rebase sur `origin/<base>` sans autosquash et pousse en `--force-with-lease` sur le commit d'où il est parti ; un conflit ambigu, il abandonne. Ses tentatives repartent à 0 dès que la PR n'est plus en conflit. Une PR approuvée par un humain (`reviewDecision` à `APPROVED`) qui a encore des commits `fixup!`/`amend!`/`squash!` passe, une fois ses étapes de revue faites, par l'étape `squash` : pas d'agent, `autosquash` dans `watcher.js` fait dans le worktree de surveillance `git rebase -i --autosquash --no-update-refs` sur le merge-base avec `origin/<base>` (la base ne bouge pas, le code non plus : un arbre différent de celui du head, commit de merge par exemple, est refusé sans rien pousser), puis le même push `--force-with-lease` sur le head. Si le rebase s'arrête sur un conflit, il l'abandonne et lance l'agent `squash`, qui doit retrouver le même arbre. Avant l'approbation, les fixups restent : le relecteur garde ses « changements depuis ma dernière revue ». Un refus (arbre différent, push rejeté, après quoi le worktree revient sur le head) compte comme une tentative. Deux tentatives, remises à 0 quand il n'y a plus de fixup. Son push change le head : un merge armé sur la PR est désarmé. Ton checkout de la branche, à jour avant ce push, ne compte pas comme du travail non poussé (les anciennes positions de `origin/<branche>` sont exclues). Les tentatives Jenkins et Sonar repartent à 0 quand le check est vert ou quand un nouveau commit arrive sans qu'un onglet d'agent correcteur de la PR (rebase, jenkins, sonar, squash, pr-review) soit ouvert : c'est ton push. Un commit apparu pendant que cet onglet existe est celui de l'agent, le budget reste.

```mermaid
flowchart TD
  A["PR lue par gh"] --> B{"lecture en erreur ?"}
  B -->|oui| Lerr["erreur"]
  B -->|non| C{"l'agent lancé tient encore la PR ?"}
  C -->|oui| Lrun["agent en cours"]
  C -->|non| D{"un autre onglet de cette PR tient ?"}
  D -->|oui| Lrun
  D -->|non| E{"PR en pause ?"}
  E -->|oui| Lpause["en pause, sans toast ni comptage"]
  E -->|non| X0{"GitHub calcule encore le conflit ?"}
  X0 -->|oui| Lwait0["en attente"]
  X0 -->|non| X{"en conflit avec sa base ?"}
  X -->|"oui, moins de 2 tentatives"| Sx["étape rebase"]
  X -->|"oui, 2 tentatives"| Lyours0["à toi, toast une fois"]
  X -->|non| F{"Jenkins ko ?"}
  F -->|oui| F2{"déjà 2 tentatives Jenkins ?"}
  F2 -->|oui| Lyours1["à toi, toast une fois"]
  F2 -->|non| Sj["étape jenkins"]
  F -->|non| G{"Jenkins, Sonar ou un autre check en cours ?"}
  G -->|oui| Lwait1["en attente : CI en cours"]
  G -->|non| H{"Sonar ko ?"}
  H -->|"oui, moins de 2 tentatives"| Ss["étape sonar"]
  H -->|"oui, 2 tentatives"| H3{"quality gate en échec ?"}
  H3 -->|oui| Lyours2["à toi, toast une fois"]
  H3 -->|"non : à toi noté, toast"| I
  H -->|non| I{"brouillon ?"}
  I -->|oui| N
  I -->|non| K{"un autre check ko ?"}
  K -->|oui| Lyours3["à toi, sans toast"]
  K -->|non| M{"aucun check et le clone a une CI ?"}
  M -->|oui| Lwait2["en attente de la CI"]
  M -->|non| R{"première étape de revue à faire ?"}
  R -->|trouvée| Sr["étape pr-review, qa, pr-demo ou pr-risk"]
  R -->|aucune| Q{"approuvée avec des fixup! ?"}
  Q -->|"oui, moins de 2 tentatives"| Sq["étape squash : git, agent si conflit"]
  Q -->|"oui, 2 tentatives"| Lyours5["à toi, toast une fois"]
  Q -->|non| N{"Sonar noté à toi ?"}
  N -->|oui| Lyours4["à toi"]
  N -->|"non, brouillon"| Ldraft["brouillon"]
  N -->|"non, pas brouillon"| Lok["ok"]
```

L'étape de revue est la première, dans l'ordre `pr-review`, `qa`, `pr-demo`, `pr-risk`, qui n'a pas son marqueur sur la PR et n'a pas été fermée sans commentaire sur ce commit. `pr-demo` seulement si `AGENTS.md` ou `CLAUDE.md` de la branche par défaut a une section `## Demo` (le skill s'arrête sans elle), `qa` seulement si le clone a le skill avec son marqueur. Un brouillon n'a jamais de revue, même avec un check en échec : il reste « brouillon ».

« L'agent lancé tient encore » : une étape de correction (rebase, jenkins, sonar) tant que son agent est `working` ou `blocked` ; `pr-review` tant que son onglet existe (il pose son marqueur avant de corriger) ; les autres étapes de revue tant que leur onglet existe sans leur marqueur. Une étape de revue dont l'onglet est fermé sans marqueur est notée « fermée sans commentaire » pour ce commit : elle ne repart pas, la suivante peut partir, et un nouveau commit la relance.

### Lancement d'une étape

```mermaid
flowchart TD
  S["étape choisie"] --> G{"surveillance coupée, 3 agents de surveillance pris, ou karadoc pris pour pr-demo et qa ?"}
  G -->|oui| W["en attente, ou à toi si Sonar noté à toi"]
  G -->|non| P["tentative comptée pour rebase, jenkins, sonar et squash, onglet noté"]
  P --> C{"clone local trouvé ?"}
  C -->|non| Lnc["pas de clone local, tentative rendue"]
  C -->|oui| F["git fetch origin branche"]
  F --> B{"la branche est checkout ailleurs avec du travail pas poussé ?"}
  B -->|oui| Ly["à toi : tu travailles sur la branche, tentative rendue"]
  B -->|non| X{"worktree -watch existe ?"}
  X -->|non| Add["git worktree add --detach sur origin/branche"]
  X -->|oui| D{"il a des modifs ou des commits pas poussés ?"}
  D -->|oui| Ly2["à toi : worktree de surveillance sale, tentative rendue"]
  D -->|non| Co["git checkout --detach origin/branche"]
  Add --> T["onglet claude en arrière-plan avec le prompt"]
  Co --> T
  T --> Lr["agent en cours"]
```

Une erreur git pendant la préparation donne « erreur », tentative rendue. Le worktree est `~/dev/agents-worktree/<repo>/<branche>-watch`. L'onglet s'appelle `⟳ #<n> <étape>` ; il s'ouvre dans le space déjà ouvert sur ce dossier, sinon dans un nouveau space, sans prendre le focus. Le prompt (`promptFor`) : jenkins lit le log avec `jk log` puis corrige et pousse, ou relance avec `jk run rerun` ; sonar corrige toutes les issues et hotspots ; puis `/pr-review <url> --fix`, `/testing-api-pull-requests <url>` arrêté au rapport, `/pr-demo <url> --narrate --auto` en français (sans attendre l'accord sur le scénario) et `/pr-risk <url>`. Les pushes passent par `git push origin HEAD:refs/heads/<branche>`. Une fois son marqueur posté et son agent arrêté, l'onglet d'une étape de revue (`pr-risk`, `pr-review`, `pr-demo` ; pas `qa`) se ferme à la fin du tour suivant (surveillance allumée), et son space avec s'il était son seul onglet ; de même quand la PR a été mergée ou fermée entre-temps. Une étape de correction (rebase, squash, jenkins, sonar) n'a pas de marqueur : son onglet se ferme dès que son agent est `done` ou `idle` (sans statut, il n'a peut-être pas encore reçu sa tâche). La fermeture vient après les décisions du tour : `decide()` voit encore l'onglet d'un agent qui a poussé puis s'est arrêté, et garde le budget de tentatives. Ce que l'agent a fait se relit depuis sa case dans le panneau `pr`, qui reprend sa session Claude (chaque agent est lancé avec `claude --session-id`, l'id est gardé dans `sessions`). Jamais l'onglet affiché à l'écran, ni un onglet où tu as ouvert un autre pane. La PR d'un onglet se retrouve par son numéro et le dossier de son space (`…/agents-worktree/<repo>/<branche>-watch`). Une étape de revue arrêtée sans marqueur (pr-demo arrêté faute de section `## Demo`, port pris…) garde son onglet, qui dit pourquoi.

Pas d'autre ménage : la surveillance ne supprime aucun worktree, et les onglets `⟳` restés ouverts (qa, une étape arrêtée sans marqueur) sont à toi de fermer. Le seul toast est celui de « à toi » après 2 tentatives de rebase, Jenkins, Sonar ou squash (une fois par étape, jusqu'au retour au vert, à ton push, à la fin du conflit ou des fixups).

## Le registre `shared("pr-watch")`

```js
{
  on: false,          // interrupteur Surveillance ; un registre neuf démarre coupé
  paused: ["owner/repo#N"],
  at: 1763300000000,  // début du dernier tour (ms)
  every: 120000,      // période des tours ; next : quand le minuteur lance le suivant ; running: true pendant un tour (bandeau du panneau)
  agents: { busy: 2, max: 3 },        // agents de surveillance occupés en fin de tour
  karadoc: "⟳ #5471 qa" | null,        // l'onglet qui tient karadoc
  durations: { "agent:qa": [ms, …], "ci:jenkins": [ms, …] }, // 10 dernières durées par étape
  sonarRepos: ["owner/repo"],         // repos où Sonar a déjà rapporté : ailleurs, case sonar en pointillé
  error: null,        // erreur du tour entier (gh search, gh api user), suivie de sa piste (readHint)
  searchFails: 0,     // tours d'affilée où la recherche des PR a échoué : le journal l'écrit au 2e
  journalOn: false,   // `on` vu par le dernier tour, pour journaliser l'interrupteur
  prs: {
    "owner/repo#N": {
      url, title, head,                  // dernier commit de tête vu
      attempts: { jenkins: 0, sonar: 0 },
      told: { jenkins: false, sonar: false }, // toast « à toi » déjà montré
      seen: { jenkins: false, sonar: false }, // ce check a déjà rapporté sur la PR
      launched: { step, head, tab, at } | null, // étape en cours ou dernière lancée, at : son lancement
      silent: { "<sha>": ["pr-demo"] },       // fermées sans commentaire, commit courant seulement
      sessions: { "<étape>": { id, folder, at } }, // dernière session Claude de chaque étape, reprise par le panneau pr
      label, why, error,                      // étiquette, ligne d'explication, erreur de la PR
      band: ["ok", "run", …],                 // 9 cases (3 pour un brouillon) : ok run wait ko me todo skip
      ci: { jenkins: { head, since } | null, sonar }, // check vu tourner depuis since, pour sa durée
      clock: { step, since, readyAt } | { yours: true } | null, // étape en cours, prête à approuver vers
      fixups, draft, approved,                // pour Squasher (une fois approuvée) et Merger quand tout est vert du panneau
      work: { folder, exists } | null,        // dossier qu'ouvrirait ⌨ (null : pas de clone)
    },
  },
}
```

status-jc réécrit tout le registre en fin de tour, sauf `on` et `paused` qu'il relit juste avant d'écrire pour ne pas écraser un clic fait pendant le tour. `prs` est reconstruit à chaque tour avec les seules PR trouvées par la recherche. Le panneau PR lit le registre, n'écrit que `on` (interrupteur) et `paused` (boutons pause et lecture), et demande un tour par `shared("pr-watch-now")`.

La bande, les durées et l'estimation viennent de `pipeline.js`. Une durée d'agent va de son lancement au tour qui le voit s'arrêter (une review seulement avec son marqueur) ; celle de Jenkins ou Sonar du premier tour qui le voit tourner au premier qui le voit fini sur le même commit, ou les horodatages du check-run de Sonar (sans Jenkins, ceux des checks GitHub Actions, sous `ci:jenkins`). L'estimation est la médiane des 10 dernières durées, à partir de 3, et ajoute un passage de CI après un `pr-review` à faire (ses fixups relancent la CI). Le panneau trie les lignes par étiquette : à toi, erreur, pas de clone local, agent en cours, en attente, brouillon, en pause, ok. Sa pastille « Brouillons (N) » masque les brouillons, sauf ceux à toi, en erreur ou sans clone local ; ce choix vit dans `shared("pr-watch-view")`, que status-jc ne réécrit pas. Un clic sur une ligne va à l'agent de `launched.tab` s'il existe, sinon ouvre la PR.

`shared("pr-watch-lease")` vaut `{ at, id }` pendant un tour, `null` sinon.

## Squash à la demande

L'action **Squasher** (confirmée par un second clic) de la ligne Squash ou d'une PR de la Surveillance écrit `{ state: "asked", at }` sous `"<owner>/<repo>#<N>"` dans `shared("pr-squash")`. Toutes les 5 s, `squasher.js` en prend une (`running`), lit la PR avec gh, prépare le worktree de surveillance comme pour un agent (refusé si tu travailles sur la branche sans avoir poussé, si ce worktree est sale, si la PR est en pause ou si un onglet `⟳ #N` est ouvert) et appelle le même `autosquash` que l'étape `squash`, sans attendre d'approbation. Un conflit ouvre l'onglet `⟳ #N squash`. Succès ou agent lancé : l'entrée disparaît ; un échec y laisse `error`, affichée 5 min sous la ligne. Après le push forcé, ton checkout de la branche est en retard : `git pull --rebase` le remet sur la PR.

## Merge armé

Le bouton « Merger quand tout est vert » du résumé de la PR (panneau `pr`) écrit la PR dans `shared("pr-merge")` : `{ "<owner>/<repo>#<N>": { head, at, why, error } }`, `head` étant le commit de tête au moment du clic, et `at` l'heure du clic. Ce mod le relit toutes les minutes, sans appel gh si rien n'est armé, que la surveillance soit coupée ou non et quel que soit l'auteur de la PR. Pour chaque PR, `gh pr view --json state,headRefOid,statusCheckRollup,commits` puis `mergeStep` :

| Situation | Effet |
|---|---|
| PR fusionnée ou fermée | désarmée, sans toast |
| commit de tête ≠ celui armé | désarmée, toast « nouveau commit, merge annulé » |
| un commit `fixup!`, `amend!` ou `squash!` | désarmée, toast |
| aucun check, un check en cours ou en échec | on attend (`why` le dit au panneau) ; un build instable relancé peut repasser vert |
| un `Jenkinsfile` au commit de tête, mais Jenkins n'a pas encore rapporté (build en file) | on attend |
| tout vert | `gh pr merge --rebase --match-head-commit <head armé>` ; succès : désarmée, toast « fusionnée » (un échec sur une PR déjà `MERGED` compte comme un succès) ; refus : toast « merge refusé », l'entrée reste avec `refused` et l'erreur, plus jamais retentée, jusqu'à **Effacer** dans le panneau |
| `gh pr view` échoue | toujours armée, `error` gardée, sans toast |

En fin de tour, `applyResults` ne modifie une entrée que si son `at` n'a pas changé : un désarmement ou un nouvel armement fait pendant le tour l'emporte. Le tour revérifie aussi `at` juste avant un toast ou un merge. Un bail `shared("pr-merge-lease")`, renouvelé à chaque PR, évite deux merges par deux copies du mod.

## Travailler sur une PR

Le bouton ⌨ « Travailler dessus » d'une ligne de la Surveillance (panneau PR) écrit `{ state: "asked" }` sous la clé de la PR (`owner/repo#N`) dans `shared("pr-open")`. Un minuteur de 5 s (`opener.js`) la prend, une à la fois :

| PR | Worktree | Pause |
|---|---|---|
| brouillon | celui de la branche ; sinon `wt switch <branche> --no-cd` le crée | aucune (la surveillance ne fait rien sur un brouillon) |
| prête | `…/agents-worktree/<repo>/<branche>-watch` tel quel, jamais remis sur origin ; absent : recréé détaché sur `origin/<branche>` | ajoutée à `pr-watch.paused`, entrée `held` avec le dossier |

Un espace local déjà sur ce dossier est sélectionné, sinon un espace s'ouvre avec `claude`. Dès qu'aucun espace local (son dossier ou le cwd d'une de ses panes, sous-dossiers compris, `~/dev` comme `/Volumes/sourcecode`) ne montre plus le dossier d'une entrée `held`, la pause est levée et l'entrée effacée ; rien n'est levé tant que le layout local n'est pas lu (démarrage, reconnexion). Une PR déjà en pause à la main n'est pas `held` : elle reste en pause. Un nouveau clic sur une PR `held` garde la pause à l'ouverture, même si la réouverture échoue. Un tour de surveillance relit la pause juste avant de décider puis avant de lancer : un clic pendant le tour suffit. Une erreur (pas de clone local, gh, git, wt) devient `{ state: "error", error }`, affichée 5 min sur la ligne ; rien n'est ouvert ni mis en pause.

Deux copies de `status-jc` : la demande passe à `opening` avec l'id de la copie avant tout appel, l'autre la laisse. Une ouverture de plus de 15 min (copie morte) redevient demandée. L'état vit hors de `pr-watch` : le tour de surveillance réécrit ce registre en fin de tour (il garde `on` et `paused`).

## Journal

Chaque tour de surveillance et chaque merge armé ajoutent leurs lignes à `~/Library/Logs/herdr-watch.log` (`AAAA-MM-JJ HH:MM  owner/repo#N  texte`, `-` à la place de la PR pour l'interrupteur), que le panneau Journal (`mods/journal/`) affiche. Au plus une ligne par PR et par tour, et seulement surveillance active : un agent lancé (`agent <étape> lancé`, même quand deux s'enchaînent sous « agent en cours »), sinon un changement d'étiquette (`<étiquette> : <pourquoi>`, ou le pourquoi seul quand il commence par l'étiquette ; ce qui dit aussi la fin d'un agent), sinon le toast du tour. Une PR qui alterne entre deux étiquettes sur le même commit ne remplit plus le journal : un changement d'étiquette qui redonne l'une de ses deux dernières lignes (gardées dans `logged` de son entrée, avec le commit de tête) n'est pas réécrit si ces deux lignes sont du même commit, sans lancement d'agent ni ligne urgente. Un nouveau push, un agent lancé ou une ligne « à toi », « erreur » ou « merge refusé » s'écrit toujours. Une PR que GitHub n'a pas pu lire dit pourquoi et quoi faire (`readHint` de `watch.js`, d'après la 1re ligne de l'erreur de gh : « réseau ou VPN ? », « connexion gh expirée, lance gh auth status », limite de l'API, PR introuvable, sinon « réessayé au prochain tour » ; un jeton refusé par le SAML de l'organisation et un `gh` absent du PATH ont leur propre piste) et attend son 2e tour d'erreur d'affilée (`errorRounds`, compté par `decide`) : un raté passager n'écrit rien. Quand toutes les PR surveillées échouent (au moins 2), c'est GitHub : une seule ligne `erreur : GitHub injoignable depuis 2 tours, N PR non lues`, sans clé de PR. Quand c'est la recherche des PR elle-même qui échoue (réseau coupé, `gh` déconnecté : le cas le plus courant, le tour s'arrête avant toute PR), une ligne `erreur : recherche des PR sur GitHub impossible : <piste>` s'écrit au 2e échec d'affilée. La ligne de panne s'écrit une fois par panne ; une PR encore en erreur quand la panne finit a ensuite sa propre ligne, une fois. Le retour à l'état écrit avant l'erreur ne s'écrit pas. Les autres erreurs (squash refusé, surveillance plantée sur une PR) s'écrivent tout de suite. Une PR nouvelle écrit son état, une PR qui sort de la recherche `sortie de la surveillance`. L'interrupteur est écrit au tour suivant, en comparant `on` au `journalOn` gardé dans le registre (jusqu'à 2 min de retard, un aller-retour rapide est perdu). Le merge écrit `fusionnée` ou `merge refusé : <erreur>`. Une écriture ratée part dans la console du mod, le tour continue. Après chaque écriture, le nombre de lignes du fichier (`wc -l`) part dans `shared("journal-lines")`, et les numéros des lignes qui demandent d'agir (« à toi », « erreur », « merge refusé » : `urgent()` de `journal.js`, les 200 derniers) dans `shared("journal-urgent")`, pour la pastille du bouton Journal. Le fichier n'est jamais tronqué.

## Fichiers et tests

| Fichier | Rôle |
|---|---|
| `mod.json` | Origine du clone (`workspace-status` 0.1.15). |
| `main.js` | La vue : barre d'état, minuteurs des ports (5 s), de la surveillance (60 s puis 2 min, et la demande de tour relevée toutes les 5 s), du merge armé (1 min), des ouvertures et des squashs (5 s), écriture du registre. |
| `ports.js` | Fonctions pures des ports : lecture de lsof et ps, space d'un listener, santé, quoi interroger. |
| `watch.js` | Fonctions pures de la surveillance : signaux d'une PR, `decide`, prompts, lecture de git. Sans import Herdr. |
| `pipeline.js` | Fonctions pures de la bande d'étapes : cases, mesures de durée, médiane, estimation, worktree de ⌨. Sans import Herdr. |
| `watcher.js` | Un tour : bail, appels gh et git, clone local, worktree `-watch`, ouverture des onglets. |
| `merge.js` | Fonctions pures du merge armé : `mergeStep`, `applyResults`. Sans import Herdr. |
| `merger.js` | Un tour de merge armé : bail, appels gh, toasts. |
| `squasher.js` | Un passage de squash à la demande : demande du panneau, gh, worktree, `autosquash`, agent sur conflit. |
| `open.js` | Fonctions pures de l'ouverture : chemin du `-watch`, pause posée, pauses à lever. Sans import Herdr. |
| `opener.js` | Un passage d'ouverture : demande, gh, worktree, espace, pause. |
| `journal.js` | Fonctions pures du journal : lignes d'un tour, format d'une ligne. Sans import Herdr. |
| `journal-file.js` | Ajout des lignes au fichier du journal. |
| `ports.test.mjs`, `watch.test.mjs`, `pipeline.test.mjs`, `merge.test.mjs`, `open.test.mjs`, `journal.test.mjs` | Tests `node:test` des fichiers purs. |

```sh
node --test ~/.config/herdr-app/mods/status-jc/*.test.mjs
herdr-app check ~/.config/herdr-app/mods/status-jc
```

`watcher.js`, `merger.js`, `squasher.js` et `main.js` n'ont pas de test : ils parlent à Herdr, gh et git.

## À savoir

- Herdr refuse un import hors du dossier du mod (`resolves outside the application directory`). D'où `jenkinsBuild` et `checks` copiés depuis `mods/pr/model.js`, et les étiquettes recopiées dans le panneau : renommer une étiquette dans `LABELS` sans toucher `looks` de `mods/pr/main.js` la classe en dernier.
- `shared()` est persisté par Herdr dans `~/.config/herdr-app/shared.json` : le registre, l'interrupteur et les pauses survivent à un redémarrage. La pause n'est jamais nettoyée, exprès : une PR calme sortirait de la recherche à 7 jours et perdrait sa pause.
- La surveillance est ici et pas dans le panneau parce qu'une copie de mod ne démarre qu'à son premier affichage ; la barre d'état est toujours affichée dans `jc`. Deux copies (deux fenêtres, changement de layout) : le bail évite les doubles lancements.
- `tab.new` ne rend pas d'id : les onglets sont retrouvés par leur nom `⟳ #<n> <étape>`. Ne pas les renommer.
- Un Claude qui attend une réponse texte (scénario de `pr-demo` à approuver) se lit `idle` ou `done`, pas `blocked` : d'où les étapes de revue qui tiennent la PR tant que leur onglet existe.
- Pas de `structuredClone` dans le runtime Herdr : `decide` copie l'entrée en JSON. Pas de `setTimeout` : `cx.timer`.
- `pr-demo` et `qa` démarrent karadoc sur des ports fixes : un seul des deux à la fois, toutes PR confondues, et seulement pour un repo dont le clone a un dossier `karadoc/` (arthur) ; ailleurs (ordostruct…) ils partent sans attendre karadoc.
- Jenkins n'est lisible qu'avec le VPN ; sans, l'agent jenkins doit le dire et s'arrêter.
- Le login GitHub (`gh api user`) et les clones trouvés sont gardés en mémoire jusqu'au redémarrage du mod.
- Un worktree `-watch` laissé avec du travail pas poussé bloque la PR en « à toi » jusqu'à ce que tu le pousses ou le nettoies.

## Conception

- [Surveillance des PR](../../docs/2026-11-14-pr-watch-design.md) et son [plan](../../docs/2026-11-14-pr-watch-plan.md)
- [Mettre une PR en pause](../../docs/2026-11-16-pr-watch-pause-design.md)
- [Ne pas lancer d'agent sur une branche où je travaille](../../docs/2026-11-16-pr-watch-busy-branch-design.md)
- [Merge armé](../../docs/2026-11-17-pr-armed-merge-design.md)
- [Journal](../../docs/2026-11-18-watch-journal-design.md)

Les conceptions peuvent être en retard sur le code : le code fait foi.
