# Ouvrir un space sur un projet de ~/dev

## Pourquoi

Ouvrir un space sur un de mes projets demande aujourd'hui de passer par un terminal (`cd`, puis
un nouveau space). Je veux taper quelques lettres du nom du dépôt et avoir le space tout de suite.
Rouvrir l'état d'un space fermé (onglets, agents) ne m'intéresse pas : un space neuf dans le bon
dossier suffit, et les projets ouverts récemment doivent arriver en tête.

## Ce que ça fait

- **Un mod `projects`**, en popup comme la palette (`"place": "none"`, `overlay` de type dialog).
  On l'ouvre avec `⌘⇧O` (`mod.open:projects`, libre dans `keys.json`) ou avec un bouton dans
  l'en-tête de `spaces-jc`, qui ne gagne que ce bouton.
- **La liste** : les dossiers à la racine de `~/dev` dont `.git` est un dossier. Les worktrees
  (`.git` est un fichier), `agents-worktree` et les dossiers sans git n'apparaissent pas.
- **Le tri** : d'abord les projets ouverts récemment, du plus récent au plus ancien, puis les
  autres par date de leur dernier commit.
- **La saisie** filtre au fil de la frappe sur le nom du dossier. Haut/Bas déplacent la sélection,
  Entrée ouvre, Échap ferme.
- **Ouvrir** : si un space a déjà un terminal dans ce dépôt, on y va (`space.select`). Sinon,
  `space.new {folder}`, qui s'appelle tout seul du nom du dépôt.

## Approches écartées

- **Un champ fixe en haut de `spaces-jc`** : il prend une ligne en permanence, il disparaît en
  mode rail, et le code ajouté au clone ferait des conflits au prochain merge de Herdr.
- **Les projets dans le dialogue `start-work`** : il démarre un travail dans un worktree, et
  mélanger les deux brouillerait son rôle.

## Choix laissés à l'implémentation (mes choix, à corriger)

- **La récence** est tenue par le mod lui-même dans son `localStorage` : `{dépôt: date}`. Le mod
  la met à jour quand il ouvre un projet, et à chaque ouverture de la popup pour les dépôts ouverts
  qui ne l'étaient pas à l'ouverture précédente (le dépôt d'un space est celui de son premier
  terminal). Un space ouvert puis fermé autrement entre deux ouvertures de la popup peut être
  manqué : c'est accepté, pour ne pas toucher aux clones. `view.json` n'est pas lu : son `folder`
  est le dossier de création d'un space, pas son dépôt.
- **La date du dernier commit** vient de `git log -1 --format=%ct` pour chaque dépôt, lancé à
  l'ouverture de la popup. La liste s'affiche d'abord par récence puis par nom, et se réordonne
  quand les dates arrivent.
- **Le filtre** : sous-chaîne insensible à la casse, le nom exact puis les correspondances en début de nom d'abord.
  Pas de recherche floue tant que le besoin ne se fait pas sentir.
- **La logique pure** (lister, trier, filtrer, trouver le space existant) vit dans un module sans
  import `herdr`, testé par un `*.test.mjs` comme les autres mods.

## Hors sujet

Les worktrees, les machines distantes, et la restauration des onglets ou des sessions Claude d'un
space fermé.
