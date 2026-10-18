---
description: Morning brief - open today's note, carry over unfinished work, show where I left off yesterday. Use when I say morning, start the day, or ask what I'm working on today.
allowed-tools: Read, Write, Edit, Glob, Grep
disable-model-invocation: true
argument-hint: [optional focus]
---

pyxis attaches a block to this command, starting `pyxis, for /pyxis:morning`: the vault, today's
date, the vault's folders and what this skill needs. If it is not in your context, pyxis's hooks
did not run: tell the user so in one line and stop. Folders below are roles (the inbox folder,
the hubs folder…); the block names them. If the block says a folder is missing, say so and stop.

Write notes in the language of the template, else of the vault's CLAUDE.md, else of the notes
around them. Reply in the user's language.

The block gives `Today's daily note` (exists or absent), `Previous daily note`,
`Session notes of today`, `Newest session note`, `Open todos` (overdue first),
`Repositories of the hubs` and `Inbox, oldest first` with each note's age.

If `Repositories of the hubs` is `none`, no hub declares `repos:` yet: say so in one line,
suggest `/pyxis:hub <name>`, and move on — don't fall back to globbing the user's
project folders.

## Steps

1. Open today's note. If it doesn't exist, create it: follow the template if the block names
   one and fill its placeholders, else use:

   ```markdown
   ---
   created: <today>
   tags: [daily]
   status: active
   ---

   ## Today

   ## Carried over

   ## Done

   ## Notes

   ## Open
   ```

   If it already exists, leave what's there — I may have started it myself.

2. Read the `Previous daily note`. Copy every unchecked `- [ ]` into today
   under `## Carried over`, verbatim with its tags and 📅 date. In the old
   note, change those lines to `- [>]` so they're marked rescheduled, not lost.
   If the block lists no previous note, skip this step.

3. Read the `Newest session note`. Quote its **Next steps** and
   **Open questions** sections as-is. Don't re-summarize the session —
   I wrote those lines for exactly this moment.

4. Read `Open todos` from the block: it is already sorted and flags what is overdue. List
   overdue separately from due-today. Don't grep for them.

5. If the vault's CLAUDE.md names a ticket tool and its MCP server is connected,
   list my tickets in progress and flag any whose status changed since yesterday;
   otherwise skip silently — don't mention it to me every morning.

6. Name the inbox notes (titles only, no summaries). Don't process them.

## Output

One screen, in this order: **Left off** / **Overdue** / **Due today** /
**In flight** (branches + tickets) / **In the inbox** (n notes).

Fifteen lines maximum. No preamble, no encouragement, no restating
what I already know from CLAUDE.md.

Then propose three candidates for today with one line of reasoning each,
and stop. Write them into `## Today` only after I pick.

If an argument gives a focus, keep the brief to it.

## Don't

- Don't touch the archive folder, and don't open project notes untouched in 7 days.
- Don't create, move, or edit anything except today's daily note and the
  `- [>]` marks in the previous one.
- If nothing changed since yesterday, say so in two lines and stop.
