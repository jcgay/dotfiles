# Ne pas attendre d'approbation quand pr-risk n'en demande pas

Complète `2026-11-20-pr-watch-pipeline-design.md`.

## Pourquoi

Une PR jugée Low par `pr-risk` (0 revue humaine) reste bloquée sur la case `appr` : la surveillance
attend une approbation qui ne viendra pas forcément, et ne squashe pas ses fixups avant. Je veux
qu'elle aille jusqu'à « prête à merger » sans moi, à condition que le verdict porte sur le code du
head. Le merge reste à moi pour l'instant : je veux observer le comportement dans le temps avant de
le confier à la surveillance.

## Ce qui change

- **`pr-risk` dit sur quoi porte son verdict.** En mode PR, la 2e ligne du commentaire devient
  `<!-- pr-risk-head: <sha complet du head analysé> -->`. La 1re reste `<!-- pr-risk -->`
  (`gh-pr-upsert-comment` et `MARKERS` la comparent telle quelle).
- **La surveillance lit le verdict.** Dans mon commentaire `pr-risk` : le nombre d'humains du titre
  `## PR risk: <TIER> · <N> human review(s)` et le sha de `pr-risk-head`.
- **« Sur le head » = même arbre.** Le verdict vaut si l'arbre de son sha est celui du head
  (`tree.sha` de `gh api repos/<o>/<r>/commits/<sha>`). Le squash garde l'arbre (`autosquash` le
  vérifie déjà) : le verdict d'avant le squash vaut encore après.
- **Verdict à 0 humain sur le head :** la case `appr` est `ok`, la PR squashe ses fixups comme une
  PR approuvée (même étape `squash`, même budget de 2), puis finit « ok » avec un pourquoi qui le
  dit (« pr-risk : 0 revue humaine, merge à toi »). Le merge n'est jamais armé seul.
- **Verdict périmé (arbre différent) :** la surveillance relance `pr-risk` sur le head, comme si
  son marqueur manquait, tant que la PR n'est pas approuvée par un humain.
- **Rien ne change** pour un verdict à 1 ou 2 humains, ni pour une PR approuvée.

## Approches

- **Retenue :** le commentaire porte son sha, la surveillance compare les arbres. Le verdict
  prouve lui-même ce qu'il couvre, `pr-risk` lancé à la main compris.
- Rejetée : la surveillance retient le head qu'elle a donné à `pr-risk` (`launched.head`). Pas de
  changement du skill, mais un `pr-risk` lancé à la main ne compte pas et le lien vit dans le
  registre.
- Rejetée : comparer les dates du commentaire et du dernier commit. Un rebase garde les dates, et
  l'heure du push n'est pas connue.

## Mes choix (à corriger)

- Un commentaire sans `pr-risk-head` (posté avant ce changement) : traité comme aujourd'hui,
  attente de l'approbation, sans relance.
- La relance d'un verdict périmé se limite aux PR non approuvées : sur une PR approuvée, le verdict
  ne décide plus rien.
- Le panneau `pr` : `STEP_HELP.appr`, `LABEL_HELP`/`STATE_HELP` si besoin, et les READMEs (`pr`,
  `status-jc`, `.config/herdr-app/README.md`) disent le nouveau cas.

## Laissé au builder

- Où lire l'arbre du head (même appel `gh api` ou `gh pr view`) et le cache par sha pour ne pas
  refaire l'appel à chaque tour.
- La lecture du verdict en fonction pure de `watch.js`, testée dans `watch.test.mjs` (0, 1, 2
  humains, sans sha, sha périmé) ; `decide()` et `bandOf()` testés pour le nouveau cas.
