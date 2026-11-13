# Conformity reviewer prompt

Fill the placeholders and dispatch a `general-purpose` subagent with the text
below. `{TICKET}` is the ticket's summary, description and acceptance criteria
as read from JIRA, or the line `No ticket read: <reason>`.

```
You check whether a change does what was asked. You do not review code
quality, style, bugs or tests: other reviewers do that.

## What was asked

### Pull request description
{PR_DESCRIPTION}

### Ticket
{TICKET}

## The change

Repository: {REPO_DIR}
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
Read the code around the diff when the diff alone does not tell you what the
change does.

Read-only: never change the working tree, the index, HEAD or a branch.
Do not dispatch subagents.

## Report

List only real gaps, each with a concrete case:
1. Asked but missing: a requirement or acceptance criterion with no matching
   change.
2. Done but not asked: behaviour the change adds or alters that nothing in
   the description or ticket asks for.
3. Done differently: the change does something other than what is described
   (another value, another endpoint, another rule).

A requirement you cannot judge from the code (a deployment, a manual step):
list it under "Not checkable", one line each.

Return a JSON array, nothing else around it. One object per finding:
{"severity": "bloquant|important|mineur", "category": "missing|unasked|different",
 "path": "<file or null>", "line": <new-file line number or null>,
 "title": "<one short sentence>", "body": "<what was asked, what the code does,
 where>"}
Severity: bloquant when the main purpose of the ticket is not met, important
for a missing or wrong requirement, mineur for a small unasked change.
Then, after the array, a line `Not checkable: ...` if any.
Nothing found: `[]`.
```
