# Fish — guide de prise en main (depuis zsh)

Mémo perso pour passer de zsh à fish sans rage-quit. Tout est calé sur **cette** config.

---

## 1. Le changement de modèle mental

Fish n'est **pas** POSIX. Ne cherche pas à recopier ton `.zshrc` ligne par ligne, la moitié ne marchera pas — et tu n'en as plus besoin :

- **Autosuggestions intégrées** (le texte gris qui complète d'après ton historique) → `→` ou `Ctrl-F` pour accepter. C'est ton `zsh-autosuggestions` mais natif.
- **Coloration syntaxique** en live : commande rouge = introuvable, avant même d'appuyer sur Entrée.
- **Complétions** générées depuis les pages de man, sans plugin.
- Plus besoin de `oh-my-zsh` : la plupart de ce que tu en tirais est natif.

Le piège n°1 : **la syntaxe est différente**. Le reste du guide, c'est surtout ça.

---

## 2. Antisèche syntaxe zsh → fish

| Tu faisais (zsh/bash) | En fish |
|---|---|
| `export FOO=bar` | `set -gx FOO bar` |
| `FOO=bar` (local) | `set FOO bar` |
| `unset FOO` | `set -e FOO` |
| `$(commande)` | `(commande)` |
| `` `commande` `` | `(commande)` |
| `$VAR` | `$VAR` (idem ✓) |
| `${VAR:-default}` | pas d'équiv direct → `set -q VAR; or set VAR default` |
| `echo $PATH` (chaîne `:`) | `echo $PATH` (c'est une **liste**, voir §6) |
| `export PATH=$PATH:/x` | `fish_add_path /x` |
| `cmd1 && cmd2` | `cmd1 && cmd2` ✓ (ou `cmd1; and cmd2`) |
| `cmd1 \|\| cmd2` | `cmd1 \|\| cmd2` ✓ (ou `; or`) |
| `if [ -f x ]; then … fi` | `if test -f x; … end` |
| `for x in *; do … done` | `for x in *; … end` |
| `function f { … }` | `function f; … end` |
| `alias g='git'` | `alias g 'git'` (ou `abbr`, voir §4) |
| `2>&1` | `2>&1` ✓ |
| `cmd &>/dev/null` | `cmd >/dev/null 2>&1` (pas de `&>`) |
| `!!` (dernière cmd) | `Alt-↑` ou tape le début + `↑` |
| `~/.zshrc` | `~/.config/fish/config.fish` (+ `conf.d/`) |

Points qui mordent le plus :
- **`export` n'existe pas** → `set -gx`. (`-g` global, `-x` exporté à l'environnement.)
- **Pas de `$(...)`** → juste `(...)`. Ex : `cd (git rev-parse --show-toplevel)`.
- **Les blocs finissent par `end`**, pas `fi`/`done`/`}`.

---

## 3. Raccourcis clavier

### Natifs fish

| Touche | Effet |
|---|---|
| `→` / `Ctrl-F` | Accepter l'autosuggestion grise (toute) |
| `Alt-→` | Accepter **un mot** de l'autosuggestion |
| `↑` / `↓` | Historique **filtré par ce que tu as déjà tapé** |
| `Alt-↑` / `Alt-↓` | Naviguer dans l'historique par token sous le curseur |
| `Tab` | Compléter ; `Tab Tab` = liste interactive (flèches pour choisir) |
| `Alt-L` | `ls` du dossier courant sans casser ta ligne |
| `Alt-S` | Préfixer la ligne courante par `sudo` |
| `Alt-E` / `Alt-V` | Éditer la ligne courante dans `$EDITOR` |
| `Ctrl-C` | Annuler la ligne (pas l'historique) |
| `Ctrl-L` | Clear |

### Via fzf (plugin `PatrickF1/fzf.fish`)

| Touche | Effet |
|---|---|
| `Ctrl-R` | Recherche dans l'historique |
| `Ctrl-Alt-F` | Insérer un fichier / dossier du répertoire courant |
| `Ctrl-Alt-L` | Recherche dans le `git log` (insère le hash) |
| `Ctrl-Alt-S` | Recherche dans le `git status` (fichiers modifiés) |
| `Ctrl-Alt-P` | Tuer un processus (recherche fuzzy) |
| `Ctrl-V` | Insérer une variable d'environnement |

### Custom (cette config, `functions/fish_user_key_bindings.fish`)

| Touche | Effet |
|---|---|
| `Ctrl-G` | `git status` sans perdre la ligne courante |
| `Alt-R` | Sauter à la racine du dépôt git (`grt`) |
| `Ctrl-Z` | Toggle : ramener le dernier job suspendu au premier plan (`fg`) |

---

## 4. Customiser (où ça vit, comment ajouter)

Architecture de cette config (rappel du `CLAUDE.md` du repo) :
- `conf.d/*.fish` → chargés **en premier**, par ordre alphabétique. Mets-y env vars, alias, fonctions par thème (`git.fish`, `docker.fish`…).
- `config.fish` → chargé **en dernier**. Réservé à l'init d'outils qui doivent passer après tout le reste : `starship`, `mise`.
- `functions/<nom>.fish` → une fonction = un fichier, **autoloadé** quand tu appelles `<nom>` (lazy). Le nom du fichier doit matcher le nom de la fonction.
- `~/.localrc.fish` → secrets / spécifique machine, **non versionné**, sourcé en fin de `config.fish`.

### Ajouter un alias
```fish
alias gl 'git log --oneline'
```

### Alias vs `abbr` (le truc fish que tu vas adorer)
Une **abréviation** s'écrit dans le buffer et se **développe à l'espace/Entrée** — tu vois la vraie commande dans ton historique, et tu peux l'éditer avant de lancer :
```fish
abbr -a gco 'git checkout'
```
Tape `gco` puis espace → ça devient `git checkout` à l'écran. Plus lisible qu'un alias opaque. (Les abbr sont persistées en variable universelle, pas besoin de les remettre dans un fichier.)

### Ajouter une fonction
Soit dans un `conf.d/*.fish`, soit (mieux pour le lazy-load) un fichier dédié :
```fish
# functions/hello.fish
function hello --description 'dit bonjour'
    echo "salut $argv[1]"
end
```
- Args : `$argv` (liste), `$argv[1]` = premier. Pas de `$1`/`$2`.
- `funced hello` = éditer une fonction à chaud ; `funcsave hello` = la persister dans `functions/`.

### Ajouter au PATH
```fish
fish_add_path ~/mon/bin     # idempotent, gère les doublons tout seul
```

### Variables de config utiles
```fish
set -U fish_greeting          # vide le message d'accueil
set -Ux EDITOR micro          # variable Universelle (persiste entre sessions, toutes shells fish)
```
> `-U` = universelle (stockée une fois, dispo partout). C'est l'équivalent fish d'un export "permanent" — pas besoin de l'écrire dans un fichier. **Attention** : ça vit hors du repo, donc pour tes dotfiles versionnés, préfère `set -gx` dans un `conf.d/`.

---

## 5. Ce qui est déjà dispo dans cette config

### Git (`conf.d/git.fish`)
**abbr** (se développent dans le buffer, voir §4) : `g`=git · `gc`=`git commit -v` · `gco`=`git checkout` · `gcp`=`git cherry-pick` · `gst`=`git status`
**alias** : `pgr`=`parallel-git-repo`

> `git` est wrappé en fonction pour forcer `LANG=en_US.UTF-8`. Si tu écris une fonction qui appelle git en interne, utilise **`command git`** sinon récursion infinie.

### Système / macOS (`conf.d/system.fish`)
`pubkey` (clé SSH → presse-papier) · `ip` (IP publique) · `cleanup` (purge `.DS_Store`) · `show`/`hide` (fichiers cachés Finder) · `casks` · `t` (`tree -ah --du`) · `mkpjava` (arbo Maven/Gradle)

### Docker (`conf.d/docker.fish`)
`dco`=`docker compose` (abbr) · `dockerclean` (vieux conteneurs) · `dockercleani` (images `<none>`) · `dockerstop` (tout arrêter) · `dockerhosts` (VIRTUAL_HOST/LETSENCRYPT_HOST)

### Fonctions (`functions/`)
- `extract <archive>` — décompresse n'importe quel format (tar, zip, 7z, zst…)
- `useport <port>` — qui écoute sur ce port
- `grt` — `cd` à la racine du dépôt git
- `vsc` / `vscr` / `vsca` — VSCode (ouvrir / réutiliser fenêtre / ajouter au workspace)

### Outils intégrés
- `z <truc>` — saut de dossier (zoxide). `zi` pour le mode interactif fzf.
- Prompt : **starship** · versions JVM/JS : **mise** · fuzzy : **fzf**

Pour tout lister à tout moment : `abbr`, `alias`, `functions` (liste), `functions <nom>` (voir le code), `type <nom>` (c'est quoi ?).

---

## 6. Gotchas (les vrais pièges)

1. **`$PATH` est une liste, pas une chaîne `:`-séparée.**
   `echo $PATH` sort des espaces. Pour boucler : `for p in $PATH; …; end`. Pour ajouter : `fish_add_path`, jamais `set PATH "$PATH:/x"`.

2. **Pas d'expansion `${VAR:-default}` ni de la plupart des `${...}`.**
   Pour un défaut : `set -q FOO; or set FOO valeur`.

3. **`&&` / `||` marchent en ligne de commande** mais **pas** comme connecteurs dans toutes les positions des vieux scripts. En cas de doute, `; and` / `; or` sont l'idiome fish canonique.

4. **`export VAR=val cmd` (env inline) n'existe pas.**
   `VAR=val cmd` fonctionne pour UNE commande (fish 3.1+), mais pour le persister c'est `set -gx`.

5. **Quoting des variables** : fish ne fait **pas** de word-splitting sur les variables non-quotées (contrairement à bash). `set files (ls)` te donne une liste propre par ligne. C'est un avantage… jusqu'à ce qu'un script copié-collé suppose le splitting bash.

6. **`!!` et `!$` n'existent pas.** Utilise `↑`, ou `$history[1]`, ou Alt-↑.

7. **Substitution de commande qui contient des nouvelles lignes** → fish split par ligne en liste, pas par espace. Pratique, mais surprenant si tu attendais une seule chaîne.

8. **Templates yadm** : ne touche pas un fichier rendu, édite le `##template` puis `yadm alt`. (cf. `CLAUDE.md`)

---

## 7. Plugins (Fisher)

Gérés par **Fisher**, listés dans `fish_plugins` :
- `jorgebucaran/fisher` — le gestionnaire lui-même
- `edc/bass` — exécuter du script **bash** depuis fish (`bass export NVM_DIR=…; source …`). Utile quand un outil ne fournit qu'un init bash/zsh.
- `jorgebucaran/autopair.fish` — ferme automatiquement `()`, `""`, etc.
- `PatrickF1/fzf.fish` — intégration fzf riche (historique, fichiers, git log/status, processus, variables). Remplace `fzf --fish` : ne pas charger les deux, conflit sur `Ctrl-R`.

Commandes :
```fish
fisher install auteur/plugin     # installer
fisher list                      # lister
fisher update                    # tout mettre à jour
fisher remove auteur/plugin      # désinstaller
```
> Le repo versionne `fish_plugins`. Après `fisher install/remove`, le fichier est mis à jour — commit-le.

---

## 8. Pour aller plus loin

- `help` → ouvre la doc fish dans le navigateur. `man fish-tutorial` → le tuto officiel.
- `fish_config` → UI web pour thème de couleurs, prompt, fonctions, historique.
- `fish_key_reader` → savoir quelle séquence envoie une touche (pour les bindings).
- Rebinder une touche : `bind \cg 'commandline -r "git status"; commandline -f execute'` (à mettre dans une fonction `fish_user_key_bindings`).
