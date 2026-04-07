# Brewfile Cleanup & Modernisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove 15 outdated/abandoned/replaced Brewfile entries, add 8 tools (including 4 already in use but missing from Brewfile), and migrate `.gitconfig` from diff-so-fancy to delta.

**Spec:** `docs/superpowers/specs/2026-04-07-brewfile-cleanup-design.md`

---

## Files

| File | Action |
|------|--------|
| `~/.Brewfile` | Remove 15 entries, add 8 entries |
| `~/.gitconfig` | Remove `[color "diff-highlight"]`, update `[core] pager`, add `[interactive]` and `[delta]` sections |

---

### Task 1: Edit Brewfile

- [ ] **Step 1: Remove outdated entries**

Remove these lines from `~/.Brewfile`:

```
brew "lastpass-cli"
cask "lastpass"
mas "LastPass", id: 926036361
cask "authy"
cask "virtualbox"
cask "vagrant"
cask "vagrant-manager"
cask "nvalt"
brew "jenv"
brew "hub"
brew "markdown"
cask "betterzip"
cask "iterm2"
brew "the_silver_searcher"
brew "diff-so-fancy"
```

- [ ] **Step 2: Add new entries**

Add in the appropriate sections:

```
# brews
brew "ripgrep"
brew "git-delta"
brew "fd"
brew "eza"
brew "fzf"
brew "grc"
```

```
# casks
cask "ghostty"
cask "bitwarden"
```

- [ ] **Step 3: Commit**

```bash
yadm add ~/.Brewfile
yadm commit -m "chore(brew): remove outdated tools, add missing and modern replacements"
```

---

### Task 2: Install new tools

- [ ] **Step 1: Install brew formulas**

```bash
brew install ripgrep git-delta fd eza fzf grc
```

- [ ] **Step 2: Install casks**

```bash
brew install --cask ghostty bitwarden
```

Note: `ghostty` may already be installed outside Homebrew. If so, `brew install --cask ghostty` will either skip or reinstall — both are fine.

- [ ] **Step 3: Verify each tool**

```bash
rg --version | head -1          # ripgrep
delta --version                  # git-delta
fd --version | head -1           # fd
eza --version | head -1          # eza
fzf --version                    # fzf
grc --version 2>&1 | head -1     # grc
ghostty --version 2>&1 | head -1 # ghostty
ls /Applications/Bitwarden.app   # bitwarden cask
```

All should succeed.

---

### Task 3: Edit .gitconfig for delta

> **delta must be installed (Task 2) before this task** — `core.pager = delta` will cause git commands to fail if delta is not yet on PATH.

- [ ] **Step 1: Replace the pager (surgical edit)**

```bash
git config --global core.pager delta
```

Verify: `git config --global core.pager` → should output `delta`

- [ ] **Step 2: Add interactive diff filter**

```bash
git config --global interactive.diffFilter "delta --color-only"
```

- [ ] **Step 3: Add delta configuration section**

```bash
git config --global delta.navigate true
git config --global delta.side-by-side true
git config --global delta.line-numbers true
git config --global delta."syntax-theme" "Monokai Extended"
```

- [ ] **Step 4: Remove the `[color "diff-highlight"]` section**

Remove these 5 lines from `~/.gitconfig`:

```
[color "diff-highlight"]
    oldNormal = red bold
    oldHighlight = red bold 52
    newNormal = green bold
    newHighlight = green bold 22
```

Use a direct file edit (not `git config` — `git config` cannot remove sections with spaces in the name).

- [ ] **Step 5: Verify delta in git**

In any git repo with recent changes:

```bash
git diff HEAD~1 2>/dev/null | head -20
```

Expected: syntax-highlighted, side-by-side output with line numbers. If plain text, re-check gitconfig.

- [ ] **Step 6: Commit**

```bash
yadm add ~/.gitconfig
yadm commit -m "feat(git): migrate from diff-so-fancy to delta"
```

---

### Task 4: Uninstall removed tools

- [ ] **Step 1: Uninstall brew formulas**

```bash
brew uninstall --ignore-dependencies the_silver_searcher diff-so-fancy markdown jenv hub 2>/dev/null || true
```

`--ignore-dependencies` prevents failures if something still depends on these.

- [ ] **Step 2: Uninstall casks**

```bash
brew uninstall --cask lastpass authy betterzip iterm2 2>/dev/null || true
brew uninstall --cask virtualbox vagrant vagrant-manager nvalt 2>/dev/null || true
```

Some may not be installed (e.g. vagrant-manager may have been installed via DMG). Errors are non-fatal.

- [ ] **Step 3: Uninstall LastPass from Mac App Store**

```bash
mas uninstall 926036361
```

Note: may require confirmation or fail if the app isn't in the MAS-installed list. Non-fatal.

---

### Task 5: Push

- [ ] **Step 1: Final check**

```bash
yadm --no-pager log --oneline -5
```

Expected: 2 commits from this migration at the top.

- [ ] **Step 2: Push**

```bash
yadm push
```
