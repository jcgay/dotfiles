# Layouts

| Fichier | C'est quoi |
|---|---|
| `jc.json` | **Notre layout**, clone de `main` (Herdr 0.1.15). C'est lui qu'on modifie. |
| `main.json` | L'original livré par Herdr, commité comme base de fusion pour `herdr-upstream`. Ne pas le modifier : Herdr le réécrit au démarrage. |
| `terminals.json`, `win98.json`, `win98.svg` | Autres layouts livrés par Herdr, pas utilisés. |

## Le layout `jc`

Même structure que `main`, avec quatre différences : trois blocs pointent vers nos clones, et le panneau latéral a un troisième onglet.

```
root (row)
├── sidebar (268 px)
│   ├── brand ─────────────── workspace-chrome
│   ├── sidebar-lists
│   │   ├── spaces ────────── spaces-jc   (main : spaces)
│   │   └── agents ────────── agents
│   └── sidebar-footer ────── workspace-chrome
└── work
    ├── tabs (42 px) ──────── tabs-jc     (main : tabs)
    ├── work-body (row)
    │   ├── main ──────────── pane (les terminaux)
    │   └── panel (368 px, caché au départ)
    │       └── panel-body (stack, actif : files)
    │           ├── files ─── files
    │           ├── changes ─ changes
    │           └── pr ────── pr          (absent de main)
    └── status (28 px) ────── status-jc   (main : workspace-status)
```

Les boutons de `tabs-jc` ouvrent `panel` sur un de ses onglets, et le panneau est mémorisé par space.

Chaque mod a son README : [`spaces-jc`](../mods/spaces-jc/README.md), [`tabs-jc`](../mods/tabs-jc/README.md), [`pr`](../mods/pr/README.md), [`status-jc`](../mods/status-jc/README.md), et [`start-work`](../mods/start-work/README.md) (pas dans le layout : il s'ouvre en popup sur `⌘⇧J`).

## Quand Herdr se met à jour

Herdr ne touche jamais à `jc.json`. `herdr-upstream`, lancé par `dot`, compare `main.json` livré au `main.json` commité et reporte la différence dans `jc.json` avec `git merge-file`. Un conflit laisse `jc.json` intact et écrit `jc.json.conflict` : le résoudre à la main, lancer `herdr-app check`, puis commiter `jc.json` et le nouveau `main.json` ensemble. Les fusions ligne à ligne butent souvent sur un champ voisin d'un champ qu'on a changé. Détails dans `~/.config/CLAUDE.md`, section « Herdr desktop app ».
