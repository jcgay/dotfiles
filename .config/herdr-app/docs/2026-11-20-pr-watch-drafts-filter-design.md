# Masquer les brouillons de la Surveillance

Complète `2026-11-20-pr-watch-pipeline-design.md`.

## Pourquoi

Je veux voir d'un coup d'œil les PR qui demandent mon attention. Les brouillons, que la surveillance
ne fait que suivre (pas de review), remplissent le bas de la liste : je veux pouvoir les masquer et
les réafficher.

## Ce qui change

- Une puce « Brouillons (N) » dans le bandeau de la Surveillance, N le nombre de brouillons suivis.
  Clic : masque les brouillons ; reclic : les réaffiche. Masqués, la puce est atténuée et garde N.
- Est un brouillon une entrée avec `draft: true` (brouillon en pause compris), ou, pour un registre
  écrit avant la bande d'étapes, l'étiquette « brouillon ».
- Le choix est gardé dans `shared("pr-watch-view")` (`{ hideDrafts }`) : il survit au redémarrage,
  et `status-jc`, qui réécrit `pr-watch` à chaque tour, ne l'écrase pas. Par défaut : affichés.
- La liste garde son tri par urgence. `status-jc` ne change pas.

## Approches

- **Retenue :** une seule puce pour les brouillons, la règle « brouillon ? » dans `pr/model.js`
  (testée), le panneau filtre.
- Rejetée : une puce par statut (à toi, agent en cours…). Plus que le besoin.
- Rejetée : un filtre « À traiter » (à toi, erreur, pas de clone). Le besoin réel est de masquer
  les brouillons.
- Rejetée : l'état dans la vue seule. Perdu au redémarrage.

## Laissé au builder

L'aspect exact de la puce atténuée, l'emplacement dans le bandeau.
