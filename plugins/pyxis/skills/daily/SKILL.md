---
description: Write today's daily note - recap, carried-over todos, session log. Use when I say daily, recap my day, or close out the day.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git log:*)
disable-model-invocation: true
---

pyxis attaches a block to this command, starting `pyxis, for /pyxis:daily`: the vault, today's
date, the vault's folders and what this skill needs. If it is not in your context, pyxis's hooks
did not run: tell the user so in one line and stop. Folders below are roles (the inbox folder,
the hubs folder…); the block names them. If the block says a folder is missing, say so and stop.

Write notes in the language of the template, else of the vault's CLAUDE.md, else of the notes
around them. Reply in the user's language.

The block gives `Today's daily note` (exists or absent), `Previous daily note` and
`Session notes of today`.

Git activity today: !`git log --since=midnight --oneline --all 2>/dev/null | head -20`

1. Open today's note, creating it if absent. If the block names a template, follow it and
   fill its placeholders; never edit the template. If it says `Template: none`, use:

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

2. Read the previous daily note. Move every unchecked `- [ ]` into today under
   `## Carried over`, verbatim, keeping tags and 📅 dates. Leave the old note alone — don't
   delete the lines there, check them off with `- [>]` (rescheduled). If the block lists no
   previous note, there is nothing to carry over: say so in one line.
3. Read the `Session notes of today`. Summarize each in one bullet under `## Done`, linking
   the session note.
4. Under `## Open`, list anything tagged with the verify tag of the vault's conventions
   (the rules block names it), if any, created today.
5. Stop. Do not invent accomplishments. If the day is empty, say so in one line.
