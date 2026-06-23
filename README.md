# dotfiles

My personal macOS dotfiles, managed with [yadm](https://yadm.io)
(Yet Another Dotfiles Manager).

yadm is just `git` with a few extras. It tracks files **in place** in your
home directory — there are no symlinks. The repo's working tree *is* `$HOME`,
so `~/.gitconfig`, `~/.config/fish/...`, etc. are the real files git versions.

---

## What's in here

| Area | Tool | Where |
|------|------|-------|
| Shell | [fish](https://fishshell.com) (+ legacy zsh config) | `.config/fish/`, `.config/zsh/` |
| Prompt | [starship](https://starship.rs) | `.config/starship.toml` |
| Packages | [Homebrew](https://brew.sh) global Brewfile | `.Brewfile` |
| JVM tools (Java, Gradle, Kotlin…) | [mise](https://mise.jdx.dev) | `.config/mise/config.toml` |
| JS runtime | [Volta](https://volta.sh) | — |
| fish plugins | [Fisher](https://github.com/jorgebucaran/fisher) | `.config/fish/fish_plugins` |
| App preferences | [Mackup](https://github.com/lra/mackup) (synced via Google Drive) | `.mackup.cfg` |
| Personal scripts | — | `.local/bin/` |
| Terminal | [Ghostty](https://ghostty.org) | `.config/ghostty/config` |

---

## Set up a new machine

```bash
# 1. Install yadm (it bootstraps the rest)
brew install yadm        # or: see https://yadm.io/docs/install

# 2. Clone this repo into $HOME and run the bootstrap automatically
yadm clone git@github.com:jcgay/dotfiles.git
```

On clone, yadm asks to run [`.config/yadm/bootstrap`](.config/yadm/bootstrap),
which:

1. Asks the machine **class** — `Work` or `Personal` (see below).
2. Installs Homebrew, then `brew bundle --global` (everything in `.Brewfile`).
3. `git lfs install`.
4. Switches the default shell to fish.
5. Creates the Go workspace, installs Volta, runs `mise install`.
6. Installs Fisher + fish plugins.
7. Optionally runs `mackup restore` (needs Google Drive synced first).

Re-run it any time with:

```bash
yadm bootstrap
```

---

## Daily workflow (yadm cheat-sheet)

Everything you know from git, prefixed with `yadm`. Run these from **anywhere**
— yadm always points at the dotfiles repo, not your current directory.

```bash
yadm status                 # what changed in your tracked dotfiles
yadm add ~/.config/foo      # start tracking a file (or stage a change)
yadm commit -m "message"
yadm push                   # send to GitHub
yadm pull                   # get changes on another machine

yadm diff                   # review unstaged changes
yadm list -a                # list every file yadm tracks
```

To track a brand-new config file, just `yadm add` it — yadm copies nothing and
moves nothing; the file stays exactly where it is.

### The `dot` script

[`dot`](.local/bin/dot) is a convenience updater (run it periodically):

```bash
dot      # yadm pull + brew update + show outdated + mise upgrade + macOS updates
dotup    # brew upgrade && brew cleanup
```

---

## Classes: Work vs Personal

A **class** lets one repo behave differently per machine. It's set once per
machine and stored *locally* (never committed):

```bash
yadm config local.class        # show current class
yadm config local.class Work   # change it, then run `yadm alt`
```

Right now the class only switches the git email (see templates below), but any
template or alternate file can branch on it.

---

## Templates

A file ending in `##template` is rendered by yadm into the real file, using the
machine's class and other facts. Example —
[`.gitconfig##template`](.gitconfig##template):

```jinja
[user]
	name = Jean-Christophe Gay
{% if yadm.class == "Work" %}
	email = jean-christophe.gay@vidal.fr
{% else %}
	email = contact@jeanchristophegay.com
{% endif %}
```

yadm renders this to `~/.gitconfig` based on the class. To re-render after
editing the template or changing the class:

```bash
yadm alt
```

> **Edit the `##template` file, never the rendered `~/.gitconfig` directly** —
> the next `yadm alt` would overwrite your changes.

> ⚠️ **Known wart:** both `.gitconfig##template` *and* the rendered `.gitconfig`
> are currently tracked, so `yadm status` may show `.gitconfig` as "modified"
> whenever your class differs from whatever was last committed. The clean fix is
> to stop tracking the rendered output: `yadm rm --cached ~/.gitconfig` and add
> it to yadm's gitignore. Left as-is for now.

---

## Mackup (app preferences)

Mackup syncs GUI app preferences (IntelliJ, VS Code, Rectangle, …) through
Google Drive — these are *not* in this repo, only the
[`.mackup.cfg`](.mackup.cfg) manifest is.

```bash
mackup backup    # push current app prefs to Google Drive
mackup restore   # pull them onto a new machine
```

---

## Useful links

- yadm docs: https://yadm.io/docs/overview
- `man yadm` covers every subcommand
- This repo: https://github.com/jcgay/dotfiles
