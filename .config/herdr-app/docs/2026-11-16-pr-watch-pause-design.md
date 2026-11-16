# Mettre une PR en pause dans la surveillance

Complète `2026-11-14-pr-watch-design.md`.

## Pourquoi

L'interrupteur « Surveillance » coupe tout. Je veux arrêter une seule PR :

- quand je travaille moi-même dessus et ne veux pas d'agent qui pousse sur ma branche ;
- quand je ne veux pas qu'elle avance pour le moment (tokens, priorités).

## Ce que fait la pause

- **Aucun agent ne part** sur une PR en pause : ni correction Jenkins ou Sonar, ni `pr-risk`,
  `pr-review`, `pr-demo` ou QA. Aucun toast « à toi » non plus.
- **Un agent déjà lancé finit** : la pause ne ferme aucun onglet, elle bloque seulement les
  suivants. La PR reste « agent en cours » tant que son agent la garde.
- La surveillance **continue de lire** la PR à chaque tour : l'étiquette « en pause » (triée avec
  les brouillons) et sa ligne d'explication restent à jour sur la CI.
- **Reprise** par le même bouton. La surveillance reprend là où elle en était : une étape qui a
  déjà son marqueur ne repart pas. Rien n'est compté pendant la pause (tentatives Jenkins/Sonar).
- La pause dure jusqu'à ce que je la lève. La liste n'est jamais nettoyée : la surveillance ne
  voit que les PR mises à jour depuis 7 jours, une PR en attente en sortirait et perdrait sa pause.
  La clé d'une PR fermée reste, sans effet.

## Où

Un bouton pause (⏸ / ▶) sur chaque ligne de la section Surveillance du panneau Pull request, à
côté de l'étiquette. Son clic ne déclenche pas celui de la ligne (ouvrir la PR ou l'agent).

```
  arthur #5462                       [⏸] [en pause]
  Fix interaction alerts
  en pause ; CI verte
```

## Approches

- **A. Liste `paused` dans le registre partagé `pr-watch`** (retenue). À côté de `on`, une liste
  de clés `owner/repo#N`, écrite par le panneau seulement. Herdr la sauvegarde dans
  `shared.json` : elle survit à un redémarrage. Le tour la relit en fin de tour, comme `on`, pour
  ne pas écraser un clic fait pendant le tour.
- B. Un indicateur dans la fiche de chaque PR : le tour réécrit les fiches à la fin, un clic
  pendant un tour serait perdu sans fusion champ par champ. Plus de code pour le même résultat.
- C. Un label GitHub (`no-agent`) : visible de partout, mais à créer dans chaque repo, public
  pour un réglage personnel, et chaque clic devient un appel `gh` qui peut échouer.

## Laissé au constructeur

- `decide()` reçoit la pause par `ctx.paused` ; le test vient après la gestion de l'agent lancé
  (qui finit), avant tout lancement et tout toast.
- Tests `node:test` de `decide` en pause (rien ne part, l'agent lancé garde la PR, pas de
  toast, pas de tentative) ; README Herdr et doc de conception
  du 14 à mettre à jour.
