# Ne pas lancer d'agent sur une branche où je travaille

Complète `2026-11-14-pr-watch-design.md` et `2026-11-16-pr-watch-pause-design.md`.

## Pourquoi

Le 16 novembre, sur `vidal-data-aggregator-intl`, la branche `all-monograph` était checkout dans
mon clone principal (le dossier de mon space), avec du travail pas encore poussé. La surveillance
a préparé `all-monograph-watch` à côté et son agent a refait ce que j'avais déjà fait, en
consommant des tokens. Elle ne regarde que son propre worktree, jamais les autres checkouts de la
branche ; la pause manuelle aurait suffi, mais il faut y penser avant le tour suivant.

## Ce qui change

- Juste avant de lancer un agent, après le `fetch` de la branche, la surveillance cherche les
  checkouts de la branche de la PR dans le clone (`git worktree list --porcelain` : le clone
  principal et ses worktrees). Le worktree `-watch` est détaché, il n'en fait pas partie.
- **Je travaille dessus** quand l'un d'eux a des fichiers modifiés (`git status --porcelain`) ou
  des commits absents de `origin` (`git rev-list HEAD --not --remotes=origin`).
- Alors aucun agent ne part : la PR passe « à toi », ligne « tu travailles sur <branche> dans
  <nom du dossier> (non poussé) », sans toast. Comme pour un worktree `-watch` sale
  (`undoLaunch`), rien n'est compté.
- Le tour suivant revérifie : une fois tout poussé, la surveillance reprend seule.
- Une branche seulement checkout, propre et poussée, ne bloque rien.

## Approches

- **A. Vérifier juste avant le lancement** (retenue), à côté du test du worktree `-watch` sale :
  des appels git seulement quand un agent allait partir.
- B. Vérifier à chaque tour pour chaque PR : étiquette toujours juste, mais quelques appels git par
  PR toutes les 5 minutes pour une info qui ne sert qu'au lancement.
- C. Mettre la PR en pause automatiquement : la pause ne se lèverait plus seule quand je pousse,
  et mêlerait mes pauses à celles de la surveillance.

## Non-objectifs

- « Je viens de pousser mais je n'ai pas fini » : non détecté (choix assumé, à revoir si ça
  arrive souvent).
- Arrêter un agent déjà lancé.

## Laissé au constructeur

- La lecture de `git worktree list --porcelain` est une fonction pure de `watch.js`, testée : les
  dossiers dont la ligne `branch` vaut `refs/heads/<branche>`.
- Un checkout listé mais absent (worktree `prunable`) ou où git échoue est ignoré : il ne bloque
  pas la PR.
- README Herdr et doc de conception du 14 à mettre à jour.
