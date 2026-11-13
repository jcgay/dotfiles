# jira-merged : passer en Done Dev les tickets de mes PR mergées

## Pourquoi

J'oublie de bouger le ticket JIRA après le merge de ma PR. Exemple : APIREST-1529, mergée le
12/11 (arthur#5452) et encore « En cours » le lendemain. JIRA voit le merge, grâce à
l'intégration GitHub, mais rien ne change le statut.

## Objectifs

- Une PR à moi, mergée dans l'organisation `softwarevidal`, fait passer en **Done Dev** les
  tickets qu'elle porte.
- Sans action de ma part, et je suis prévenu de chaque passage pour rattraper une erreur.

Hors périmètre : le passage en Code Review à l'ouverture de la PR, un affichage dans Herdr
(ce sera peut-être un `pr-inbox` plus complet, à part), une table de statuts par projet.

Échec, même si ça « marche » : déplacer le ticket de quelqu'un d'autre, ou écraser un statut
que quelqu'un a posé après le mien.

## Approches

1. Une règle d'Automation JIRA (« PR merged → transition ») : aucun code, mais il faut les
   droits d'admin du projet et l'accord de l'équipe.
2. **Retenue** : un script local lancé par launchd, avec `gh` et `jira` (ankitpokhrel), déjà
   configurés. Personnel et sans droits à demander. Ne tourne que Mac allumé.
3. Un mod Herdr : ne tourne que Herdr ouvert, et lie une tâche de fond au terminal.

## Design

- **Fichiers** (yadm, classe `Work`) : `~/.local/bin/jira-merged##class.Work` et
  `~/Library/LaunchAgents/<label>.plist##class.Work`, chargé par `~/.config/yadm/bootstrap`.
- **Quand** : toutes les 30 min, du lundi au vendredi, de 8 h à 19 h. Le plist se lance à
  :00 et :30 (`StartCalendarInterval`) et le script sort tout de suite en dehors de ces
  jours et heures.
- **Quelles PR** : `gh search prs --owner softwarevidal --author @me --merged` sur les
  7 derniers jours. `~/.local/state/jira-merged/handled` garde chaque couple ticket + PR
  déjà déplacé : un ticket que quelqu'un remet « En cours » après coup y reste. Un revert
  (titre `Revert …`) ne déplace rien.
- **Quels tickets** : les clés (`[A-Z][A-Z0-9]+-[0-9]+`) de la branche et du titre avant
  le premier `:` (convention `MERLIN-2321: Sujet`). Une clé citée plus loin dans le titre
  (« régression de MERLIN-2300 ») est ignorée. Une PR peut porter plusieurs clés.
- **Garde-fou** : le ticket n'est déplacé que s'il est encore « En cours » (Code Review ne sert pas dans l'équipe).
  Ouvert, déjà avancé, rouvert : on n'y touche pas.
- **À moi seulement** : le ticket m'est assigné, ou n'est assigné à personne et j'en suis le
  rapporteur. Sinon : une notification, et il reste où il est.
- **Action** : `jira issue move <clé> "Done Dev" --comment "PR <repo>#<n> mergée"`.
- **Retour** : une notification macOS par ticket passé. Si la transition Done Dev n'existe pas
  pour un ticket (autre workflow) ou si `jira` échoue, une notification « à faire à la main »,
  et le ticket reste tel quel. Une même erreur n'est notifiée qu'une fois par jour.
- **Test** : l'extraction des clés et le garde-fou de statut ont leur test, dans le style de
  `~/.claude/hooks/github-signature.test`.

## Laissé à l'implémentation

Le langage du script (bash comme les autres de `~/.local/bin`), le label du LaunchAgent, l'emplacement
du log, la façon d'appeler la notification (`osascript`).
