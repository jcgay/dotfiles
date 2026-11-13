# pr-review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user-level skill `/pr-review` that chains the existing reviews on a PR or branch, merges their findings, posts them as one inline GitHub review, and optionally fixes them.

**Architecture:** One orchestrator `SKILL.md` (Markdown instructions, no code). Skills that spawn their own subagents (`code-review`, `impeccable critique`) run in the main context; the others run in one subagent each. One reference file holds the conformity reviewer prompt, the only review logic the skill owns.

**Tech Stack:** Claude Code skills, `gh` CLI (`gh pr view`, `gh api`), Atlassian Rovo MCP (`getJiraIssue`), git, yadm (the skill directory is tracked by yadm; plain `yadm` fails under the RTK hook, use `rtk proxy yadm`).

**Spec:** `/Users/jcgay/.claude/skills/pr-review/DESIGN.md`

## Global Constraints

- Location: `~/.claude/skills/pr-review/`; skill name `pr-review`.
- Invocation: `/pr-review [PR|branche] [--ux] [--fix] [--effort low|medium|high|xhigh]`, effort default `medium`.
- Every text posted on GitHub (review body, inline comment, reply) ends with a blank line then `🤖 Jean-Claude` as its last line.
- Review event is always `COMMENT`, never `APPROVE` nor `REQUEST_CHANGES`.
- One GitHub review per run; findings posted without prior human reading.
- `code-review` runs without `--comment` and without `--fix`. Its PLAUSIBLE findings never go inline: review body, marked "à vérifier".
- Severity scale: bloquant / important / mineur.
- Comment language: the language of the PR description.
- Front file: `*.ts *.tsx *.js *.jsx *.html *.css *.scss *.vue *.svelte`, excluding test files (`*.spec.*`, `*.test.*`) and build config (`*.config.*`).
- `--fix`: `git commit --fixup=<sha>` per corrected commit, no autosquash; push only to the PR head branch with `git push origin HEAD:refs/heads/<branch>`, never force; reply in each touched inline thread.
- Without `--fix`, no file of the reviewed repo is modified.
- Skill body in English (as `pr-risk`), reports and GitHub texts in the PR language.

## Review Focus

1. **A finding on a line outside the diff**: GitHub rejects the whole review with 422 if one inline comment targets a line not in a hunk. Expected: the line is checked against the PR's patch before posting, and an unanchorable finding goes to the body. → Task 2, step 1 scenario B.
2. **A PR of another repository given by URL**: expected `owner/repo` taken from the PR URL and written literally in every `gh` call, never the current directory's repo. → Task 1, step 1 scenario C.
3. **Second run on the same PR**: expected no duplicate inline comment on the same path and line already carrying a `🤖 Jean-Claude` comment. → Task 2, step 1 scenario C.
4. **JIRA ticket unreachable** (MCP not authenticated, key not found): expected the conformity review runs on the PR description alone and the report says the ticket could not be read. → Task 1, step 1 scenario B.
5. **Push rejected under `--fix`** (remote moved): expected stop, no force, no replies posted, and the report says the fixups are local. → Task 3, step 1 scenario B.

---

### Task 1: Review and terminal report (no publication)

**Files:**
- Create: `~/.claude/skills/pr-review/SKILL.md`
- Create: `~/.claude/skills/pr-review/references/conformity-reviewer.md`

**Interfaces:**
- Produces, used by Task 2 and 3: the merged finding list, each finding with `id` (number), `severity` (bloquant|important|mineur), `source` (code-review|ponytail|audit|conformity|critique), `confirmed` (bool, false only for code-review PLAUSIBLE), `path`, `line` (nullable), `side` (RIGHT|LEFT), `title`, `body`. Kept as a JSON file in the session scratchpad, path announced in the report.
- Produces: resolved target `owner/repo`, PR number (nullable), base SHA, head SHA, head branch.

- [ ] **Step 1: Baseline scenarios (RED)**

Per `superpowers:writing-skills`, run each scenario with a fresh subagent *without* the skill and record what it does wrong (skips a review, posts twice, wrong repo…):
- A. No PR: a local branch of arthur without PR, against `master`.
- B. PR with an unreachable JIRA key (fake key `NOPE-1` in a scratch branch name).
- C. A PR of another repository given by URL, while the cwd is arthur.

- [ ] **Step 2: Write `SKILL.md` sections 1–4: target, requirements, reviews, merge, terminal report**

Frontmatter `description` starts with "Use when" and names the triggers (« review cette PR », « relis ma branche », `/pr-review`), and says it is not for risk triage (`pr-risk`). Target resolution follows `pr-risk` §1 (literal `owner/repo` from the PR URL, paginated `pulls/N/files`, no-PR mode on merge-base). Launch order: spawn the subagents (ponytail, audit if front, conformity) first in one message, then run `code-review` (and `critique` with `--ux`, with the instruction to end on `Questions skipped: pr-review`) in the main context while they run. Merge rules from the spec §4.

- [ ] **Step 3: Write `references/conformity-reviewer.md`**

Prompt template with placeholders `{PR_DESCRIPTION}`, `{TICKET}` (or "aucun ticket lu : <raison>"), `{BASE_SHA}`, `{HEAD_SHA}`. Three categories: demandé mais absent, fait mais pas demandé, fait autrement que décrit. Output: findings with the Interfaces fields above. Read-only, no subagent.

- [ ] **Step 4: Re-run scenarios A–C with the skill (GREEN)**

Expected: A prints a merged report, no `gh api` POST; B reports "ticket non lu" and still runs conformity on the description; C uses the URL's repo in every `gh` call. All reviews launched, front audit only when a front file changed.

- [ ] **Step 5: Commit**

```bash
rtk proxy yadm add ~/.claude/skills/pr-review/{SKILL.md,DESIGN.md,PLAN.md,references/conformity-reviewer.md}
rtk proxy yadm commit -m "Add pr-review skill chaining existing reviews"
```
Message body per the global git rules (why, humanized, Co-Authored-By trailer).

### Task 2: Publish one inline GitHub review

**Files:**
- Modify: `~/.claude/skills/pr-review/SKILL.md` (section 5 "Publish")

**Interfaces:**
- Consumes: the finding list and target from Task 1.
- Produces, used by Task 3: the posted review id and, per inline finding, its comment id (from `gh api repos/<owner>/<repo>/pulls/<N>/reviews/<id>/comments`), added to the findings JSON as `comment_id`.

- [ ] **Step 1: Baseline scenarios (RED)**

On a throwaway PR the user designates (ask once, before any POST):
- A. First run: inline comments plus body.
- B. A finding on a line outside any hunk.
- C. Second run on the same PR.

- [ ] **Step 2: Write section 5**

Payload written to a scratchpad JSON file, sent with `gh api repos/<owner>/<repo>/pulls/<N>/reviews --method POST --input <file>` (literal path, no shell variable: the GitHub signature hook reads literal paths). `commit_id` = head SHA. Before building it: parse each file's `patch` to keep only lines inside a hunk (RIGHT for added/context, LEFT for removed); fetch existing `pulls/<N>/comments` and drop findings whose path+line already carry a comment ending in `🤖 Jean-Claude`. Unanchorable and PLAUSIBLE findings, conformity, critique go to the body.

- [ ] **Step 3: Re-run A–C (GREEN)**

Expected: A one review, event COMMENT, every text ends with `🤖 Jean-Claude`; B no 422, finding in the body; C no new inline comment on already-commented lines.

- [ ] **Step 4: Commit** (`rtk proxy yadm`, as Task 1).

### Task 3: `--fix`

**Files:**
- Modify: `~/.claude/skills/pr-review/SKILL.md` (section 6 "Fix")

**Interfaces:**
- Consumes: findings JSON with `comment_id` from Task 2.

- [ ] **Step 1: Baseline scenarios (RED)**

On the same throwaway PR, checked out locally:
- A. `--fix` with one bloquant and one wrong finding.
- B. Remote branch advanced by one commit before the push.
- C. `--fix` on a PR whose branch is not checked out.

- [ ] **Step 2: Write section 6**

Spec §6. The section tells the agent to invoke `superpowers:receiving-code-review` before touching any finding: verify each one against the code, fix the valid ones, and record a technical reason for each rejected one (that reason becomes the thread reply). The corrected commit is found with `git blame` / `git log -L` on the finding's lines. Verifications: what the repo's AGENTS.md / CLAUDE.md documents for touched modules. Push with explicit refspec; on rejection stop, post no reply. Replies with `gh api repos/<owner>/<repo>/pulls/<N>/comments/<comment_id>/replies -f body=...`. Body-only findings get no reply; the final report lists them.

- [ ] **Step 3: Re-run A–C (GREEN)**

Expected: A one fixup commit pushed, reply "corrigé dans <sha>" on the right thread, wrong finding answered with its reason; B no force push, no reply, report says local; C reviews and posts as usual, then refuses `--fix` and says why, without touching the working tree.

- [ ] **Step 4: Commit** (`rtk proxy yadm`, as Task 1). Close the throwaway PR only if the user agrees.
