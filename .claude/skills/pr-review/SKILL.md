---
name: pr-review
description: 'Use when asked to review a pull request or a branch end to end — "review cette PR", "relis ma branche", "fais la review de #123", /pr-review — chaining code-review, ponytail-review, a conformity check against the PR description and JIRA ticket, impeccable audit on front files (critique with --ux), then posting one inline GitHub review and, with --fix, fixing, pushing and answering the threads. Not for risk triage (pr-risk).'
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

- `gh auth status` first: not authenticated, stop and say so.
- `gh pr view <arg> --json number,title,body,url,headRefName,headRefOid,baseRefName,state,isCrossRepository`
  (no argument: same command on the current branch). Only the error "no pull
  requests found" means no-PR mode; any other error (network, unknown
  number): stop and show it. A closed or merged PR: say so and stop, unless
  the user named it explicitly.
- Take `<owner>/<repo>` from `url` and write it literally in every later
  `gh` call (`-R <owner>/<repo>`, `repos/<owner>/<repo>/...`). Shell variables
  do not survive between tool calls, and a PR URL can name another repository
  than the current directory.
- **PR mode**: diff from GitHub, `gh pr diff <N> -R <owner>/<repo>`; save it
  to a literal file in the session scratchpad (`pr.diff`). It fails with HTTP
  406 on a very large PR (over 300 files): GitHub cannot anchor inline
  comments on it, so go on in no-PR mode (below) with the PR's base and
  head SHAs, keep `--fix` (it pushes to `headRefName`), and say in the
  report that GitHub refused the diff. Still publish one review, body only
  (section 5, `--body-only`): it carries the `<!-- pr-review -->` marker the
  PR watch reads, or the watch runs pr-review again. There are no threads
  to reply to; write `findings.json` (section 4), `body.md` and the report.
  Base and head SHAs: the PR's, below.
- **Local code for the reviewers** (`<repo-dir>`): the reviews read the
  surrounding code, so both SHAs must exist locally. When the current
  directory is that repository (`gh repo view --json nameWithOwner`), it is
  `<repo-dir>`: `git fetch -q origin pull/<N>/head <baseRefName>`. Otherwise
  clone it into the scratchpad (`gh repo clone <owner>/<repo> <scratchpad>/repo
  -- --filter=blob:none`), fetch the same refs there, and use that clone.
  Pass `<repo-dir>` to every reviewer.
- **PR mode SHAs**: head SHA is `headRefOid`. Base SHA is
  `git merge-base origin/<baseRefName> <headRefOid>` in `<repo-dir>`.
  Never give the base branch's tip to the reviewers: when the base branch
  moved since the branch was cut, its new commits show in the diff as
  changes of the PR, reverted.
- **No-PR mode**: base is the default branch
  (`gh repo view --json defaultBranchRef --jq .defaultBranchRef.name`), head
  the branch argument or `HEAD`; `git fetch -q origin <base>`, base SHA is
  `git merge-base origin/<base> <head>`, diff is `git diff <base-sha> <head>`.
  Nothing will be posted.
- Empty diff: stop and say so.
- Front files: changed paths matching `*.ts *.tsx *.js *.jsx *.html *.css
  *.scss *.vue *.svelte`, minus `*.spec.*`, `*.test.*` and `*.config.*`.

## 2. Read what was asked

- The PR body (no PR: the commit messages of `<base-sha>..<head>`).
- A JIRA key (`[A-Z][A-Z0-9]+-[0-9]+`), searched in this order: PR title,
  branch name, commit messages. First match wins.
- Read the ticket with the Atlassian MCP. The tools' prefix depends on where
  the session runs (`mcp__claude_ai_Atlassian_Rovo__…` in the CLI,
  `mcp__Atlassian_Rovo__…` in a cloud session), so find them by keyword,
  never by full name: ToolSearch
  `+Atlassian getJiraIssue getAccessibleAtlassianResources`. Cloud id from
  `getAccessibleAtlassianResources`, then `getJiraIssue` with the key. Keep
  summary, description and acceptance criteria.
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
   - `ponytail:ponytail-review` on `<base-sha>..<head-sha>` in `<repo-dir>`
     (load the skill with the Skill tool, then review).
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
3. Merge nothing before every review is back: each subagent, the
   `code-review` task notification, and the critique with `--ux`. A review
   that fails: go on with the others and name it in the report.

## 4. Merge

One list, written to a literal JSON file in the scratchpad (`findings.json`),
one object per finding: `id` (1, 2, …), `severity`
(`bloquant|important|mineur`), `sources`, `confirmed`, `path`, `line`, `side`
(`RIGHT` for a new or unchanged line, `LEFT` for a removed one), `title`,
`body`. Section 5 adds `anchored`, `posted`, `where` and `comment_id`.

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
  sentences. No severity heading and no signature in `title` or `body`:
  section 5 adds them.

## 5. Publish

**No-PR mode**: print the report (section 7) and stop; `--fix` still runs.
A PR whose diff GitHub refused (HTTP 406) is not in no-PR mode here: it
publishes like a PR, with `--body-only` (below).

Never post a review with `gh api` or `gh pr review` directly: only
`publish-review.sh` adds the `<!-- pr-review -->` marker, and a review
without it makes the PR watch run pr-review again.

**PR mode**, one review per run:

1. Write the head of the review body to a literal scratchpad file
   (`body.md`), next to `pr.diff` and `findings.json`: a two-line summary
   with counts per severity; conformity to the ticket; the `--ux` critique;
   reviews that failed or were skipped. Do not list the findings in it.
2. Publish:

   ```bash
   "${CLAUDE_SKILL_DIR}/scripts/publish-review.sh" <owner>/<repo> <N> <head-sha> <scratchpad> \
     --off-diff "<'Hors diff' in the PR language>" --unconfirmed "<'À vérifier' in the PR language>"
   ```

   Double quotes: a translated heading may hold an apostrophe. `<head-sha>`
   is the full `headRefOid`; a short one is refused. Diff refused by GitHub
   (HTTP 406): add `--body-only`, with no `pr.diff`; every finding goes to the
   body, and `--off-diff` names the heading of the confirmed ones ("Constats"
   in French).

   It posts one inline comment per confirmed finding whose line is in the
   diff, headed by its severity (`**[bloquant]** <title>`). The other
   findings go to the body under the two headings: not anchored, then
   unconfirmed. A finding already posted (a signed comment with its title on
   its line, or listed in a signed review) is skipped, and nothing is posted
   when every finding was, so a second run does not double the first. It
   signs every text, always posts as `COMMENT` (never `APPROVE` nor `REQUEST_CHANGES`), and
   writes `where` (`inline`, `body`, `skip`) and `comment_id` back into
   `findings.json`.
3. It prints the review URL, the counts (inline, body, already posted) and
   one line per finding: keep them for the report. `--dry-run` builds
   `review.json` without posting, to look at it first when in doubt.

## 6. Fix (`--fix` only)

Read [references/fix.md](references/fix.md) and follow it. Without `--fix`,
change no file of the reviewed repository.

## 7. Report

In the terminal, short:
- Target, reviews run (and skipped, with why), ticket read or not.
- Findings by severity, numbered as in `findings.json`.
- PR mode: the review URL, how many inline comments, how many in the body,
  how many skipped as already posted.
- With `--fix`: fixed (with fixup sha), rejected (with reason), left; pushed
  or not.
