---
description: Write a passation (handoff note) for the task in progress, so that a new session can take it over.
disable-model-invocation: true
---

# Passation

A passation hands a task still in progress over to a later session. Several sessions can work
in the same repository at once, so there is one passation per task.

## Where

pyxis gives the vault, its folders and the session id in this session's context. Write
`<passations>/<repo>/<task-slug>.md`:

- `<passations>`: the passations folder pyxis names, inside the vault;
- `<repo>`: the name of the root folder of the main checkout of the session's git repository
  (the parent of `git rev-parse --path-format=absolute --git-common-dir`), so that a worktree
  counts for its repository; outside any repository, the `outsideRepo` name pyxis gives;
- `<task-slug>`: a few words naming the task, lowercase, hyphenated.

When pyxis gives the exact folder (past the context threshold), use it. If a passation already
exists for this task, update it rather than writing a second one.

When the user typed `/pyxis:passation`, pyxis attaches a block starting
`pyxis, for /pyxis:passation`: its `Write it in` folder is the exact one, and
`Open passations there` are the ones to update rather than duplicate.

## Format

If the vault's templates folder holds `passation.md`, follow it: its frontmatter, its sections,
its language. Fill its placeholders; never edit the template itself. Otherwise:

```markdown
---
created: <today, YYYY-MM-DD>
tags: [ai/passation]
status: active
description: <one line: the task and what is left>
branch: <the git branch, or none>
session: <the session id pyxis gives>
---

## Goal

## Done and decided

## Left to do

## Read first
```

Add a ticket field when the vault's CLAUDE.md names a ticket tool and the task has a ticket.

## Content

- Facts, not git state: Claude Code gives the next session the git status.
- Done and decided: what is settled and why, with what was rejected, so that the next session
  does not decide it again.
- Read first: the notes, files and specs to read, in order.

## Then

End your message with one line inviting the user to continue in a new session.

## Resuming

When a session's first message resumes a passation: read it in full, set `status: done`, and
move it to the `resumed` folder next to it, which pyxis names. Never delete a passation.
