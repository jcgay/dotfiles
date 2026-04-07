# Brewfile Cleanup & Modernisation

**Date:** 2026-04-07  
**Status:** Approved

## Problem

The Brewfile has accumulated outdated, abandoned, and redundant tools over the years. Several
tools have been superseded by faster/better alternatives, security incidents have made some
untrustworthy, and some are simply no longer used. Additionally, tools actively in use (ghostty,
fzf, grc, bitwarden) are missing from the Brewfile, meaning a fresh install would be broken.

The `.gitconfig` still references `diff-so-fancy` which is being replaced by `delta`.

## Scope

Two files are modified: `~/.Brewfile` and `~/.gitconfig`. Both are yadm-tracked.

---

## Brewfile Changes

### Remove

| Entry | Reason |
|-------|--------|
| `brew "lastpass-cli"` | Migrated to Bitwarden; LastPass had major breaches in 2022–2023 |
| `cask "lastpass"` | Same |
| `mas "LastPass", id: 926036361` | Same |
| `cask "authy"` | Desktop app discontinued August 2024 |
| `cask "virtualbox"` | No longer used; not supported on Apple Silicon |
| `cask "vagrant"` | No longer used |
| `cask "vagrant-manager"` | No longer used |
| `cask "nvalt"` | Abandoned since ~2016, no replacement needed |
| `brew "jenv"` | Replaced by mise (migration complete) |
| `brew "hub"` | Deprecated; `gh` (already in Brewfile) is the official replacement |
| `brew "markdown"` | Redundant; pandoc (already in Brewfile) covers all markdown conversion |
| `cask "betterzip"` | Redundant; `unar` + `cask "the-unarchiver"` already installed |
| `cask "iterm2"` | Replaced by Ghostty as primary terminal |
| `brew "the_silver_searcher"` | Replaced by ripgrep (faster, actively maintained) |
| `brew "diff-so-fancy"` | Replaced by delta (richer: syntax highlighting, line numbers, side-by-side) |

### Add

| Entry | Reason |
|-------|--------|
| `cask "ghostty"` | Primary terminal — actively used but missing from Brewfile |
| `brew "fzf"` | Referenced in `config.fish` — new machine install would be broken without it |
| `brew "grc"` | Referenced in `system.fish` — same issue |
| `cask "bitwarden"` | Migrated from LastPass — missing from Brewfile |
| `brew "ripgrep"` | Replaces `the_silver_searcher`; used by VS Code and fish internals |
| `brew "delta"` | Replaces `diff-so-fancy`; requires `.gitconfig` update (see below) |
| `brew "fd"` | Modern `find` replacement; complements fzf |
| `brew "eza"` | Modern `ls` replacement with git status, colours, and nerd font icons |

---

## `.gitconfig` Changes

### Remove

The `[color "diff-highlight"]` section is specific to diff-so-fancy and no longer needed:

```ini
[color "diff-highlight"]
    oldNormal = red bold
    oldHighlight = red bold 52
    newNormal = green bold
    newHighlight = green bold 22
```

The `[core]` pager entry referencing diff-so-fancy:

```ini
[core]
    pager = "diff-so-fancy | cat"
```

### Add / Replace

Replace `[core] pager` with:

```ini
[core]
    pager = delta
```

Add new sections:

```ini
[interactive]
    diffFilter = delta --color-only

[delta]
    navigate = true
    side-by-side = true
    line-numbers = true
    syntax-theme = Monokai Extended
```

> Note: `navigate = true` enables `n`/`N` to jump between diff sections.
> `syntax-theme` can be customised; `Monokai Extended` is a safe default.
> The existing `[diff] colorMoved = zebra` is compatible with delta and can stay.

---

## Out of Scope

- `brew "zsh"` + `brew "antidote"` — removed in task `f13-zsh-cleanup` (already planned)
- `cask "caffeine"` — still usable, removal deferred
- `cask "soapui"` — deferred (may still be needed for SOAP projects)
- `cask "textmate"` — deferred (still maintained; low priority)
- Tools from GitHub stars (yazi, proxyman, aerospace, lnav, presenterm) — deferred
