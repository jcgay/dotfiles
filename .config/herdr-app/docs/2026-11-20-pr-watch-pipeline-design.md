# Voir où en est chaque PR de la surveillance

Complète `2026-11-14-pr-watch-design.md`, `2026-11-17-pr-armed-merge-design.md` et
`2026-11-18-pr-watch-open-design.md`.

## Pourquoi

Devant la liste Surveillance du panneau `pr`, je n'arrive pas à répondre vite à quatre questions :
est-ce que la PR est bloquée ? où elle en est ? quand est-ce que je vais pouvoir merger ? combien de
temps il faut encore ? Aujourd'hui chaque ligne n'a qu'une pastille, une étiquette et une phrase
« pourquoi » : le parcours qu'elle suit (conflit, Jenkins, Sonar, review, qa, demo, risk, approbation,
merge) n'existe que dans `decide()` (`status-jc/watch.js`). Rien ne dit non plus combien d'agents de
surveillance sont libres, si karadoc est pris, ni quand passe le prochain tour.

Deux gênes de plus : armer le merge ou squasher une PR oblige à ouvrir un space sur sa branche pour
avoir le haut du panneau, et l'état affiché a jusqu'à 5 minutes de retard.

## Ce qui change

### 1. Une bande d'étapes par PR

Chaque ligne de la Surveillance garde ce qu'elle a (repo, numéro, titre, étiquette, ⌨, ⏸, ligne
« pourquoi ») et gagne, sous le titre, une bande de 9 cases :

```
git · jenk · sonar · rev · qa · demo · risk · appr · merge
```

| Case | Étape de `decide()` |
|---|---|
| git | conflit avec la base (rebase) |
| jenk | Jenkins, ou tout check de CI du repo |
| sonar | Sonar |
| rev | `pr-review --fix` |
| qa | qa |
| demo | `pr-demo --narrate` |
| risk | `pr-risk` |
| appr | approbation par un humain (squash des `fixup!` compris) |
| merge | merge armé ou non |

Couleurs (choix fait, validé sur maquette) :

- vert : fait ;
- orange clignotant : en cours (agent lancé, CI qui tourne, merge armé) ;
- orange fixe : la case appr d'une PR qui attend l'approbation d'un humain (pas « à toi », la
  ligne ne remonte pas dans la liste) ;
- rouge : en échec, la surveillance va le corriger (budget pas épuisé) ;
- violet : « à toi », la surveillance a abandonné ou attend ton push ;
- gris : à venir ;
- pointillé : étape que ce repo ne fera jamais (pas de `## Demo`, pas de skill qa, pas de CI).

Un agent de correction (rebase, correction Jenkins ou Sonar, squash) colore la case de ce qu'il
corrige (git, jenk, sonar, appr) en orange. Les cases git, jenk et sonar montrent l'état du head
actuel : quand `pr-review --fix` pousse ses fixups, jenk et sonar repassent en orange le temps que la
CI retourne, rev reste vert (choix du rédacteur).

La case sonar est en pointillé dans un repo où aucune PR n'a jamais eu de check Sonar : le registre
retient les repos où Sonar a été vu (choix du rédacteur ; aujourd'hui `state("sonar")` répond `ok`
quand Sonar n'a jamais été vu, ce qui peindrait la case en vert pour rien).

Un brouillon montre les cases git, jenk et sonar seulement : la surveillance ne lance aucune review
dessus. Une PR en pause garde sa bande, grisée.

La ligne « pourquoi » existante reste et commence par le temps (§ 4) :
`qa depuis 12 min · prête à approuver dans ~35 min`.

### 2. Un bandeau global en haut de la Surveillance

```
● Surveillance active   Agents 2/3   karadoc pris (#5471 qa)   tour dans 1 min  ↻
```

- l'interrupteur actuel (clic : active / coupe) ;
- agents de surveillance occupés sur `MAX_AGENTS` (3) ;
- karadoc libre, ou la PR et l'étape qui le tiennent ;
- le temps avant le prochain tour, ou « tour en cours » ;
- ↻ : un tour tout de suite (§ 5).

Il remplace la ligne « Surveillance active · dernier tour il y a X ».

### 3. Les actions sur la ligne

Deux icônes rejoignent ⌨ et ⏸ :

- **⤵ squasher**, seulement quand la PR a des commits `fixup!`/`amend!`/`squash!` : même effet que
  le ⤵ du haut du panneau (écrit dans `shared("pr-squash")`).
- **⇥ armer le merge**, sur une PR ouverte qui n'est pas un brouillon : même effet que « Merger quand
  tout est vert » (écrit dans `shared("pr-merge")` avec le head de la PR). Une fois armée, l'icône
  devient ✕ (désarmer) et la case merge de la bande passe en orange.

`status-jc` ne change pas pour elles : ce sont les mêmes registres que le haut du panneau.

⌨ dit maintenant ce que son clic fera, d'après le dossier qu'il ouvrirait (worktree de la branche
pour un brouillon, `-watch` pour une PR prête, voir `2026-11-18-pr-watch-open-design.md`) :

| Aspect | Situation | Tooltip |
|---|---|---|
| grisé | le dossier n'existe pas | « Créer le worktree et travailler dessus » |
| normal | le dossier existe | « Ouvrir le worktree » |
| avec une pastille | un space local montre déjà ce dossier | « Aller au space » |

### 4. Le temps

Choix validé : un historique des durées dans le registre, pas une relecture de `herdr-watch.log`.

- Quand une étape se termine, `status-jc` note sa durée et garde les 10 dernières par étape, toutes
  PR confondues, dans le registre `pr-watch`.
- L'estimation d'une étape est la médiane de son historique, à partir de 3 mesures. Avant, pas
  d'estimation : la ligne ne montre que le temps écoulé (`qa depuis 12 min`).
- Ce qu'une durée couvre (choix du rédacteur) : pour jenk et sonar, un seul passage de la CI sur un
  head, pas tout le cycle échec, correction, nouveau passage ; chaque agent de correction (rebase,
  jenkins, sonar, squash) a son propre historique ; pour rev, qa, demo et risk, du lancement de
  l'agent à son marker.
- « prête à approuver dans ~X » : reste estimé de l'étape en cours plus les médianes des étapes
  suivantes jusqu'à risk, en comptant un passage de jenk et de sonar de plus après rev quand rev
  reste à faire dans un repo avec CI (ses fixups relancent la CI). Affiché seulement si chacune de
  ces étapes a une estimation.
- Rien n'est estimé après risk : l'approbation dépend d'un humain. Une PR « à toi » affiche
  « dépend de toi » à la place.

Choix du rédacteur, à valider en relisant : Jenkins et Sonar sont mesurés de la même façon (premier
tour qui les voit tourner, premier tour qui les voit finis), sans appeler `jk` à chaque tour. La
mesure a donc la précision d'un tour (2 min), et marche sans VPN. Quand le check-run que `watcher.js`
lit déjà porte `startedAt` et `completedAt` (Sonar, checks GitHub Actions), le builder les prend à
la place : même coût, mesure exacte.

### 5. Un tour toutes les 2 minutes, et à la demande

- Le tour de surveillance passe de 5 à 2 minutes (`status-jc/main.js`). Avec 10 PR suivies, environ
  600 appels GitHub par heure (une recherche plus `gh pr view` et check-runs par PR) pour un quota de
  5 000 partagé avec les agents. Les agents partent aussi plus tôt : voulu.
- ↻ dans le bandeau demande un tour immédiat. Le panneau écrit la demande, `status-jc` la relève
  dans son tick de 5 s (comme ⤵ et ⌨) et lance le tour s'il n'en tourne pas déjà un.

## Approches

**Qui calcule la bande.**

- **Retenue :** `decide()` produit les cases à chaque tour et `status-jc` les écrit dans l'entrée de
  la PR du registre `pr-watch` ; le panneau les dessine sans rien déduire. Elle seule connaît l'état
  de chaque étape (markers, tentatives, `silent`, `hasQa`/`hasDemo`/`hasCi`).
- Rejetée : recalculer dans le panneau. Herdr refuse qu'un mod importe un fichier d'un autre mod :
  il faudrait recopier `decide()`.
- Rejetée : déduire les cases du texte « pourquoi ». Casse à la première reformulation.

**D'où viennent les durées.**

- **Retenue :** l'historique dans le registre (§ 4). Simple, testable par `node --test`. Prix : pas
  d'estimation pour les étapes d'agent les premiers jours.
- Rejetée : relire `herdr-watch.log`. Estimations immédiates, mais il faut apparier les lignes
  « agent lancé » et leur fin dans un texte écrit pour un humain, et le fichier grossit.

**Les actions depuis la liste.**

- **Retenue :** deux icônes sur la ligne (§ 3), rien à demander à `gh` en plus.
- Rejetée : déplier la ligne sur le tableau du haut (Build, Déployée, Checks…). Montre tout avant
  d'agir, mais un appel `gh` et `jk` par PR dépliée et un tableau à extraire ; la bande donne déjà
  ce qu'il faut pour décider.

**La fraîcheur.**

- **Retenue :** 2 minutes plus ↻.
- Rejetée : 1 minute sans bouton, deux fois plus d'appels.
- Rejetée : 5 minutes avec ↻ seul, l'affichage reste vieux tant qu'on ne clique pas.

## Contraintes

- Un mod ne peut pas importer un fichier d'un autre : tout ce que le panneau affiche vient du
  registre `pr-watch` (ou des registres `pr-merge`, `pr-squash`, `pr-open`, et de `spaces()`).
- Ce que le panneau écrit dans `pr-watch` (interrupteur, pauses, demande de tour) doit survivre à
  la réécriture du registre en fin de tour, comme `on` et `paused` aujourd'hui.
- Les tours tournent sous un bail (`pr-watch-lease`, 4 min) pour que deux copies de `status-jc` ne
  lancent pas deux fois : un tour à la demande le respecte aussi, et un tour plus fréquent ne doit
  pas en chevaucher un autre.
- La logique (cases, médianes, estimation, aspect de ⌨) va dans des modules purs avec leur
  `*.test.mjs`, sans import de `herdr` (voir `~/.config/CLAUDE.md`, Tests).
- Le panneau fait environ 380 px de large : la bande tient sur une ligne, libellés de 4-5 lettres.

## Laissé au builder

- La forme exacte des cases et de l'historique dans le registre, et les champs à ajouter à l'entrée
  pour les icônes (nombre de `fixup!`, brouillon, head, dossier de ⌨ et s'il existe).
- Où mesurer le début et la fin de chaque étape, d'après les transitions que `decide()` voit déjà
  (`launched`, markers, états des checks). Un agent dont l'onglet se ferme sans marker ne compte pas
  dans l'historique.
- Les couleurs exactes, prises dans `theme()` comme les pastilles actuelles.
- Le clic d'une case : rien, ou le même que la ligne.
- Mettre à jour `mods/pr/README.md`, `mods/status-jc/README.md` et `README.md` (§ 4, panneau PR).

## Hors champ

- Le haut du panneau (PR du space affiché) ne change pas.
- Pas d'estimation de la date de merge : elle dépend de l'approbation.
- Pas de nouvelle étape dans la surveillance : la bande montre ce que `decide()` fait déjà.
