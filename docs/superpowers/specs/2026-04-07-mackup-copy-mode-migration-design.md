# Mackup Link → Copy Mode Migration

**Date:** 2026-04-07  
**Status:** Approved

## Problem

mackup is currently configured in **link mode**: config files are replaced by symlinks pointing to
`~/Google Drive/Mon Drive/Mackup/`. macOS 14 (Sonoma) and later silently ignore symlinked
`~/Library/Preferences/*.plist` files, breaking GUI app preferences. An upgrade to Sonoma is
imminent.

Currently affected (symlinks in `~/Library/`):
- `~/Library/Preferences/com.spotify.client.plist`
- `~/Library/Preferences/IntelliJIdea2019.3`
- `~/Library/Preferences/ch.sudo.cyberduck.plist`
- `~/Library/Preferences/net.elasticthreads.nv.plist`
- `~/Library/Preferences/com.lightheadsw.Caffeine.plist`
- `~/Library/Application Support/IntelliJIdea2019.3`

Files outside `~/Library/` (e.g. `~/.ssh/config`, `~/.gnupg/`, `~/.gradle/`) are NOT affected
by the Sonoma restriction but are also converted in this migration for consistency.

## Solution

Switch from link mode to **copy mode** using mackup's built-in uninstall command.

### Step 0 — Upgrade mackup (prerequisite)

`mackup link uninstall` and the new copy-mode `mackup restore` semantics only exist in
**mackup ≥ 0.10.x**. Currently installed: **0.8.43**. Must upgrade first:

```bash
brew upgrade mackup   # installs 0.10.2
```

> In 0.8.43, `mackup link uninstall` does not exist and `mackup restore` creates symlinks.
> The upgrade must happen on **both machines** before running any mackup commands.

### Step 1 — Verify Google Drive is fully synced

`mackup link uninstall` reads files from `~/Google Drive/Mon Drive/Mackup/`. If Google Drive
is not synced, it would copy stale or empty files — a data loss scenario. Before running:
- Check the Google Drive menu bar icon shows no pending uploads/downloads
- Optionally: `ls "~/Google Drive/Mon Drive/Mackup/"` to confirm files are present

### Step 2 — Run `mackup link uninstall`

```bash
mackup link uninstall
```

This command:
1. Identifies every symlink managed by mackup
2. Removes the symlink
3. Copies the backing file from `Google Drive/Mon Drive/Mackup/` back to its original location
4. The Google Drive copy is kept intact (used as the backup source)

### Step 3 — Verify no symlinks remain

```bash
find ~ -lname "*/Google Drive/Mon Drive/Mackup/*" 2>/dev/null
# Must return empty — any output = unconverted symlinks still present
```

### Step 4 — Apply to second machine

Repeat steps 0–3 on the other machine. No coordination required between the two machines
beyond both being upgraded to 0.10.x before using `mackup backup`.

### Ongoing workflow (post-migration)

| Action | Command |
|--------|---------|
| Back up config changes | `mackup backup` |
| Restore on a new/other machine | `mackup restore` |

In mackup ≥ 0.10.x, `mackup backup` and `mackup restore` copy files without creating symlinks —
fully compatible with Sonoma and all future macOS versions.

### `.mackup.cfg`

No changes needed. `engine = file_system` with `path = Google Drive/Mon Drive` is already the
correct storage config for copy mode.

### Bootstrap

`~/.config/yadm/bootstrap` already calls `mackup restore`. This continues to work correctly
**after the upgrade to 0.10.x**, where `mackup restore` copies files instead of creating symlinks.

## Out of Scope

- Migrating tool dotfiles (`~/.ssh`, `~/.gnupg`, `~/.gradle`, etc.) to yadm — future work
- Removing mackup entirely — possible later once native app sync (JetBrains Sync, VSCode Sync)
  is verified as covering all needs
- Handling secrets in dotfiles (yadm encrypt) — separate concern, future work
