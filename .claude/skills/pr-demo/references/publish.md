# Publish the demo

One comment per PR. A new demo of the same PR edits it, never adds a second.

## The body

Write it to `<capture dir>/pr-demo-<N>.md`. Use the language of the PR
description. Keep GitHub's line breaks: each one shows in a comment.

````
<!-- pr-demo -->
## Demo · `<headRefOid short>`

<one sentence: what the reviewer sees, and why it matters>

**Scenario**
1. <step or request>
2. ...

📹 **Video**

<user-attachments URL of the video, alone on its line>

<capture block from ui.md, api.md or cli.md>

<sub>Demo on a local run of the PR head<, compared with its base `<base sha short>`>. Not a test report.</sub>

🤖 Jean-Claude
````

- No video (API demo): drop the 📹 lines.
- `--compare` with two videos: one 📹 block per file, base first, each named.
- `--narrate`: add "🔊 with sound" to the 📹 line, so the reviewer unmutes it
  (GitHub's player starts muted). Upload the mixed `pr-<N>.webm`, never
  the `-raw` one.
- Upload failed: replace the URL line with
  ``> drag `<absolute path of the .webm>` here (edit this comment).``
  The path is the only trace of the file once the agent's tab is closed.
- The last line is `🤖 Jean-Claude`, after a blank line.

## Upload the video

GitHub shows a video in a comment only when its file is on
`github.com/user-attachments`, and only the web page uploads there. So drive
the page to upload, read the link it writes, and submit nothing: the API
posts the comment. Do it before writing the body, once per video file.

The browser profile `~/.cache/pr-demo-github-profile` holds the user's
GitHub login. Never log in yourself.

```bash
playwright-cli -s=pr-demo-<N> open --persistent --profile ~/.cache/pr-demo-github-profile \
  https://github.com/<owner>/<repo>/pull/<N>
playwright-cli -s=pr-demo-<N> run-code "async page => { await page.getByRole('button', { name: 'Paste, drop, or click to add files' }).first().click(); }"
playwright-cli -s=pr-demo-<N> upload <absolute path of the .webm>
```

The comment form has no file input in the DOM: the button opens the file
chooser, and `upload` fills it. A `run-code` that waits for the chooser
itself hangs. Then read the textarea every 3 s, up to 2 min, until it holds
`https://github.com/user-attachments/assets/<uuid>`:

```bash
playwright-cli -s=pr-demo-<N> --raw eval "document.querySelector('textarea[placeholder=\"Use Markdown to format your comment\"]').value"
```

Keep that URL, empty the textarea
(`run-code "async page => { await page.locator('textarea[placeholder=\"Use Markdown to format your comment\"]').fill(''); }"`),
then `playwright-cli -s=pr-demo-<N> close`.

One profile serves one browser at a time: when `open` fails because
another pr-demo holds the profile, wait 30 s and try again, up to 5 times.

The upload failed when the button is missing (logged out: a "Sign in" link
shows; or GitHub changed the page), the chooser does not open, no URL
comes, or the profile stayed busy: close the browser, use the drag line in the body, and say why in the
report. Never retry by another route (cookies, internal API).

## Post or edit

```bash
~/.claude/scripts/gh-pr-upsert-comment <owner>/<repo> <N> pr-demo <absolute path of the body file>
```

It edits the `<!-- pr-demo -->` comment you already posted on the PR, or
creates it, and prints the comment URL. It refuses a body without the marker
on its first line or without the signature.

## Hand the video over (upload failed only)

1. `gh pr view <N> -R <owner>/<repo> --web`. Not with `--auto`: nobody is
   in front of the screen, and the comment's drag line names the file.
2. Print the comment URL and the absolute path of each video file, in one
   piece, so the user can drag it into the comment. With the login expired,
   also tell them to log in again in that profile:
   `playwright-cli open --headed --persistent --profile ~/.cache/pr-demo-github-profile https://github.com/login`.

Print the comment URL in every case.
