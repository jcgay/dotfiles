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

> 📹 **Video**: drag `<file name>.webm` here (edit this comment).

<capture block from ui.md, api.md or cli.md>

<sub>Demo on a local run of the PR head<, compared with its base `<base sha short>`>. Not a test report.</sub>

🤖 Jean-Claude
````

- No video (API demo): drop the 📹 line.
- `--compare` with two videos: one 📹 line per file, base first, each named.
- `--narrate`: add "🔊 with sound" to the 📹 line, so the reviewer unmutes it.
  Publish the mixed `pr-<N>.webm`, never the `-raw` one.
- The last line is `🤖 Jean-Claude`, after a blank line.

## Post or edit

```bash
~/.claude/scripts/gh-pr-upsert-comment <owner>/<repo> <N> pr-demo <absolute path of the body file>
```

It edits the `<!-- pr-demo -->` comment you already posted on the PR, or
creates it, and prints the comment URL. It refuses a body without the marker
on its first line or without the signature.

## Hand the video over

GitHub shows a video in a comment only when it is uploaded through the web
page. No API does it. So, when the demo has a video:

1. `gh pr view <N> -R <owner>/<repo> --web`.
2. Print the comment URL and the absolute path of each video file, in one
   piece, so the user can drag it into the comment.

Print the comment URL in every case.
