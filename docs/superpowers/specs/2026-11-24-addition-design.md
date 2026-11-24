# addition : ce que coûte chaque skill et chaque étape

## Pourquoi

Le % d'usage Claude monte à mesure que les automatisations se multiplient
(watch des PR Herdr, `pr-review`, `pr-risk`, sous-agents…). Il faut savoir
quelles étapes consomment le plus (tokens, coût, temps) pour les régler
(modèle, périmètre du contexte) et vérifier ensuite que le réglage a payé.
Usage : une revue posée de temps en temps, en local.

## Objectifs

- Coût, tokens et temps par skill, par type de sous-agent et par étape du
  watch Herdr, sur toutes les sessions (interactives et automatiques).
- Comparer deux périodes pour juger une optimisation.

## Hors périmètre

- Temps réel, alertes, tableau de bord graphique (plus tard si besoin).
- Réécrire un indexeur de transcripts : agentsview le fait déjà.
- Reproduire la formule exacte du % d'abonnement (non publiée).

## Anti-objectifs

- Écrire dans la base d'agentsview ou dépendre d'un service qui tourne en
  continu en plus du sien.
- Envoyer quoi que ce soit hors de la machine.

## Approches considérées

- **Indexeur maison des transcripts vers SQLite** : écarté, agentsview
  (déjà installé, v0.48) indexe tout depuis 2024 et maintient le parseur.
- **Pile OpenTelemetry locale** : pas de notion de skill dans les
  événements, pas d'historique, Docker permanent.
- **ccusage et apparentés** : totaux par jour, session ou modèle seulement.
- **Retenue : un rapport au-dessus de `~/.agentsview/sessions.db`**, ouvert
  en lecture seule.

## Conception

Commande `addition` dans `.local/bin/` (bash et `/usr/bin/sqlite3`, la
logique est en SQL), avec son autotest `addition.test` sur une petite base
de fixture.

**Segments.** Une session est découpée à chaque invocation de skill :
- un appel au Skill tool (`tool_calls.skill_name`) ;
- un message utilisateur qui commence par `/<nom>`, si ce nom a un namespace
  (`plugin:skill`), est installé sous `~/.claude` ou `~/.agents`, ou a déjà
  été vu dans un appel au Skill tool. `/clear` termine le skill en cours ;
  les autres commandes (`/model`, `/compact`…) ne coupent rien.

Un segment court jusqu'à l'invocation suivante ou la fin de la session ;
avant la première invocation, le segment s'appelle `(sans skill)`. Un skill
appelé depuis un autre coupe le segment parent : on voit donc le détail
(`code-review` à l'intérieur de `pr-review`). Une ligne d'un sous-agent va au
dernier skill que ce sous-agent a lui-même lancé, sinon au segment de la
session principale qui l'a démarré.

**Coût d'un segment** : les tokens de `messages.token_usage` (une ligne par
message de l'API, dédoublonnée sur `claude_message_id` ; `usage_events`
n'a que des totaux de session pour Claude) multipliés par `model_pricing`
(tarif API, utilisé comme approximation du % d'abonnement ; l'écriture de
cache 1 h a son propre tarif), plus ceux des sous-agents lancés depuis le
segment, récursivement. Un sous-agent qu'aucun appel Agent ne désigne est
rattaché par `parent_session_id` à sa session principale, au dernier
message avant son démarrage.

**Temps** : temps actif de l'agent dans la conversation principale, la somme
des écarts avant chaque message qui n'est pas un prompt (l'attente humaine
est exclue), chaque écart plafonné à 15 min. Il n'a de sens que par skill,
étape ou session ; `--by agent` et `--by model` le laissent vide.

**Étape Herdr** : `status-jc` termine la ligne « agent <étape> lancé » de
`~/Library/Logs/herdr-watch.log` par `(session <uuid>)` ; le panneau Journal
ne l'affiche pas. `addition` lit ce journal et étiquette la session par
étape (pr-review, sonar…), toutes PR confondues.

**Sorties** (tableaux en terminal) :
- `addition [--since 7d]` : classement par skill (coût, tokens, temps,
  nombre d'invocations, coût moyen) ;
- `--by skill|agent|step|model|session` pour changer d'axe ; par agent, une
  invocation est un lancement de sous-agent ;
- `--compare <date>` : nombre d'invocations et coût moyen dans les `--since`
  jours avant la date et depuis la date, avec l'écart en %, pour juger un
  réglage ;
- `--json` pour retravailler les chiffres.

La commande lance `agentsview source sync` avant de lire, pour inclure les
dernières sessions.

## Laissé au constructeur

Format exact des colonnes, noms des options, structure de la fixture.
Les sessions `claude -p` des scripts ne sont pas vérifiées : à tester.

## Décisions prises par Claude (à vérifier)

- Dans les dotfiles et non un nouveau dépôt, vu la taille ; rien de
  spécifique à Vidal.
- Bash et SQL plutôt qu'un autre langage.
- Coût au tarif API comme approximation du % d'usage.
- Temps actif plafonné à 15 min par écart ; `--compare` sur une seule date.
- Ce document est dans `~/docs/superpowers/specs/`.
