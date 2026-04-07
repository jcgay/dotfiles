# Mackup Copy Mode Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert mackup from link mode (symlinks) to copy mode (file copies) on both machines, making the setup compatible with macOS 14+ (Sonoma) before the upcoming OS upgrade.

**Architecture:** Upgrade mackup to 0.10.x on each machine, then run `mackup link uninstall` which replaces every managed symlink with a real file copied from Google Drive. After migration, `mackup backup` / `mackup restore` operate in copy mode (no symlinks).

**Tech Stack:** mackup 0.10.2, Homebrew, yadm, Google Drive desktop client

---

## Files

| File | Action | Why |
|------|--------|-----|
| `~/.Brewfile` | Modify | Add `brew "mackup"` so bootstrap installs it on new machines |

No other files change — `.mackup.cfg`, bootstrap, and all managed config files stay as-is after migration.

---

### Task 1: Add mackup to Brewfile + upgrade to 0.10.2

**Files:**
- Modify: `~/.Brewfile`

- [ ] **Step 1: Add mackup to Brewfile**

Open `~/.Brewfile` and add in the appropriate section:
```
brew "mackup"
```

- [ ] **Step 2: Upgrade mackup**

```bash
brew upgrade mackup
```

Expected output: `mackup 0.8.43 -> 0.10.2`

- [ ] **Step 3: Verify version**

```bash
mackup --version
```

Expected: `Mackup 0.10.2`

- [ ] **Step 4: Verify `link uninstall` subcommand exists**

```bash
mackup link --help
```

Expected: help text mentioning `install`, `link`, `uninstall` subcommands (no "command not found" error).

- [ ] **Step 5: Commit**

```bash
yadm add ~/.Brewfile
yadm commit -m "chore(mackup): add to Brewfile, upgrade to 0.10.2 for copy mode support"
```

---

### Task 2: Convert link mode → copy mode (this machine)

**Prerequisite:** Google Drive must be fully synced before running this task.

- [ ] **Step 1: Verify Google Drive is synced**

```bash
ls ~/Google\ Drive/Mon\ Drive/Mackup/ | head -10
```

Expected: list of config files/directories. If the directory is empty or missing, stop — Google Drive is not synced.

- [ ] **Step 2: Snapshot existing symlinks (safety record)**

```bash
find ~ -lname "*/Google Drive/Mon Drive/Mackup/*" 2>/dev/null | sort
```

Expected output (these should ALL be gone after migration):
```
/Users/jcgay/.cheat
/Users/jcgay/.config/htop/htoprc
/Users/jcgay/.config/hub
/Users/jcgay/.gnupg/gpg-agent.conf
/Users/jcgay/.gnupg/gpg.conf
/Users/jcgay/.gnupg/trustdb.gpg
/Users/jcgay/.gradle/gradle.properties
/Users/jcgay/.gradle/init.d
/Users/jcgay/.gradle/init.gradle
/Users/jcgay/.htoprc
/Users/jcgay/.mackup
/Users/jcgay/.sbt/0.13/plugins/build.sbt
/Users/jcgay/.ssh/config
/Users/jcgay/.wget-hsts
/Users/jcgay/Library/Application Support/IntelliJIdea2019.3
/Users/jcgay/Library/Preferences/IntelliJIdea2019.3
/Users/jcgay/Library/Preferences/ch.sudo.cyberduck.plist
/Users/jcgay/Library/Preferences/com.lightheadsw.Caffeine.plist
/Users/jcgay/Library/Preferences/com.spotify.client.plist
/Users/jcgay/Library/Preferences/net.elasticthreads.nv.plist
```

- [ ] **Step 3: Run the conversion**

```bash
mackup link uninstall
```

This removes each symlink and copies the real file from Google Drive back to its original location. No data is deleted from Google Drive.

- [ ] **Step 4: Verify all symlinks are gone**

```bash
find ~ -lname "*/Google Drive/Mon Drive/Mackup/*" 2>/dev/null
```

Expected: **empty output**. If any paths are listed, the conversion did not complete — investigate before continuing.

- [ ] **Step 5: Spot-check a few files are real files**

```bash
file ~/.ssh/config
file ~/Library/Preferences/com.spotify.client.plist
```

Expected: output describing a real file (e.g. `ASCII text`, `Apple binary property list`), NOT `symbolic link`.

- [ ] **Step 6: Verify mackup still works**

```bash
mackup backup
```

Expected: command completes without error and copies files to Google Drive (no symlinks created).

---

### Task 3: Migrate second machine (Personal)

> This task must be performed on the Personal machine. Repeat Tasks 1 and 2 there.

- [ ] **Step 1: Pull yadm changes (gets updated Brewfile)**

```bash
yadm pull
```

- [ ] **Step 2: Upgrade mackup**

```bash
brew upgrade mackup
```

Expected: `mackup 0.10.2` (or already at 0.10.2 after brew bundle).

- [ ] **Step 3: Verify Google Drive is synced**

```bash
ls ~/Google\ Drive/Mon\ Drive/Mackup/ | head -10
```

Expected: list of files (confirms sync is complete).

- [ ] **Step 4: Run the conversion**

```bash
mackup link uninstall
```

- [ ] **Step 5: Verify all symlinks are gone**

```bash
find ~ -lname "*/Google Drive/Mon Drive/Mackup/*" 2>/dev/null
```

Expected: empty output.

- [ ] **Step 6: Spot-check**

```bash
file ~/.ssh/config
```

Expected: real file, not a symlink.

---

## Ongoing Workflow Reference

| Situation | Command |
|-----------|---------|
| Save current configs to Google Drive | `mackup backup` |
| Restore configs on a fresh machine | `mackup restore` |

Both commands now operate in copy mode (no symlinks) — safe on Sonoma and all future macOS.
