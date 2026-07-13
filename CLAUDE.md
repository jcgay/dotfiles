# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Personal macOS dotfiles managed with [yadm](https://yadm.io). yadm is `git` with extras; it tracks files **in place** — no symlinks. The working tree *is* `$HOME`, so `.config/fish/...`, `.gitconfig`, etc. are the real files in use. There is nothing to build, test, or lint.

## yadm, not git

Outside this checkout, the repo is operated via `yadm <git-subcommand>` (`yadm status`, `yadm add ~/.config/foo`, `yadm commit`, `yadm push`). yadm always points at the dotfiles repo regardless of `cwd`.

## Templates and classes (the main gotcha)

A **class** (`Work` or `Personal`) is stored locally per machine (`yadm config local.class`) and never committed. Files ending in `##template` are rendered by class and by machine architecture:

- Edit the `##template`, **never** the rendered file (`.gitconfig`, `.config/ghostty/config`) — `yadm alt` overwrites it. Run `yadm alt` after editing a template or changing class.
- Rendered outputs are **gitignored**, not tracked (see `.gitignore`), so `yadm status` stays clean regardless of class or architecture.
- yadm has **no external Jinja engine installed**; its built-in processor only handles the **multi-line** `{% if %}` / `{% else %}` / `{% endif %}` form — one directive per line. Inline conditionals silently pass through unrendered.

Templates branch on two axes: the class switches the git `user.email`; `yadm.arch` switches Homebrew-prefix paths (`/opt/homebrew` on Apple Silicon `arm64`, `/usr/local` on Intel `x86_64`) — e.g. the `fish` binary path in `.config/ghostty/config##template` and `.config/yadm/bootstrap`.

## fish shell config

- `.config/fish/conf.d/*.fish` files load **before** `config.fish` (alphabetical). Tool init that must run last (starship, mise, fzf) lives in `config.fish`.
- `~/.localrc.fish` is sourced at the end of `config.fish` for secrets/per-machine overrides — **not tracked**. Put machine-specific or sensitive values there, never in tracked files.
- `git` is wrapped as a fish function forcing `LANG=en_US.UTF-8`; internal calls must use `command git` to avoid recursion (see `conf.d/git.fish`).
- Plugins are managed by Fisher via `.config/fish/fish_plugins`.
- **Keep `.config/fish/README.md` in sync** with any fish config change (aliases/abbr, key bindings, functions, plugins). It's a hand-written zsh→fish onboarding guide, not generated — update the relevant section when behavior changes.

## Where things live

- `.Brewfile` — Homebrew packages (`brew bundle --global`).
- `.config/mise/config.toml` — JVM/JS toolchain versions (mise).
- `.mackup.cfg` — manifest of GUI app prefs synced via Google Drive (Mackup). The prefs themselves are **not** in this repo.
- `.local/bin/` — personal scripts. `dot` updates everything (yadm pull, brew, mise, macOS); `dotup` runs `brew upgrade && cleanup`.
- `.config/yadm/bootstrap` — new-machine setup (installs Homebrew, Volta, SonarQube CLI, mise tools, Fisher; switches shell to fish; installs Claude Code marketplaces/plugins + the codebase-memory MCP server via the `claude` CLI; optional `mackup restore`). Comments are in French. Re-runnable via `yadm bootstrap`.
- `~/.claude/` — Claude Code config. Only `statusline-command.sh` is tracked (see its whitelist `.gitignore`); plugins/MCP are reinstalled by bootstrap, not tracked as files.

## Conventions

- Commit messages use Conventional Commits (`feat(...)`, `fix(...)`, `chore: ...`) — match recent history.
- Default branch for PRs is `master`.
