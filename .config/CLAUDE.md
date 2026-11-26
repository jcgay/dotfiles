# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
Paths below are relative to `$HOME`, the yadm work tree. `~/CLAUDE.md` only points here, so this guide is not loaded in every project under `$HOME`.

## What this is

Personal macOS dotfiles managed with [yadm](https://yadm.io). yadm is `git` with extras; it tracks files **in place** — no symlinks. The working tree *is* `$HOME`, so `.config/fish/...`, `.gitconfig`, etc. are the real files in use. Nothing to build or lint; the only tests are the Herdr mods' and the Claude scripts' self-checks (see Tests).

## yadm, not git

Outside this checkout, the repo is operated via `yadm <git-subcommand>` (`yadm status`, `yadm add ~/.config/foo`, `yadm commit`, `yadm push`). yadm always points at the dotfiles repo regardless of `cwd`.

## Templates and classes (the main gotcha)

A **class** (`Work` or `Personal`) is stored locally per machine (`yadm config local.class`) and never committed. Files ending in `##template` are rendered by class and by machine architecture:

- Edit the `##template`, **never** the rendered file (`.gitconfig`, `.config/ghostty/config`, `.config/herdr-app/config.json`) — `yadm alt` overwrites it. Run `yadm alt` after editing a template or changing class.
- Rendered outputs are **gitignored**, not tracked (see `.gitignore`), so `yadm status` stays clean regardless of class or architecture.
- yadm has **no external Jinja engine installed**; its built-in processor only handles the **multi-line** `{% if %}` / `{% else %}` / `{% endif %}` form — one directive per line. Inline conditionals silently pass through unrendered.

Templates branch on two axes: the class switches the git `user.email` and the Herdr mods' settings (`.config/herdr-app/config.json##template`: GitHub owners, Jenkins, Jira, QA Docker hosts); `yadm.arch` switches Homebrew-prefix paths (`/opt/homebrew` on Apple Silicon `arm64`, `/usr/local` on Intel `x86_64`) — e.g. the `fish` binary path in `.config/ghostty/config##template` and `.config/yadm/bootstrap`.

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
- `.local/bin/` — personal scripts. `dot` updates everything (yadm pull, brew, mise, `npx skills`, the harness clone on the `Work` class (cloned if bootstrap could not), macOS, Herdr clones via `herdr-upstream`), and after the pull reloads the `fr.jcgay.*` launchd jobs that are missing or whose plist changed (a running one waits for the next `dot`), then names those whose last run failed, and ends with the `launchd-status` summary; `dotup` runs `brew upgrade && cleanup` then `sonar update` when the SonarQube CLI is installed. `wt-prune` (launchd `fr.jcgay.wt-prune`, every morning at 9:00, log in `~/Library/Logs/wt-prune.log`) runs `wt step prune` in every repo with a worktree under `~/dev/agents-worktree`: it also deletes that repo's merged local branches without a worktree; a failure sends a macOS notification and exits 1. `glane-morning` (`Work` class only, the arm Mac that runs the local models; launchd `com.glane.morning`, 7:00, log in `~/.local/state/glane/morning.log`) starts ollama and rapid-mlx, runs `glane update` and stops them. `dot` does not reload `com.glane.*` jobs. `addition [--since Nd] [--by skill|agent|step|model|session] [--compare YYYY-MM-DD] [--json]` ranks what Claude Code costs (API prices, tokens, the agent's active time) from agentsview's archive `~/.agentsview/sessions.db`, opened read-only: a session is cut at each skill (Skill tool or typed `/name`, a built-in command such as `/clear` ends it), sub-agents count in the segment that started them, and `--by step` reads the session ids `status-jc` writes in `herdr-watch.log`; design in `~/docs/superpowers/specs/2026-11-24-addition-design.md`. `launchd-status [name] [lines]` shows each `fr.jcgay.*` and `com.glane.*` job (loaded, running, runs, last exit code, log mtime as last run time since launchd keeps none) and, given a name, only the matching jobs with the end of their log; exits 1 when one listed job failed or is not loaded, or when no job matches the name.
- `Library/Application Support/rtk/config.toml` — rtk's config, tracked for `[hooks] exclude_commands = ["yadm"]`: rtk's Claude hook otherwise rewrites `yadm x` into `rtk git x`, which fails outside a git repo.
- `.config/yadm/bootstrap` — new-machine setup (installs Homebrew, mise tools, Android SDK packages via `sdkmanager`, Fisher; switches shell to fish; sets up Claude Code: marketplaces/plugins via the `claude` CLI, `npx skills` skills, and each tool's own installer for plannotator, codebase-memory-mcp, rtk, build-brief, worktrunk and herdr; merges the `github-signature` hook and base settings into `~/.claude/settings.json` (including `instructionFiles: claude-md-and-agents-md`, so AGENTS.md files load next to CLAUDE.md) and turns on auto-update for GitHub marketplaces; SonarQube CLI/plugin/integration (its MCP server removed right after: the `sonar` CLI covers it), the Vidal `merlin` and `blaise` plugins (always on, the latter installs its CLI), and the `gh repo clone` of the team harness into `~/.local/share/harnais` (see `~/.claude/harnais` below) only for the `Work` class; optional `mackup restore`). Comments are in French. Re-runnable via `yadm bootstrap`.
- `~/.claude/` — Claude Code config. Only hand-written files are tracked (`statusline-command.sh`, `mods/subagent-band/` (a mod: a band above the prompt with each running subagent's model and context fill, loaded through `CLAUDE_CODE_PLUGIN_DIRS`), `mods/commit-guard/` (a mod refusing a `git`/`yadm` commit whose message breaks `rules/git-commit.md`: no Claude `Co-Authored-By`, an em or en dash, no `Closes #N` on a branch with an open PR), `rules/*.md`, `hooks/github-signature`, `scripts/gh-pr-upsert-comment`, `scripts/gh-pr-request-reviewers` (pr-risk asks the reviewers GitHub suggests on my PR when its verdict wants humans), `docs/*.md`, `skills/pr-risk/`, `skills/pr-demo/`, `skills/pr-review/`, `harnais/` (a local plugin named `harnais`, loaded through `CLAUDE_CODE_PLUGIN_DIRS` on the `Work` class only: symlinks to the `testing-pull-requests` skill and the `agents/` folder (its `qa-*` agents) of the `softwarevidal/harnais` clone, which `dot` pulls; the plugin name keeps the `harnais:qa-*` agent types the skill calls, and the real harnais plugin is not installed to keep out its hooks, rules and dependencies; Claude Code ignores a symlinked agent file, hence the whole folder): see its whitelist `.gitignore`). `settings.json` and `CLAUDE.md` are not tracked: plugins, MCP, hooks and the rtk/build-brief sections of `CLAUDE.md` are redone by bootstrap.

## Plugins and skills per project

`.local/bin/claude` wraps Claude Code (it comes before Homebrew in `PATH`, and Herdr's `start-work` runs it too). When a session starts, it reads the git repo's tracked files and passes `--settings` to turn back on the plugins and skills that repo needs: Docker, Gradle, Jenkins, SonarQube, front-end. They are off by default: bootstrap writes the output of `claude --wrapper-defaults` into `~/.claude/settings.json`, as `enabledPlugins: false` and `skillOverrides: "user-invocable-only"` (hidden from the model, `/name` still works). The rule table at the top of the wrapper is the only list; `claude.test` checks it. Claude Code comes from Homebrew (`claude-code@latest` cask): never run its native installer (`claude install`, `install.sh`), which writes its symlink at `~/.local/bin/claude` and silently replaces the wrapper (a modified file in `yadm status`).

**Every new plugin or skill (bootstrap, `npx skills`, `claude plugin install`) goes through this table**: give it a rule (a file signal) or decide it stays always on, and say which in the commit. A plugin left out of the table loads in every session.

## Herdr desktop app

`.config/herdr-app/` is the Herdr app's whole interface as files; its own `AGENTS.md` (rewritten by Herdr on every start, not tracked) documents layouts, keys, mods and their APIs (a block's layout props come from `props()`, not `init`'s argument). Claude Code loads it on its own the first time it reads a file of that folder with the Read tool (not `cat`): bootstrap sets `instructionFiles` to `claude-md-and-agents-md`, because by default `~/CLAUDE.md` above every repo turns AGENTS.md off ([docs](https://code.claude.com/docs/en/memory#agents-md)). Before changing a mod, Read a file there so it loads. `herdr-app --skill` and `hc --skill` print the manuals for driving the window and its terminals; `herdr-app status` reports the window's mod errors and `herdr-app shot <file.png>` captures it without any macOS permission. Herdr overwrites its shipped layouts and mods at start, so customizations live in clones: the `jc` layout and the `spaces-jc` (a repo's `.idea/icon.svg`, `icon_dark.svg` or `icon.png` as space avatar), `status-jc` and `tabs-jc` mods. `spaces-jc` also has a folder button in its header that opens `projects`. `pr` (three views of the side panel: the shown branch's PR, the PR watch, and `ci` (`cmd-shift-i`), the last Jenkins build (GitHub Actions run without Jenkins) of the long-lived branches of the repos I contributed to this week, with a Corriger button that starts Claude on a `fix/ci-<branch>-<N>` worktree), `start-work`, `projects` (`cmd-shift-o`: a space on any repo at the root of `~/dev`, recently opened first) and `journal` (what the PR watch and armed merge did, read from `~/Library/Logs/herdr-watch.log` that `status-jc` writes) are our own mods, not clones. A new mod folder is placed by Herdr as a block at the root of the shown layout (it wrote one into `jc.json`) the first time it sees it, before its `mod.json` says `"place": "none"`: write `mod.json` first, and check `yadm diff` of the layout after adding a mod. `start-work` (`cmd-shift-j`) starts a Jira ticket or GitHub issue in a new worktree with Claude, or resumes a PR (`#N` or its URL) on its branch; it reads the repo's Jira projects from its commit subjects unless `mods/start-work/config.json` names them (`{"jira": {"<repo>": ["MERLIN"]}}`), and its design and plan are in `.config/herdr-app/docs/`. What differs between the work and personal machines (GitHub `owners` the mods follow, the Jenkins folder, Jira's URL and my address, the QA Docker hosts) lives in `.config/herdr-app/config.json`, rendered by `yadm alt` from `config.json##template` per class; without it, `status-jc`, `pr` and `start-work` touch no GitHub or Jira. The `gpui-kit.d.ts` and `jsconfig.json` Herdr writes into each mod are gitignored; never commit them. Check a mod with `herdr-app check ~/.config/herdr-app/mods/<name>`.

**Keep `.config/herdr-app/README.md` in sync**: a hand-written French cheatsheet (keys, the `jc` layout, our mods, the CLI). Update it when `keys.json`, the `jc` layout or a mod's behavior changes, along with that mod's own `README.md`.

**The PR panel's help restates `status-jc` by hand**: a mod cannot import another mod's files, so `STEP_HELP`, `STATE_HELP` and `LABEL_HELP` in `mods/pr/main.js` (its `?` help and the label tooltips) copy what `status-jc`'s `watch.js` (`decide()`, `LABELS`) and `pipeline.js` (`bandOf()`) do. A renamed, added or changed step, state, label or button there needs the same change in these texts.

Herdr never updates a clone, so the originals of our clones are committed too (`layouts/main.json`, `mods/tabs/`, `mods/workspace-status/`): they are the merge base. `herdr-upstream`, run by `dot`, finds every clone through its `cloned_from` and, when Herdr changed the original since the last commit, merges that change into the clone with `git merge-file`, after rewriting `mods/<original>/` asset paths to the clone's as `mod.clone` does. `keys.json` is merged the same way: Herdr stops upgrading it once edited, so the script reads Herdr's current default keys from the `herdr-app` binary into `keys.default.json` (committed, the merge base) and merges its changes into `keys.json`. A conflict leaves the clone untouched and writes `<file>.conflict`; the script exits non-zero.

- **Cloning another layout or mod:** use `layout.clone` / `mod.clone` (they write `cloned_from`), and commit the original in the same commit as the clone: the layout JSON, or every file of the mod folder except the two generated ones. Without it, `herdr-upstream` warns that the clone has no merge base.
- **After an update:** resolve any `.conflict` into the clone, run `herdr-app check`, then commit the clones and the new originals together; the new originals become the next merge base. Line merges conflict on adjacent lines, which in a layout JSON is often a field next to one we changed.

## Tests

A mod keeps the logic worth testing (parsing `lsof`, `gh`, `jk` or `docker inspect` output, matching ports or deployments) in a pure module that imports nothing from Herdr (`ports.js`, `model.js`), next to a `*.test.mjs` for `node:test`. Run them all with:

```sh
node --test ~/.config/herdr-app/mods/*/*.test.mjs
```

GitHub Actions (`.github/workflows/test.yml`) runs the same command on every push and pull request, on the Node version of `.config/mise/config.toml`. A new mod's `*.test.mjs` is picked up by the glob; keep `herdr` imports out of the module it tests, or Node cannot load it.

The Claude scripts (`~/.claude/scripts`, `hooks`, `skills/pr-review/scripts`, `statusline-command.sh`, `.local/bin/claude`, `.local/bin/wt-prune`, `.local/bin/launchd-status`, `.local/bin/addition`) carry bash self-checks (with a fake `gh` or `claude` where they call one), named `*.test` or `*_test.sh`. CI runs them too; locally, from `~`:

```sh
for t in .claude/scripts/*.test .claude/hooks/*.test .claude/skills/pr-review/scripts/*_test.sh .local/bin/claude.test .local/bin/wt-prune.test .local/bin/launchd-status.test .local/bin/addition.test .claude/statusline-command.test; do bash "$t" || echo "FAIL $t"; done
```

`skills/pr-demo/scripts/narrate_test.sh` needs ffmpeg and a speech engine, so it is run by hand only.

The Claude mods (`~/.claude/mods/*`) are tested with the `claude` CLI, so by hand only, not in CI: `for m in ~/.claude/mods/*/; do claude plugin test "$m" || echo "FAIL $m"; done`.

## Conventions

- Commit messages use Conventional Commits (`feat(...)`, `fix(...)`, `chore: ...`) — match recent history.
- Default branch for PRs is `master`.
- **Every change updates the READMEs it touches**, in the same commit: `.config/fish/README.md`, `.config/herdr-app/README.md`, each mod's `README.md`, a skill's `SKILL.md` or README, this file. They are hand-written, nothing regenerates them: before committing, reread the README of every folder the diff touches and fix what the change made wrong or left out.
