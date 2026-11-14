# Surveillance des PR depuis le panneau PR

Conception du 14 novembre 2026. Elle fait évoluer le mod `mods/pr/`, le panneau PR du layout
`jc` (voir `e5514bd`, `923e142`).

## Pourquoi

Aujourd'hui, le panneau affiche la PR du space qu'on regarde, et seulement pendant qu'on le
regarde. Tout le reste se fait à la main : voir qu'un build Jenkins a cassé, aller lire le log,
corriger, relancer ; voir qu'une analyse Sonar a remonté des problèmes ; penser à lancer `pr-risk`
puis la QA quand la PR est prête.

Le panneau devient un surveillant. Il suit mes PR ouvertes, même quand il est fermé et même
quand elles n'ont pas de space, et il lance de lui-même un agent Claude visible pour chacune de
ces trois situations :

1. le build Jenkins est en échec : l'agent enquête et corrige si besoin ;
2. Sonar remonte des problèmes, même si le quality gate passe : l'agent les corrige ;
3. tout est vert et la PR n'est plus en brouillon : l'agent lance `pr-risk`, puis `pr-demo`,
   puis `testing-api-pull-requests` si le dépôt contient ce skill, chacun seulement s'il n'a pas
   déjà commenté la PR.

## Objectifs

- **Quelles PR** : `gh search prs --author=@me --state=open --owner=softwarevidal
  --updated=>=<aujourd'hui − 7 j>`. Une vieille PR oubliée ne déclenche rien ; un nouveau push la
  réveille.
- **Quand** : un tour de surveillance toutes les 5 minutes, dès le lancement de l'application,
  que le panneau ait été ouvert ou non. *(Choix validé)* Une copie de mod ne démarre qu'à son
  premier affichage et repart de zéro à un changement de layout (`AGENTS.md`) : le tour tourne
  donc depuis `status-jc`, toujours affiché dans le layout `jc`, avec tout le code de
  surveillance dans `mods/status-jc/` (`watch.js` pour les décisions pures, `watcher.js` pour les
  effets d'un tour, les minuteurs dans `main.js`) : Herdr refuse un import hors du dossier du mod
  (`herdr-app check` : « resolves outside the application directory »). Le panneau `pr` lit le
  registre pour afficher l'état. Un
  seul hôte du tour : le panneau ne lance jamais d'agent lui-même. L'affichage détaillé de la PR
  du space courant garde son comportement actuel : mise à jour à l'ouverture du panneau, au
  changement de space ou de pane, et par « Rafraîchir ».
- **Les déclencheurs**, sur le commit de tête de chaque PR :
  - **Jenkins** : le check `continuous-integration/jenkins/…` est `ko` au sens de `checks()`
    (`FAILURE`, `ERROR`…). Un check encore en cours ne déclenche rien.
  - **Sonar** : le check-run `SonarCloud Code Analysis`, lu par
    `gh api repos/<owner>/<repo>/commits/<sha>/check-runs`. Il déclenche si sa `conclusion` est
    `failure`, ou si son `output.summary` annonce au moins une issue ou un hotspot nouveau
    (`[N New issues]`, `[N Security Hotspots]` avec N > 0). Ce résumé est le format SonarCloud
    constaté le 14/11/2026 sur arthur#5458 (passé, 0 issue) et #5449 (échoué) ; s'il ne se lit
    pas, on se rabat sur la seule `conclusion`.
  - **Revue** : la PR n'est pas en brouillon, au moins un check a rapporté sur le commit de tête
    et aucun check n'est `ko` ni en cours. Trois étapes,
    une par tour et dans cet ordre, chacune sautée si la PR a déjà un commentaire à moi qui
    commence par son marqueur :
    1. `/pr-risk` — marqueur `<!-- pr-risk -->` (déjà en place) ;
    2. `/pr-demo` — marqueur `<!-- pr-demo -->` (déjà en place). Le skill attend que j'approuve
       son scénario avant de démarrer quoi que ce soit (garde-fou non négociable du skill) :
       l'agent reste `blocked` et Herdr me prévient. S'il n'y a rien à montrer, il s'arrête sans
       commenter ;
    3. `/testing-api-pull-requests`, seulement si le dépôt a ce skill et que son modèle de rapport
       porte le marqueur (`.agents/skills/testing-api-pull-requests/references/report.md` ou
       `.claude/skills/…`) — marqueur `<!-- testing-api-pull-requests -->`. Sans marqueur, la QA
       serait relancée à chaque commit de tête. *(Choix validé)* Le prompt lui demande de
       s'arrêter au rapport posté (étape 7) : ni correction ni push ; les corrections restent mon
       choix, en réponse au rapport.

    C'est GitHub qui fait foi : une étape lancée à la main ou depuis une autre machine compte.
  - **Un seul karadoc à la fois** *(décision de conception)* : `pr-demo` et la QA démarrent
    l'application sur des ports fixes (8108, 8098, 8888 pour arthur) et s'arrêtent si un port est
    pris. Au plus un agent `pr-demo` ou QA tourne, toutes PR confondues ; un agent `blocked`
    (scénario à approuver) garde sa place.
- **Marqueur QA** : `testing-api-pull-requests` ne signe pas encore son rapport. On ajoute la
  ligne `<!-- testing-api-pull-requests -->` en tête du rapport dans
  `.agents/skills/testing-api-pull-requests/references/report.md` (dépôt arthur, sa propre PR).
- **Agents visibles** : chaque lancement ouvre un onglet Herdr avec Claude et un premier message
  envoyé (`tab.new { space, folder, name, argv: ["claude"], task }`), nommé de façon
  reconnaissable (`⟳ #5462 jenkins`) pour que le mod le retrouve dans `agents()` par
  `tab_name` (`tab.new` ne rend pas d'id).
  - *(Choix validé)* **Jamais dans mon worktree.** Les agents de surveillance travaillent dans
    un worktree à eux, un par PR, détaché sur `origin/<branche>` (git refuse une branche
    extraite deux fois) : `~/dev/agents-worktree/<repo>/<branche>-watch`, créé depuis un clone
    local du dépôt par `git worktree add --detach`. Mes commits non poussés et mon Claude au
    travail sur la branche ne sont jamais touchés ; je récupère les commits de l'agent par un
    pull. Le coût : un worktree de plus, avec son premier build.
  - Le worktree de surveillance est réutilisé d'une étape à l'autre : avant chaque lancement,
    `git fetch` puis `git checkout --detach origin/<branche>`. S'il a des modifications non
    commitées ou des commits non poussés laissés par un agent précédent, on ne lance pas et la
    PR passe « à toi ». Non poussé veut dire : ni sur origin, ni sur une ancienne valeur de
    `origin/<branche>` (son reflog), ni sur ce que la surveillance a extrait (reflog de `HEAD`) ;
    un rebase suivi d'un push forcé de ma part ne bloque donc pas la PR.
  - Un space Herdr par worktree de surveillance (`space.new { folder, argv: ["claude"], task }`
    au premier lancement), puis un onglet par agent (`tab.new { space, … }`).
  - Sans clone local trouvé, la PR est affichée « pas de clone local » et rien n'est lancé.
- **Un seul agent à la fois par PR**, et **au plus 3 agents de surveillance en même temps**.
  Au-delà, les déclencheurs attendent le tour suivant. Un agent « tourne » tant que son onglet
  existe et que son statut est `working` ou `blocked` ; un agent de revue, tant que son onglet
  existe sans que son marqueur soit sur la PR (voir « Enchaînement »). Tous les onglets
  `⟳ #<n> …` de la PR comptent, pas seulement le dernier lancé. Un bail `shared("pr-watch-lease")`
  empêche deux tours de tourner en même temps.
- **Priorité dans une PR** : Jenkins avant Sonar (un build cassé fausse souvent l'analyse), et la
  revue seulement quand tout est vert (voir « Enchaînement »).
- **Budget** : une tentative, c'est un agent lancé pour réparer un check donné (Jenkins ou Sonar)
  d'une PR donnée. Après 2 tentatives sans que ce check repasse au vert, le mod ne relance plus
  pour ce check : la PR est marquée « à toi » dans le panneau, avec un toast. Le compteur repart à
  zéro quand le check repasse au vert, ou quand je pousse moi-même. *(Décision de conception)*
  Pour distinguer mon push de celui de l'agent (même identité git) : le registre note, pour
  chaque tentative, le commit de tête au lancement ; tout commit de tête apparu tant que l'onglet
  de cet agent de correction existe, quel que soit son statut (`done` compris), est à l'agent. Un nouveau
  commit de tête vu sans onglet de surveillance ouvert pour la PR est à moi. Les lancements de
  revue (`pr-risk`, QA) ne sont pas comptés : le marqueur suffit à ne pas les répéter.
- **Enchaînement** *(décision de conception)* :
  - Jenkins `ko`, qu'un agent tourne ou qu'il soit « à toi » : rien d'autre ne se lance sur la PR.
  - Sonar à corriger (Jenkins vert) : la revue attend. Si Sonar passe « à toi » mais que son
    quality gate est vert, la revue se lance quand même ; s'il est rouge, elle attend.
  - Un autre check `ko` (ni Jenkins ni Sonar, que personne ne corrige ici) : la revue attend et la
    PR passe « à toi », sans toast. Avec plusieurs contextes Jenkins, un contexte `ko` l'emporte.
  - Un agent de revue (`pr-risk`, `pr-demo`, QA) sans son marqueur sur la PR garde la PR, et pour
    `pr-demo` et la QA la place de karadoc, tant que son onglet existe, quel que soit son statut :
    un Claude qui attend une réponse texte (l'approbation du scénario de `pr-demo`) se lit
    `done`/`idle`, pas `blocked`. L'étape finit quand son marqueur apparaît, ou quand je ferme
    l'onglet : elle est alors « terminée sans commentaire » pour ce commit (cas normal de
    `pr-demo` sans rien à montrer), n'est pas relancée, et la suivante peut partir. Pas de toast.
    Une étape de correction (Jenkins, Sonar) finit dès que son agent n'est plus `working` ou
    `blocked`. La liste des étapes lancées vit dans le registre, par commit de
    tête : un nouveau push ne relance pas une étape déjà commentée, mais en relance une
    terminée sans commentaire.
- **Ce que l'agent fait** : il pousse lui-même sur la branche de la PR, avec une refspec
  explicite (`git push origin HEAD:refs/heads/<branche>`). Pour Jenkins, il lit le log
  (`jk run log`), corrige si l'échec vient du code de la PR, et relance le build (`jk run rerun`)
  si l'échec vient de l'infrastructure ou d'un test instable. Pour Sonar, il lit les issues de la
  PR (MCP ou CLI Sonar, avec la clé de PR) et les corrige toutes, bloquantes ou non. Les messages
  de départ sont écrits dans `watch.js` et testés.
- **Registre** : l'état partagé `shared("pr-watch")`, que Herdr persiste et que
  tous les mods peuvent lire (le panneau `pr` ne fait que le lire et basculer `on`), garde, par PR, les tentatives par check, le dernier commit vu et l'état « à toi ». Il survit à un
  redémarrage de l'application. Le runtime de Herdr n'a pas `structuredClone` : les entrées sont
  copiées en JSON. Le champ `seen` d'une entrée fait compter comme « en cours » un check qui a déjà
  rapporté et manque sur un nouveau commit, pour ne pas remettre le budget à zéro tant que la CI
  n'a pas rapporté.
- **Interrupteur** : un bouton du panneau coupe ou relance la surveillance ; l'état est gardé dans
  le registre. Un registre neuf démarre coupé. Coupée, rien n'est lancé, l'affichage continue.
- **Dans le panneau** : sous la PR courante, une section « Surveillance » liste les PR suivies
  avec leur état en un mot (`ok`, `en attente`, `agent en cours`, `à toi`, `pas de clone local`),
  et l'âge du dernier tour (« dernier tour il y a N min ») pour voir une surveillance arrêtée ;
  un clic sur une PR avec un agent montre son onglet (`agent.focus`), un clic sur « à toi » ouvre
  la PR.

## Non-objectifs

- Les PR des autres, les revues demandées, les commentaires de revue à traiter.
- Les PR hors de l'organisation softwarevidal.
- D'autres machines que celle-ci (`on`) : les agents se lancent en local.
- Fusionner une PR, la sortir du brouillon, changer ses labels ou son titre.
- Fermer les onglets des agents : ils restent ouverts, je les ferme moi-même.
- Un budget en temps ou en tokens.

## Anti-objectifs (un échec même si ça marche)

- **Un agent lancé en boucle** sur le même problème, ou deux agents à la fois sur la même PR.
- **Un `pr-risk` ou une QA lancé deux fois** pour la même PR.
- **Un push ailleurs que sur la branche de la PR** (voir la mémoire « A push retargets master in
  arthur ») ou un push forcé.
- **Un échec silencieux** : gh, jk ou wt qui échoue doit se voir dans le panneau, pas
  simplement ne rien lancer.
- Bloquer l'interface : tous les appels passent par `exec` dans `cx.spawn`.

## Contraintes

- macOS, Herdr 0.1.15, mods en JavaScript gpui-kit (`AGENTS.md`, `herdr.d.ts`,
  `gpui-kit.d.ts`). Pas de `setTimeout` : `cx.timer`. Une copie masquée du mod garde ses
  minuteurs.
- Clone `jc`/`pr` seulement, jamais les layouts ou mods livrés. `herdr-app check` et
  `node --test mods/pr/*.test.mjs` passent.
- Jenkins n'est joignable qu'avec le VPN : hors VPN, le déclencheur Jenkins se lit encore sur le
  check GitHub, mais l'agent ne pourra pas lire le log. Le prompt le lui dit.
- Débit GitHub : une recherche + un appel check-runs et un appel commentaires par PR suivie, toutes
  les 5 minutes, pour une vingtaine de PR, reste loin des 5 000 requêtes/heure.

## Approches considérées

- **A. Tout dans le mod `pr`** *(retenue)*. Il connaît déjà gh, jk et Herdr ; décisions pures
  dans `model.js`, testées avec `node --test`. Rien ne tourne application fermée, mais les agents
  visibles en ont besoin de toute façon. Amendée ensuite : le tour est hébergé par `status-jc`
  (toujours affiché) avec tout le code de surveillance dans `mods/status-jc/`, parce qu'une copie du
  panneau ne démarre qu'à son premier affichage et que Herdr refuse les imports hors du dossier
  d'un mod ; le registre est `shared("pr-watch")`.
- **B. Un mod de surveillance invisible séparé du panneau.** Plus de séparation, mais deux mods
  doivent partager un état sans API pour ça : plus de code pour le même résultat.
- **C. Un démon hors de Herdr (launchd).** Tourne application fermée, mais doit piloter Herdr de
  l'extérieur pour ouvrir les onglets et duplique la logique gh/jk. Contraire aux agents visibles.

## Ce qui est laissé au constructeur

- Le découpage exact de `model.js` (fonctions pures : sélection des déclencheurs, budget, lecture
  du résumé Sonar, construction des prompts) et la forme du registre.
- Comment trouver le clone local d'un dépôt pour une PR sans space (dossiers des spaces ouverts,
  `wt list`, répertoires connus) ; l'important est de ne rien lancer quand on n'en trouve pas.
- Le texte exact des prompts, dans l'esprit de « Ce que l'agent fait ».
- La forme du toast « à toi » (mod `toast` ou `playSound`).
