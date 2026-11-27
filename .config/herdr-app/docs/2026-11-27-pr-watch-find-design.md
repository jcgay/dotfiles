# Retrouver une PR et voir ce qui m'attend dans la Surveillance

Complète `2026-11-14-pr-watch-design.md`, `2026-11-20-pr-watch-pipeline-design.md` et
`2026-11-20-pr-watch-drafts-filter-design.md`.

## Pourquoi

J'ouvre la Surveillance pour deux choses : retrouver une PR précise, et voir ce qui demande mon
attention. Avec beaucoup de PR, je n'y arrive plus :

- la liste est à plat, triée par étiquette, 4 à 5 lignes par PR : il faut défiler ;
- une PR « ok » replie son titre en infobulle, alors que je la reconnais à son titre ;
- cinq brouillons vidal-mcp sur lesquels je ne travaille pas sont « à toi » en tête et dans le
  compteur « N PR à toi ». Entrés ensemble le 25/11, la surveillance y a lancé des agents rebase et
  Sonar qui ont échoué deux fois. Leurs pushs les gardent dans la fenêtre des 7 jours de
  `gh search prs --updated` : ils ne sortiraient jamais seuls (hypothèse non vérifiée).

Je reconnais une PR à son dépôt, son titre et le space où je travaille dessus. Ce qui demande mon
attention, c'est ce que moi seul peux débloquer : ni un brouillon que je laisse de côté, ni une PR qui
attend l'approbation d'un collègue.

## Ce qui change

### Un brouillon n'est surveillé que si je travaille dessus

- Un brouillon n'est surveillé que si un space ou une pane Herdr locale montre un worktree sur sa
  branche (ou son worktree `-watch`). Sinon, `status-jc` le traite comme une PR sortie de la
  surveillance : pas d'agent, pas de squash, pas d'entrée dans `pr-watch`, ne compte pas dans
  « N PR à toi ».
- Il revient au premier tour où un space le montre ; il ressort au premier tour où plus aucun ne le
  montre.
- Accepté : un brouillon ouvert par **Corriger** (vue CI) ou travaillé hors de Herdr n'est plus suivi
  une fois son space fermé.
- Une PR prête pour review est surveillée comme aujourd'hui, space ou pas.

### La liste : « À toi » en tête, puis par dépôt

```
À toi (1)
  arthur #5471  Ajoute l'export PDF…        merge refusé
vidal-gpt
  #161  Update pydantic-ai-harness…          en attente
  #160  Update CopilotKit…                   en attente   · space renono
arthur
  #5500 …                                    ok
```

- Section **À toi** en tête : les PR que `waitingOnMe` compte (étiquette « à toi », merge armé
  refusé), avec leur dépôt sur la ligne. Absente quand il n'y en a pas.
- Puis un groupe par dépôt, nom en en-tête une seule fois, les lignes sans le nom du dépôt. Une PR
  de la section À toi n'est pas répétée dans son groupe. Dans un groupe, le tri par étiquette reste
  celui d'aujourd'hui. Ordre des groupes : celui de leur PR la plus urgente.
- Une PR « ok » garde son titre visible ; seule son explication se replie.
- Une PR qu'un space montre affiche le nom de ce space sur sa ligne (en plus de la pastille du
  terminal).

## Approches

- **Retenue :** section À toi puis groupes par dépôt. Règle les deux besoins d'un coup d'œil.
- Rejetée : groupes par dépôt seuls. Les « à toi » sont dispersés.
- Rejetée : liste à plat avec un champ de recherche. N'aide pas à voir ce qui compte, et la saisie de
  texte dans un mod est le plus coûteux.
- Brouillons : règle automatique par le space retenue ; rejetée, la pause manuelle qui sortirait un
  brouillon de la liste (il faut y penser, un oubli relance le cycle agents → échec → à toi).

## Hors périmètre

- Dire qui doit approuver (case « appr ») : une PR qui attend un collègue est déjà « en attente »,
  pas « à toi ».
- Le filtre « Brouillons (N) » reste tel quel ; il ne porte plus que sur les brouillons dans un space.
- Lister quelque part les brouillons hors surveillance.

## Laissé au builder

- Comment savoir qu'un space montre la branche d'un brouillon (branche git des dossiers des spaces et
  panes, à la manière de `findClone` et de `localSpaces` d'`opener.js`).
- Ce que deviennent les onglets d'agent d'un brouillon qui sort : le même sort qu'une PR mergée.
- La navigation clavier (↑/↓) suit l'ordre affiché, en-têtes sautés.
- Mettre à jour l'aide `?` du panneau (`STATE_HELP`…), les README de `pr` et `status-jc`, et
  `.config/herdr-app/README.md`.
