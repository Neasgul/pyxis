---
description: Review the session, propose what the vault should retain, then write the session summary once I approve. Use when I say wrap up, wrapup, or close the session.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls:*)
disable-model-invocation: true
---

pyxis attaches a block to this command, starting `pyxis, for /pyxis:wrapup`: the vault, today's
date, the vault's folders and what this skill needs. If it is not in your context, pyxis's hooks
did not run: tell the user so in one line and stop. Folders below are roles (the inbox folder,
the hubs folder…); the block names them. If the block says a folder is missing, say so and stop.

Write notes in the language of the template, else of the vault's CLAUDE.md, else of the notes
around them. Reply in the user's language.

The block gives the hubs, this session's hubs, and the error logs of the hooks.

The session transcript is on disk at `~/.claude/projects/*/${CLAUDE_SESSION_ID}.jsonl`. This
conversation is already in your context: open the file only if a compaction dropped messages
(reading outside the working directories may need my approval).

Three questions only: did I leave something you asked for unfinished, is
what we learned written in the right place, and what would have made the
session go better. Report **exceptions**, never an inventory of what got
done — you watched it happen. No length limit: fifty points beat a review
that stops at ten.

## 1. Go through every one of my messages

From the very start of the session, compaction included: the summary lists
my messages and the full transcript is above. Split each message into its
requests and classify them silently. Report only what is **partial** (say
what's missing), **not done**, or **dropped by you** without my say-so.
Look for the three traps: a request buried in a message that held several,
a "flagging this" of yours that got no answer, a question you asked that I
never settled. Quote my words; don't rephrase them better. Don't re-ask
anything I already settled.

## 2. What the vault should retain

Find what we learned and isn't written anywhere — a fact that cost time to
establish and the next session would pay for again. Also what's written and
now wrong (fix the existing note, don't add a contradicting one) and what's
written twice (one place, link from the others).

| Nature | Where it goes |
|---|---|
| Fact about a project | its hub in the hubs folder |
| Settled decision | a note as `/pyxis:decision` describes, linked from the hub |
| Word that should have brought a hub | that hub's `triggers:` |
| Rule for this vault | the vault's CLAUDE.md |
| Rule for every project | the user's global CLAUDE.md |
| Uncertain fact | written with the verify tag the block names (if none, in plain words) |
| Raw, not yet sorted | the inbox folder |

A settled decision gets a note as `/pyxis:decision` describes: read
`${CLAUDE_PLUGIN_ROOT}/skills/decision/SKILL.md` and follow it.

Nothing goes to auto-memory (`~/.claude/projects/…/memory`): the vault is
what remembers. If `Error logs` in the block is not `none`, show them.

## 3. What could have gone better

Time lost and what would have avoided it, steps done in the wrong order, an
instruction I had to repeat, a mistake I caught and you didn't, a check
redone by hand more than once. If there's nothing, say so in one line — two
solid proposals beat six lukewarm ones.

## 4. Stop

Present three short lists: **what's still open**, **what you propose to
write or correct** (exact text and destination), **what you propose to
change in how we work**. Write nothing before I approve.

## 5. Apply

Write what I approved and nothing else, following the vault's working rules
(from pyxis's rules block, or the vault's CLAUDE.md). Then write the session summary in the sessions folder, creating the
folder if it is absent, as `<today>-<topic-slug>.md`. If the block names a template, follow it
and fill its placeholders; never edit the template. Otherwise:

```markdown
---
created: <today>
tags: [ai/session]
---

## Goal

## What we did

## Files touched

## Decisions

## Open questions

## Next steps
```

- **Goal**: one or two lines.
- **Files touched**: [[wikilinks]], created / edited / archived, checked — don't assume.
- **Decisions**: include what we rejected and why.
- **Open questions**: what's still open from step 1.
- **Next steps**: `- [ ]` items.

Add a ticket field only if the vault's CLAUDE.md names a ticket tool and a ticket came up
in the session; omit it otherwise. No commit.
