---
description: Review the session, write its summary and the wiki inbox notes it settled, and propose changes to the rules. Use when I say wrap up, wrapup, or close the session.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls:*)
disable-model-invocation: true
---

pyxis attaches a block to this command, starting `pyxis, for /pyxis:wrapup`: the notes folder,
today's date, its folders and what this skill needs. If it is not in your context, pyxis's hooks
did not run or failed: tell the user so in one line (the `pyxis-errors.log` of the logs folder
or the plugin's `vault` option may say why) and stop. Folders below are roles (the sessions
folder, the logs folder…); the block names them. If the block says a folder is missing, say so
and stop.

Write notes in the language of the template, else of the notes around them. Reply in the user's
language.

The block gives the error logs of the hooks.

The session transcript is the file `${CLAUDE_SESSION_ID}.jsonl` in one of the folders of
`.claude/projects/` in the user's home. This conversation is already in your context: look for
the file (Glob, the home written out in full) and open it only if a compaction dropped messages
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

## 2. What should be retained

Find what we learned and isn't written anywhere — a fact that cost time to
establish and the next session would pay for again (architecture, a gotcha,
a settled decision with what was rejected, a word that should have brought
the right notes). Also what's written and now wrong (fix the existing note,
don't add a contradicting one) and what's written twice (one place, linked
from the others).

**Where it goes depends on the block.** When it has a line starting `` Wiki: ``, read
`<wiki>/AGENTS.md` first, with the path that line gives: it says what belongs in the wiki and the
format of an inbox note.

- With a `Wiki` line, a fact that belongs in the wiki, in the sense of that `AGENTS.md`, goes in
  `<wiki>/inbox/YYYY-MM-DD-<subject>.md`, in the format that `AGENTS.md` gives, with `target:`
  (the page you propose, or `new page`). Look for no other rule for such a fact. Never write to a
  page of the wiki, only to its `inbox/`: a wiki page that is now wrong gets an inbox note whose
  `target` is that page.
- A fact outside the subject of the wiki, or any fact when the block has no `Wiki` line, follows
  the rules loaded in this session: my `~/.claude/CLAUDE.md` and what it imports, the
  repository's CLAUDE.md or AGENTS.md.
  - Follow an explicit rule that names a place for such facts, with the format it gives.
  - Never infer a place from hints: a folder or a tool that exists is not a rule.
  - With no such rule, the fact goes in the session summary only.
- A change to how we work: propose it for the CLAUDE.md or AGENTS.md it belongs in.
- When two rules disagree about where something goes, show both and let me choose.
- Each proposal names its destination and the rule behind it (e.g. "per the 'Notes' rule of
  ~/.claude/CLAUDE.md", or "per the wiki's `AGENTS.md`").
- A correction to an existing note, outside the inbox, is a proposal too: show the note and the
  exact change.

Nothing goes to auto-memory (`~/.claude/projects/…/memory`). If `Error
logs` in the block is not `none`, show them.

## 3. What could have gone better

Time lost and what would have avoided it, steps done in the wrong order, an
instruction I had to repeat, a mistake I caught and you didn't, a check
redone by hand more than once. If there's nothing, say so in one line — two
solid proposals beat six lukewarm ones.

## 4. Present

Present three short lists: **what's still open**; **what is written without waiting**; **what
waits for my approval** (exact text, destination and the rule behind it: a change to a
`CLAUDE.md`, an `AGENTS.md` or the loaded rules, any correction to an existing note outside the
inbox, and every other fact you propose to write), with the changes to how we work from step 3
among them.

- **With a `Wiki` line in the block**, the second list holds each inbox note with its `target`,
  then the session summary. Do not end the turn here: step 5 happens in this same reply.
- **Without a `Wiki` line**, nothing is written without waiting: say so in one line, write
  nothing yet, and end the turn for my answer.

## 5. Apply

- **With a `Wiki` line**: in the same reply, write the inbox notes and the session summary now,
  without asking, and list their paths. Then wait, and only for the items of the "waits for my
  approval" list: write those only after I approve them, and nothing I did not approve.
- **Without a `Wiki` line**: once I answer, write what I approved and nothing else, then the
  session summary.

The session summary is `<today>-<topic-slug>.md`: where an explicit rule loaded in this session
says session summaries go, else in the block's sessions folder, creating the folder if it is
absent. If the block's `Template:` line names a file to follow, follow it and fill its
placeholders; never edit the template. If it says `Template: none`, use the default format below:

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
- **Files touched**: paths or relative links, created / edited / moved, checked — don't assume.
- **Decisions**: include what we rejected and why.
- **Open questions**: what's still open from step 1.
- **Next steps**: `- [ ]` items.

Add a ticket field only if the session's rules name a ticket tool and a ticket came up in the
session; omit it otherwise. No commit.
