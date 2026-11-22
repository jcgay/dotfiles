---
name: pr-demo
description: Use when a reviewer should see what a pull request does without checking it out — record a video of a UI change, replay real API requests, or record a CLI — and post it as a PR comment. Not for QA, bug hunting or code review.
---

# PR demo

Run the real application at the PR head, capture what the change does, and
post it as a comment on the PR. A demo shows. It does not judge: no bug
hunting, no code review, no risk verdict.

Argument: `<PR number | PR URL | branch> [--compare] [--narrate]`. Without
`--compare`, show the new behavior only. With `--compare`, run the PR base
too and play the same scenario on both sides. With `--narrate`, a voice and
captions explain the video step by step (UI and CLI captures).

Write to the user in their language. Write the comment in the language of
the PR description. A language the user asks for the narration covers the
voice and the captions only: the comment keeps the PR description's
language unless the user names it too.

## Guardrails

None of these is negotiable.

- **Never guess how to start a project.** The repo documents it in a
  `## Demo` section, or for a build task or script, in its own doc (step 2).
  Otherwise you stop.
- **No start before the user agrees with the scenario** (step 3).
- **Never touch what you did not start**: the user's checkout, their running
  app, a process on a port. A port in use: stop and ask. Kill nothing.
- **Never publish an environment error.** A 500, a missing database or a
  login page instead of the feature is not a demo. Stop, show the log
  excerpt, publish nothing.
- **Captures stay out of the repo**: write them to the session scratchpad
  directory, or `${TMPDIR:-/tmp}/pr-demo-<N>/`.
- **Always tear down** what you started (step 7), also after a refusal, an
  error or a failed capture.

## 1. Find the target

- `gh pr view <arg> --json number,title,body,baseRefName,headRefOid,url,state,files`
  (no argument: same command on the current branch). No PR: stop and say so.
- Take `<owner>/<repo>` from the `url` field. Use `-R <owner>/<repo>` and
  `repos/<owner>/<repo>/...` in every later `gh` command.
- Shell variables do not survive between tool calls. Write the repo, the
  clone root and the capture dir as literal values in every command: an
  empty `-R` makes `gh` act on the repo of the current directory.
- Find the local clone of `<owner>/<repo>`: the current directory if
  `gh repo view --json nameWithOwner --jq .nameWithOwner` prints `<owner>/<repo>`, else
  ask the user for its path. Its root `<root>` is `git -C <clone> rev-parse --show-toplevel`.
  Never create a worktree in another repository.
- A merged or closed PR can still be demoed at its `headRefOid`.
- Every changed file is build, CI, dependency, test or doc, and none changes
  what a user of the build sees (a task's output, a report, a file handed
  to a client): there is nothing to show. Say so and stop, before step 2.
  A build task whose output changes is a CLI capture (step 3).

## 2. Read how to start the app

Read the `## Demo` section of `<root>/AGENTS.md`, then of `<root>/CLAUDE.md`.
Follow the files it points to. The section gives:

- the command that starts the app from a checkout, and from which directory;
- the URL and port, and how to shift the port for a second instance;
- the data the app needs, and how to get it;
- the sign that the app is ready (a log line, a URL that answers 200);
- the command that stops it;
- optional: a tool that compares base and PR responses, for `--compare`.

A CLI capture of a build task or a script (a Gradle task, a repo tool)
when the `## Demo` section covers only the app: use the command the repo
documents for that task (the README next to it, or its doc in the diff).
Name that file in the scenario. The user's agreement at step 3 covers it.
A command you work out yourself is still a guess.

No section: stop. Offer to work it out with the user: what you found on how
the app runs (local stack, a deployed or shared environment it can lean on),
the options, and these six items. Then offer to write the section into
`<root>/AGENTS.md`. Never start from a README guess.

## 3. Propose the scenario, then wait

Read `gh pr diff <N> -R <owner>/<repo>`, the PR body, and the JIRA tickets the title or
body cite. Check each behavior the scenario or a narration sentence claims
against the code at `headRefOid` (diff, or the files it relies on), not only
the PR body: a description can be stale. When they disagree, follow the code
and tell the user. Pick the capture:

| The diff changes… | Capture | Read |
|---|---|---|
| what a user sees in a browser | video | `references/ui.md` |
| an HTTP API (REST, SOAP, feeds) | requests and responses | `references/api.md` |
| a CLI or a script output | terminal video | `references/cli.md` |

Several apply: use the one the PR title is about, add a second only if the
user asks. Nothing a user or a client can observe (build internals,
dependencies, refactoring, tests, docs): say there is nothing to show and stop. Start
nothing.

Show the scenario in 10 lines or fewer: the capture type, the commit
(`headRefOid`, short), each step or request, and what each one shows. With
`--narrate`, also the sentence said over each step (`references/narrate.md`);
an API capture has no video: say `--narrate` does nothing there. Then
wait. Change it as the user says. Start nothing before they agree.

## 4. Start the app

Check that every port the section uses is free:
`lsof -nP -iTCP:<port> -sTCP:LISTEN`. A line printed: stop and ask.

```bash
git -C "<root>" fetch origin <headRefOid>
git -C "<root>" worktree add --detach "<root>-demo-<N>" <headRefOid>
```

With `--compare`, also the base, from the merge-base with **the PR's base
branch**, not the default branch:

```bash
git -C "<root>" fetch origin <baseRefName>
git -C "<root>" merge-base origin/<baseRefName> <headRefOid>   # → <base sha>
git -C "<root>" worktree add --detach "<root>-demo-<N>-base" <base sha>
```

A worktree path that already exists (an interrupted run): if
`git -C <path> rev-parse HEAD` prints the expected commit, reuse it; else
stop and ask. One worktree per running app, always. Start each one with the section's
command, in the background, its output in a log file next to the captures.
Wait for the ready sign. Then send one request the scenario uses: an
environment error there means stop (guardrail), not capture.

## 5. Capture

Follow the reference file step 3 chose, and `references/narrate.md` with
`--narrate`. Keep every capture file and the exact commands you ran.

## 6. Publish

Follow `references/publish.md`.

## 7. Tear down

Stop each app you started with the section's stop command, or stop the
background job you launched. Then `git -C "<root>" worktree remove --force`
each worktree you created. Check that the ports are free again. Leave the
capture files: they are the only copy when the upload failed.
