# Rebase and merge quand tout est vert

Conception du 17 novembre 2026. Touche le panneau `pr` (résumé de la PR) et `status-jc`.
Revient sur un non-objectif de `2026-11-14-pr-watch-design.md` (« Fusionner une PR ») :
seulement à ma demande explicite, PR par PR.

## Pourquoi

Une PR est approuvée, il ne manque que le dernier build Jenkins. Aujourd'hui je dois guetter la
fin du build pour cliquer sur « Rebase and merge ». Je veux armer le merge depuis le résumé de la
PR et passer à autre chose. Cas d'origine : une PR renovate d'ordostruct (`renovate-com.diff…`),
dont je ne suis pas l'auteur.

## Objectifs

- Dans le résumé de la PR (haut du panneau `pr`), sur une PR ouverte : un bouton « Merger quand
  tout est vert ». Une fois armé : « Merge armé » et un ✕ pour désarmer, plus l'erreur éventuelle
  du dernier essai.
- Le merge part tout seul, `gh pr merge <N> -R <repo> --rebase`, quand sur le commit de tête au
  moins un check a rapporté, aucun n'est en cours et aucun n'est `ko` (au sens de `checks()`).
- Ça marche panneau fermé, après un redémarrage d'Herdr, et quel que soit l'auteur de la PR.
- Toast à la fin : « PR #N fusionnée », ou l'échec.

## Non-objectifs

- D'autres actions que le rebase and merge (squash, fermer, commenter…) : on ajoutera quand le
  besoin viendra.
- Vérifier l'approbation : GitHub refuse le merge si une règle l'exige, l'erreur s'affiche.
- Lancer les étapes de la surveillance (`pr-risk`, `pr-demo`…) : le merge armé en est indépendant.

## Anti-objectifs

- **Merger autre chose que ce que j'ai regardé** : l'armement retient le commit de tête. Un
  nouveau commit de tête désarme, avec un toast ; je réarme si je veux.
- **Des commits `fixup!` / `amend!` / `squash!` sur master** : s'il y en a dans la PR, pas de merge, désarmé,
  toast.
- **Un merge en double** si deux copies de `status-jc` tournent.
- **Un échec silencieux** : toute erreur de gh se voit dans le résumé et en toast.

## Approches

- **A. Le panneau arme, `status-jc` exécute** *(retenue)*. Le bouton écrit dans
  `shared("pr-merge")` ; `status-jc`, toujours affiché, relit les PR armées toutes les minutes.
  Survit au panneau fermé et au redémarrage, indépendant de la recherche `--author=@me`.
- B. Le panneau fait tout avec son minuteur : une copie du panneau ne démarre qu'à son premier
  affichage, donc après un redémarrage rien ne fusionne tant que je ne l'ai pas rouvert.
- Auto-merge natif GitHub : désactivé sur arthur et vidal-data-aggregator-intl, et arthur n'a aucun
  check obligatoire sur master (GitHub fusionnerait tout de suite).
- Un agent Claude qui guette : des tokens pour un `gh pr merge`.

## Comportement

Registre `shared("pr-merge")` : `{ "<owner>/<repo>#<N>": { head, at, error } }`, écrit par le
panneau (armer, désarmer) et par `status-jc` (résultat). Le panneau n'exécute rien.

Toutes les 60 s, si le registre n'est pas vide, `status-jc`, pour chaque PR armée :
`gh pr view <N> -R <repo> --json state,headRefOid,statusCheckRollup,commits`, puis une décision pure :

| Situation | Effet |
|---|---|
| PR fusionnée ou fermée | désarmée, sans toast (fusionnée à la main) |
| commit de tête ≠ celui armé | désarmée, toast « nouveau commit, merge annulé » |
| un commit `fixup!`, `amend!` ou `squash!` | désarmée, toast |
| un check en cours, ou aucun check | rien, on attend |
| un `Jenkinsfile` au commit de tête et aucun check Jenkins encore posé (build en file) | rien, on attend |
| un check `ko` | rien, on attend (je peux relancer un build instable) ; le résumé le dit |
| tout vert | `gh pr merge --rebase --match-head-commit <head armé>` ; succès : désarmée + toast ; refus : toast, l'entrée reste marquée refusée avec l'erreur (plus retentée) jusqu'à ce que je l'efface (✕) |
| gh view échoue | erreur gardée, toujours armée, réessai à la minute suivante |

## Ce qui est laissé au constructeur (mes choix, à corriger si besoin)

- Décision pure dans `mods/status-jc/merge.js` + `merge.test.mjs` ; effets et minuteur à côté de
  ceux de la surveillance (`watcher.js`, `main.js`). `checks()` est déjà copié dans `watch.js`.
- Doublon : un bail `shared("pr-merge-lease")` comme `pr-watch-lease` ; un échec de merge sur une
  PR déjà `MERGED` compte comme un succès.
- La PR du résumé est celle de `gh pr view` dans le dossier courant (`pr.url` donne le dépôt).
- README `pr`, README `status-jc` et `.config/herdr-app/README.md` à mettre à jour.
