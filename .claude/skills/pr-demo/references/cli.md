# Capture a CLI change

Record the terminal with `vhs`. Write a tape in the capture dir:

```
Output "<capture dir>/pr-<N>.webm"
Set Width 1200
Set Height 600
Set FontSize 18
Type "<command of the scenario>"
Enter
Sleep 2s
```

Run it from the PR worktree: `cd "<root>-demo-<N>" && vhs "<capture dir>/pr-<N>.tape"`.

- Quote the `Output` path: `vhs` rejects an unquoted absolute path.
- One `Type` / `Enter` / `Sleep` group per step. Give each `Sleep` enough
  time for the output to finish and be read.
- `--compare`: a second tape run from the base worktree, output
  `pr-<N>-base.webm`.
- Check the file with `ffprobe` (see `ui.md`).

Capture block for the comment: the commands, in a `bash` block.
