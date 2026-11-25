# Capture a Herdr window change

For a mod, a layout, keys, or anything else the Herdr desktop window shows.
Herdr draws its own frames to a file: no screen recording, no permission,
and it works while the window is covered. Never drive the pointer or the
keyboard: the window is driven by its own commands.

The `## Demo` section gives the prefix that reaches the demo window, here
`<herdr>` (for example `bash test/sandbox.sh -- herdr-app`). Never call a
bare `herdr-app`: `HERDR_APP_HOME` and `HOME` pick the window, and without
the prefix that is the user's own.

`<herdr> commands` lists every command and its arguments. For each step of
the scenario:

```bash
<herdr> do <command> [--arg value ...]
<herdr> shot "<capture dir>/frame-<NN>.png"   # 01, 02, ... in scenario order
```

- Before each shot, wait for what the step changes, not a fixed sleep:
  `<herdr> status` shows what the window shows; for a terminal or an agent,
  `hc wait <t>` or `hc read <t>` through the same prefix.
- Read each PNG before the next step. An error toast, a `*.error` file in
  the demo's Herdr home, or the welcome screen in place of the change is an
  environment error (guardrail).
- One shot per state the reviewer must see: aim for 3 to 8 frames.

Assemble the frames, 2 seconds each:

```bash
ffmpeg -v error -framerate 1/2 -i "<capture dir>/frame-%02d.png" \
  -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" -c:v libvpx-vp9 -pix_fmt yuv420p "<capture dir>/pr-<N>.webm"
```

- Check it with `ffprobe` (see `ui.md`).
- `--compare`: the same steps on the base worktree's window, with the
  prefix run from that worktree, into `pr-<N>-base.webm`.
- `--narrate`: frames have no timing to speak over. Say it does nothing
  here.

Capture block for the comment: the `do` commands, in a `bash` block.
