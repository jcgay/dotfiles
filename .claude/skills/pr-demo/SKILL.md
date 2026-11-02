---
name: pr-demo
description: Use when a reviewer should see what a pull request does without checking it out — record a video of a UI change, replay real API requests, or record a CLI — and post it as a PR comment. Not for QA, bug hunting or code review.
---

# PR demo

Run the real application at the PR head, capture what the change does, and
post it as a comment on the PR. A demo shows. It does not judge: no bug
hunting, no code review, no risk verdict.

Argument: `<PR number | PR URL | branch> [--compare]`. Without `--compare`,
show the new behavior only. With `--compare`, run the PR base too and play
the same scenario on both sides.

Write to the user in their language. Write the comment in the language of
the PR description.

## Guardrails

None of these is negotiable.

- **Never guess how to start a project.** The repo documents it in a
  `## Demo` section (step 2), or you stop.
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
- Every changed file is build, CI, dependency, test or doc: there is nothing
  to show. Say so and stop, before step 2.

## 2. Read how to start the app

Read the `## Demo` section of `<root>/CLAUDE.md`, then of `<root>/AGENTS.md`.
Follow the files it points to. The section gives:

- the command that starts the app from a checkout, and from which directory;
- the URL and port, and how to shift the port for a second instance;
- the data the app needs, and how to get it;
- the sign that the app is ready (a log line, a URL that answers 200);
- the command that stops it;
- optional: a tool that compares base and PR responses, for `--compare`.

No section: stop. Ask the user for these six items, and offer to write the
section into the repo with them. Never start from a README guess.

## 3. Propose the scenario, then wait

Read `gh pr diff <N> -R <owner>/<repo>`, the PR body, and the JIRA tickets the title or
body cite. Pick the capture:

| The diff changes… | Capture | Read |
|---|---|---|
| what a user sees in a browser | video | `references/ui.md` |
| an HTTP API (REST, SOAP, feeds) | requests and responses | `references/api.md` |
| a CLI or a script output | terminal video | `references/cli.md` |

Several apply: use the one the PR title is about, add a second only if the
user asks. Nothing a user or a client can observe (build, dependencies,
refactoring, tests, docs): say there is nothing to show and stop. Start
nothing.

Show the scenario in 10 lines or fewer: the capture type, the commit
(`headRefOid`, short), each step or request, and what each one shows. Then
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

Follow the reference file step 3 chose. Keep every capture file and the
exact commands you ran.

## 6. Publish

Follow `references/publish.md`.

## 7. Tear down

Stop each app you started with the section's stop command, or stop the
background job you launched. Then `git -C "<root>" worktree remove --force`
each worktree you created. Check that the ports are free again. Leave the
capture files: the user still has to drag the video into the comment.
