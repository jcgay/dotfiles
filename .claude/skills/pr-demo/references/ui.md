# Capture a UI change

Record the browser with `playwright-cli` (see the `playwright-cli` skill for
its commands). Load that skill before the first command.

```bash
playwright-cli -s=pr-demo open <app URL from the ## Demo section>
playwright-cli -s=pr-demo video-start <capture dir>/pr-<N>.webm --cursor --size 1280x720
# the scenario steps: goto, fill, click, wait for what the PR changes
playwright-cli -s=pr-demo video-stop
playwright-cli -s=pr-demo close
```

- Always `-s=pr-demo`: the default session may be a browser the user opened.
- The file name goes to `video-start`. `video-stop` takes no argument.
- `--cursor` shows where each click lands. Keep it: the reviewer follows the
  pointer.
- Before `video-start`, log in and reach the first page of the scenario:
  the video starts where the change starts.
- Aim for less than 60 seconds. Pause about 2 seconds on the result the PR
  changes, so the reviewer can read it.
- `--compare`: record the same steps on the base app into
  `<capture dir>/pr-<N>-base.webm`, then on the PR app.
- Check each file: `ffprobe -v error -show_entries format=duration -of csv=p=0 <file>`
  prints a duration. Watch for an error page in a final
  `playwright-cli -s=pr-demo screenshot --filename <capture dir>/final.png`: if the
  app shows an error, see the guardrail.

GitHub accepts `.webm` as it is. Do not convert it.

Capture block for the comment: the scenario steps are enough. Add a
screenshot only if the user asks.
