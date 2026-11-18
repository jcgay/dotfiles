# Journal de ce qui se passe sans moi

Complète `2026-11-14-pr-watch-design.md` et `2026-11-17-pr-armed-merge-design.md`.

## Pourquoi

La surveillance des PR et le merge armé agissent seuls (agents lancés, push forcés, PR fusionnées,
onglets fermés). Quand je reviens devant l'écran, il n'en reste rien : les toasts ont disparu,
`shared("pr-watch")` ne garde que l'état courant de chaque PR. Je veux voir ce qui a été fait.

Pour l'instant : **voir**. Pas d'audit (transcript de l'agent, commits poussés), pas de « depuis ma
dernière visite », pas d'alerte de plus.

## Ce que je vois

Un bouton **Journal** dans la barre d'onglets, à côté de « Pull request ». Il ouvre un panneau
dédié, retenu par space comme le panneau PR. Le panneau montre le journal de **toutes** les PR,
pas seulement celles du space.

```
JOURNAL
03:12  dotfiles#41  agent rebase lancé
03:31  dotfiles#41  ok : CI verte ; faits : rebase
04:02  merlin#812   fusionnée
04:05  merlin#815   à toi : tu travailles sur MERLIN-12 (non poussé)
17/11 22:40  …                      (date devant l'heure si ce n'est pas aujourd'hui)
            [ Plus ]   [ Tout le journal ]
```

- Les 20 dernières lignes, la plus récente en haut.
- **Plus** : 20 lignes de plus à chaque clic, la liste défile dans le panneau.
- **Tout le journal** : ouvre un onglet terminal dans le space courant avec
  `less +G ~/Library/Logs/herdr-watch.log` (tout l'historique, recherche avec `/`).
- Un clic sur une ligne ouvre la PR sur GitHub.
- Le panneau se met à jour seul quand le journal change (panneau ouvert).

### Marqueur de lecture

- Les lignes non lues en clair en haut, puis une ligne « lu », puis les anciennes en grisé.
- Le bouton Journal de la barre d'onglets porte une pastille avec le nombre de lignes non lues,
  visible panneau fermé.
- Un bouton **Tout lu** dans l'en-tête du panneau (seulement s'il y a des non-lues) déplace le
  marqueur tout en haut et éteint la pastille.
- Le marqueur est le nombre de lignes lues du fichier, dans `shared("journal-read")` (survit à un
  redémarrage). `status-jc` publie le nombre de lignes du fichier dans `shared("journal-lines")`
  après chaque écriture, parce que le panneau ne tourne qu'une fois affiché et que la pastille doit
  compter sans lui. Un fichier plus court que le marqueur (supprimé, recréé) : tout est non lu.
- Pas de marqueur encore posé : tout le fichier est non lu.

Approche écartée : faire disparaître les lignes lues du panneau. On perd le fil (« c'était après
le rebase d'hier »).

## Ce qui est écrit

Un fichier texte, `~/Library/Logs/herdr-watch.log` (à côté de `wt-prune.log`), une ligne par
événement, lisible telle quelle :

```
2026-11-18 03:12  softwarevidal/dotfiles#41  agent rebase lancé
```

Événements, au plus une ligne par PR et par tour de surveillance :

- **Agent lancé** : quand `launched` change de step ou de head, `agent <step> lancé`. Prioritaire :
  deux agents qui s'enchaînent dans le même état « agent en cours » écrivent chacun leur ligne.
- **Changement d'état** : sinon, quand le `label` d'une PR change, `<label> : <why>` (`<label>` seul
  sans `why`). Ça couvre la fin d'un agent (« agent en cours » → autre chose), « à toi »,
  « pas de clone local », « erreur », la pause.
- **Nouvelle PR** dans la surveillance : son état, comme un changement d'état.
- **PR sortie** de la surveillance (fusionnée, fermée ou inactive) : `sortie de la surveillance`.
- **Toast** de la surveillance : son titre, seulement si la PR n'a pas déjà sa ligne ce tour.
- **Merge armé** (`merger.js`) : `fusionnée` ou `merge refusé : <erreur>`. Ses toasts ne sont
  pas écrits en plus.
- **Surveillance** activée ou coupée : écrite au tour suivant, qui compare `on` à celui du tour
  précédent. Raccourci : l'heure peut être en retard de 5 minutes et un aller-retour rapide est
  perdu.

Pas de ligne pour une PR qui reste dans le même état, ni pour les onglets fermés par `closing()`.
Surveillance coupée, aucune ligne de PR : les tours continuent pour garder le panneau PR à jour,
mais rien n'est fait, et le journal dit ce qui a été fait. Seules l'activation et la coupure sont écrites.

Le dépôt complet (`owner/repo#n`) est dans le fichier ; le panneau peut n'afficher que `repo#n`.

## Approches

- **Fichier + panneau qui le lit, retenue.** Le fichier se fouille (`grep`, `less`), survit à
  tout, et le panneau le montre sans quitter Herdr.
- Fichier seul : le moins de code, mais rien dans Herdr.
- Journal dans `shared()` affiché dans le panneau PR : `shared.json` grossit et se réécrit à chaque
  événement, et rien hors de Herdr.

## Contraintes

- Seul `status-jc` écrit (la surveillance et le merger y tournent, sous leur bail : deux copies de
  `status-jc` n'écrivent pas deux fois le même événement).
- Un mod ne peut pas importer un fichier d'un autre mod : `journal` relit le fichier, il ne partage
  pas de code avec `status-jc`.
- `readTextFile` s'arrête à 1 Mio : le panneau ne doit pas dépendre de la lecture du fichier entier.
- Ne jamais écrire dans le dossier d'un mod (ça le recharge) : le journal est hors de
  `~/.config/herdr-app`.
- Personnalisation dans nos mods et clones (`status-jc`, `tabs-jc`, layout `jc`), jamais dans les
  originaux.
- Une ligne de journal qui n'arrive pas à s'écrire ne casse pas un tour de surveillance ni un merge.

## Décisions laissées au constructeur

- Comment ajouter une ligne (`exec` d'un `printf >>` avec les arguments passés hors du shell, ou
  autre) et comment le panneau lit les N dernières lignes (`tail -n` via `exec`, ou autre).
- Comment le panneau voit le fichier changer (`watchFolder`, sondage).
- Où calculer les événements d'un tour : une fonction pure testée (`*.test.mjs`) qui compare
  l'état avant et après d'une PR, comme le reste de `status-jc`.

## Hors champ

- Raccourci : le fichier n'est jamais tronqué (quelques dizaines de lignes par jour). À revoir s'il
  dépasse quelques Mio.
- Les jobs launchd (`wt-prune`, `glane-morning`) ont déjà leurs logs et `launchd-status`.
- Mettre à jour `.config/herdr-app/README.md` (bouton Journal, panneau) fait partie du travail.
