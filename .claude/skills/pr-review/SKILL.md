---
name: pr-review
description: Use when asked to review a pull request or a branch end to end — "review cette PR", "relis ma branche", "fais la review de #123", /pr-review — chaining code-review, ponytail-review, a conformity check against the PR description and JIRA ticket, impeccable audit on front files (critique with --ux), then posting one inline GitHub review and, with --fix, fixing, pushing and answering the threads. Not for risk triage (pr-risk).
argument-hint: "[PR number|URL|branch] [--ux] [--fix] [--effort low|medium|high|xhigh]"
---

# PR review

Run the existing reviews on one change, merge what they find, and post it as
one GitHub review with inline comments. Nobody reads the findings before they
are posted: only post what the reviews back with a concrete case.

Arguments: a PR number, PR URL or branch (none: the current branch); `--ux`
adds `impeccable critique`; `--fix` fixes after posting; `--effort <level>`
for `code-review`, default `medium`.

Write GitHub texts and the final report in the language of the PR
description (no PR: the language the user writes in). Every text posted on
GitHub (review body, inline comment, reply) ends with a blank line then
`🤖 Jean-Claude` as its very last line.

## 1. Find the target

- `gh pr view <arg> --json number,title,body,url,headRefName,headRefOid,baseRefName,state`
  (no argument: same command on the current branch).
- Take `<owner>/<repo>` from `url` and write it literally in every later
  `gh` call (`-R <owner>/<repo>`, `repos/<owner>/<repo>/...`). Shell variables
  do not survive between tool calls, and a PR URL can name another repository
  than the current directory.
- **PR mode**: diff from GitHub, `gh pr diff <N> -R <owner>/<repo>`; save it
  to a literal file in the session scratchpad (`pr.diff`). Base SHA:
  `gh api repos/<owner>/<repo>/pulls/<N> --jq .base.sha`; head SHA:
  `headRefOid`.
- **No-PR mode** (`gh pr view` fails): base is the default branch
  (`gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`), head
  the branch argument or `HEAD`; `git fetch -q origin <base>`, base SHA is
  `git merge-base origin/<base> <head>`, diff is `git diff <base-sha> <head>`.
  Nothing will be posted.
- `gh` not authenticated, or empty diff: stop and say so.
- Front files: changed paths matching `*.ts *.tsx *.js *.jsx *.html *.css
  *.scss *.vue *.svelte`, minus `*.spec.*`, `*.test.*` and `*.config.*`.

## 2. Read what was asked

- The PR body (no PR: the commit messages of `<base-sha>..<head>`).
- A JIRA key (`[A-Z][A-Z0-9]+-[0-9]+`), searched in this order: PR title,
  branch name, commit messages. First match wins.
- Read the ticket with the Atlassian MCP (load the tools with ToolSearch
  `select:mcp__claude_ai_Atlassian_Rovo__getAccessibleAtlassianResources,mcp__claude_ai_Atlassian_Rovo__getJiraIssue`):
  cloud id from `getAccessibleAtlassianResources`, then `getJiraIssue` with
  the key. Keep summary, description and acceptance criteria.
- Ticket unreachable (tool missing, not authenticated, key unknown): go on
  without it and keep the reason; the report says "ticket non lu : <reason>".
- Neither a PR body nor a ticket: skip the conformity review and say so in
  the report.

## 3. Run the reviews

The reviews must not see each other's findings. A subagent cannot start
another subagent, so the reviews that start their own are invoked from the
main context. `code-review` forks itself into the background: its findings
come back as a task notification.

1. **In one message, start the subagents** (`general-purpose`), each told
   that its review is read-only and that it must return findings with path,
   line and severity:
   - `ponytail:ponytail-review` on `<base-sha>..<head>` (load the skill with
     the Skill tool, then review).
   - Only if a front file changed: `impeccable:impeccable` with
     `audit <front files>`.
   - Only if section 2 found something to compare with: the conformity
     reviewer, from [references/conformity-reviewer.md](references/conformity-reviewer.md).
2. **In the same message, from the main context**:
   - `code-review` with `<effort> <PR number, URL or branch>`, never with
     `--comment` nor `--fix`. Keep the findings it reports, with their
     verdict (CONFIRMED / PLAUSIBLE).
   - Only with `--ux`: `impeccable:impeccable` with `critique <main front
     file or page>`. Tell it it runs inside pr-review: end with
     `Questions skipped: pr-review` instead of asking.
3. Wait for every subagent. A review that fails: go on with the others and
   name it in the report.

## 4. Merge

One list, written to a literal JSON file in the scratchpad (`findings.json`),
one object per finding: `id` (1, 2, …), `severity`
(`bloquant|important|mineur`), `sources`, `confirmed`, `path`, `line`, `side`
(`RIGHT` for a new or unchanged line, `LEFT` for a removed one), `title`,
`body`, then `anchored` and `comment_id` (section 5).

Severity:
| Source | bloquant | important | mineur |
|---|---|---|---|
| code-review | crash, data loss, security | other correctness bugs | cleanups |
| ponytail-review | Must fix | Should fix | Nice to have |
| impeccable audit | P0 | P1 | P2, P3 |
| conformity | as it says | as it says | as it says |

- Same file, lines within ~5 of each other, same problem: one finding, the
  highest severity, every source listed, the clearest body.
- `confirmed: false` for a code-review PLAUSIBLE finding, and for any
  finding whose own text says its trigger was not checked ("only matters if…",
  "I did not check whether…"). At low and medium effort code-review gives no
  verdict: then that second rule is the only one. Unconfirmed findings never
  go inline: they are listed in the body under "À vérifier".
- Drop vague findings with no concrete case (no "consider…").
- Each body says what goes wrong and the smallest fix, in two to four short
  sentences.

## 5. Publish

**No-PR mode**: print the report (section 7) and stop; `--fix` still runs.

**PR mode**, one review per run:

1. Anchorable lines:
   `awk -f ~/.claude/skills/pr-review/scripts/anchorable-lines.awk <pr.diff>`
   prints `path<TAB>side<TAB>line` for every line GitHub accepts a comment
   on. A finding is `anchored` when its path, side and line are in that list.
   One unanchorable inline comment makes GitHub reject the whole review (422).
2. Already posted: `gh api repos/<owner>/<repo>/pulls/<N>/comments --paginate
   --jq '.[] | select(.body | endswith("🤖 Jean-Claude")) | "\(.path)\t\(.line)"'`.
   Drop a finding whose path and line are already there.
3. Write the payload to a literal scratchpad file (`review.json`):
   `{"commit_id": "<head-sha>", "event": "COMMENT", "body": …, "comments":
   [{"path", "line", "side", "body"}]}` — one comment per anchored, confirmed
   finding, headed by its severity (`**[bloquant]** <title>`). The body holds:
   a two-line summary with counts per severity; conformity to the ticket;
   findings not anchored; "À vérifier"; the `--ux` critique; reviews that
   failed or were skipped.
4. `gh api repos/<owner>/<repo>/pulls/<N>/reviews --method POST --input <literal path>`.
   Never `APPROVE` nor `REQUEST_CHANGES`.
5. Get the comment ids from the PR comments, not the review's own comments
   endpoint, which returns `line: null`:
   `gh api repos/<owner>/<repo>/pulls/<N>/comments --paginate --jq '.[] |
   select(.pull_request_review_id == <review-id>) | "\(.id)\t\(.path)\t\(.line)"'`;
   store each as the finding's `comment_id`.

## 6. Fix (`--fix` only)

- Allowed only when the current branch is the PR head branch
  (`git branch --show-current` = `headRefName`, same repository), or in
  no-PR mode on the current branch. Otherwise: the review is posted, then
  say `--fix` needs the branch checked out, and stop.
- Invoke `superpowers:receiving-code-review` before touching any finding.
  Verify each finding against the code. Fix every valid `bloquant` and
  `important`, and the valid `mineur` ones worth it. A rejected finding gets
  a one-sentence technical reason.
- Run the checks the repository documents (AGENTS.md, CLAUDE.md) on the
  modules you touched. A check that fails because of your fix: fix it or
  revert that fix and mark the finding "laissée". A failure unrelated to the
  change (Docker image not pulled, network): name it in the report and go on,
  once the tests of the touched classes are green in their JUnit XML.
- One `git commit --fixup=<sha>` per corrected commit, following the user's
  commit rules; never autosquash. The corrected commit:
  `git blame -L <line>,<line> <head> -- <path>` when it is in
  `<base-sha>..HEAD`, else the latest commit of that range touching the file.
  A finding that a commit message claims something false: `git commit
  --fixup=amend:<sha>` carries both the code fix and the corrected message.
- PR mode, push: `git fetch origin <headRefName>`, then
  `git merge-base --is-ancestor origin/<headRefName> HEAD` must succeed, then
  `git push origin HEAD:refs/heads/<headRefName>`. Never force. Remote moved
  or push rejected: stop, post no reply, say the fixups are local.
- After the push, reply in each thread that has a `comment_id`:
  `gh api repos/<owner>/<repo>/pulls/<N>/comments/<comment_id>/replies -f body='…'`
  — "Corrigé dans <short-sha>." or "Non corrigé : <reason>." Findings in the
  body only get no reply.

## 7. Report

In the terminal, short:
- Target, reviews run (and skipped, with why), ticket read or not.
- Findings by severity, numbered as in `findings.json`.
- PR mode: the review URL, how many inline comments, how many in the body,
  how many skipped as already posted.
- With `--fix`: fixed (with fixup sha), rejected (with reason), left; pushed
  or not.
