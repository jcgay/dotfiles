# Mackup Link → Copy Mode Migration

**Date:** 2026-04-07  
**Status:** Approved

## Problem

mackup is currently configured in **link mode**: config files are replaced by symlinks pointing to
`~/Google Drive/Mon Drive/Mackup/`. macOS 14 (Sonoma) and later silently ignore symlinked
`~/Library/Preferences/*.plist` files, breaking GUI app preferences. An upgrade to Sonoma is
imminent.

Currently broken on Sonoma:
- `~/Library/Preferences/com.spotify.client.plist`
- `~/Library/Preferences/ch.sudo.cyberduck.plist`
- `~/Library/Preferences/com.lightheadsw.Caffeine.plist`
- `~/Library/Preferences/net.elasticthreads.nv.plist`
- `~/Library/Application Support/IntelliJIdea2019.3`
- Several others in `~/Library/Preferences/`

Files outside `~/Library/` (e.g. `~/.ssh/config`, `~/.gnupg/`, `~/.gradle/`) are NOT affected
by the Sonoma restriction but are also converted in this migration for consistency.

## Solution

Switch from link mode to **copy mode** using mackup's built-in uninstall command.

### Command

```bash
mackup link uninstall
```

This command:
1. Identifies every symlink managed by mackup
2. Removes the symlink
3. Copies the backing file from `Google Drive/Mon Drive/Mackup/` back to its original location
4. The Google Drive copy is kept intact (used as the backup source)

### Ongoing workflow (post-migration)

| Action | Command |
|--------|---------|
| Back up config changes | `mackup backup` |
| Restore on a new/other machine | `mackup restore` |

`mackup backup` and `mackup restore` in copy mode copy files without creating symlinks — fully
compatible with Sonoma and all future macOS versions.

### `.mackup.cfg`

No changes needed. `engine = file_system` with `path = Google Drive/Mon Drive` is already the
correct storage config for copy mode.

### Bootstrap

`~/.config/yadm/bootstrap` already calls `mackup restore` — this continues to work unchanged.

## Out of Scope

- Migrating tool dotfiles (`~/.ssh`, `~/.gnupg`, `~/.gradle`, etc.) to yadm — future work
- Removing mackup entirely — possible later once native app sync (JetBrains Sync, VSCode Sync)
  is verified as covering all needs
- Handling secrets in dotfiles (yadm encrypt) — separate concern, future work
