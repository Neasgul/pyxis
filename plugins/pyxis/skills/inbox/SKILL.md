---
description: Process the vault's inbox note by note - summarise, propose a destination and a title, move only on my confirmation. Use when I say process the inbox, clear the inbox, or triage.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(mv:*)
disable-model-invocation: true
---

pyxis attaches a block to this command, starting `pyxis, for /pyxis:inbox`: the vault, today's
date, the vault's folders and what this skill needs. If it is not in your context, pyxis's hooks
did not run or failed: tell the user so in one line (the vault's `pyxis-errors.log` or the plugin's
`vault` option may say why) and stop. Folders below are roles (the inbox folder,
the hubs folder…); the block names them. If the block says a folder is missing, say so and stop.

Write notes in the language of the template, else of the vault's CLAUDE.md, else of the notes
around them. Reply in the user's language.

The block lists the inbox, oldest first, with each note's age, and the hubs.

If the inbox is empty, say so in one line and stop. If the list ends with `- … and N more`,
it is cut: say so, and look in the inbox folder for the rest.

## First, the list

Read every inbox note and print one line each: the filename, then a one-line
summary in my words. When a note is more than 30 days old, end the line with
"(<n> days old: still useful?)". No proposals yet — I want the scope before the detail.

## Then one note at a time, oldest first

For each note, give me:

- the one-line summary again
- a proposed destination, from the four below
- a proposed title, kebab-case, with no em dash or en dash
- any merge candidate, stated as "this overlaps with [[X]]" — search
  the hubs folder and the archive folder before telling me there isn't one

Then wait. Move nothing until I confirm. One note per exchange.

## Destinations

1. **New note under `<hubs>/<Folder>/`** — rename to the confirmed title,
   keep `created` as it is, fix the tags if `capture` guessed wrong. Then add
   it to that project's hub under `## Related notes`, or the section of the hub that
   fits if it has no such section: the `[[link]]` plus a few words on what it is.
2. **Merge into an existing note** — append to the end of the target under a
   `## <today>` sub-heading. Don't restyle or reorder the target. Then move the
   inbox file to the archive folder and set `status: archived`. If there is no archive
   folder, ask me before leaving the note in place.
3. **The archive folder** — move as-is, set `status: archived`. Not offered when the block
   lists no archive folder.
4. **Leave it in the inbox** — note why, move on.

## After any move

Renaming breaks backlinks. Grep the vault for `[[<old filename>]]` and update
every hit in the same pass. Tell me how many you changed.

## Don't

- Don't move, rename or merge anything I haven't confirmed.
- Don't turn a summary into something the note doesn't say. Notes in the inbox are
  rough and often half-wrong — quote rather than interpret.
- Don't process the whole inbox in one message. One note, then stop.
- Don't create a `<hubs>/<Folder>/` folder for a project that has no hub
  without asking me first.
