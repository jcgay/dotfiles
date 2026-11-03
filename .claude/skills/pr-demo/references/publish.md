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
- The last line is `🤖 Jean-Claude`, after a blank line. A hook refuses the
  post without it.

## Post or edit

Write the body file's absolute path literally in the post command, never
through a variable: the signature hook reads that path to find the
signature, and refuses the command when it cannot.

```bash
ME=$(gh api user --jq .login)
gh api "repos/<owner>/<repo>/issues/<N>/comments" --paginate \
  --jq ".[] | select(.user.login == \"$ME\" and (.body | startswith(\"<!-- pr-demo -->\"))) | .id" | head -1
```

An id printed: `gh api -X PATCH repos/<owner>/<repo>/issues/comments/<id> -F body=@<absolute path> --jq .html_url`.
None: `gh pr comment <N> -R <owner>/<repo> --body-file <absolute path>`.

## Hand the video over

GitHub shows a video in a comment only when it is uploaded through the web
page. No API does it. So, when the demo has a video:

1. `gh pr view <N> -R <owner>/<repo> --web`.
2. Print the comment URL and the absolute path of each video file, in one
   piece, so the user can drag it into the comment.

Print the comment URL in every case.
