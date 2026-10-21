---
description: Review open todos across projects and propose what to do next.
allowed-tools: Read
disable-model-invocation: true
---

pyxis attaches a block to this command, starting `pyxis, for /pyxis:todos`: the vault, today's
date, the vault's folders and what this skill needs. If it is not in your context, pyxis's hooks
did not run or failed: tell the user so in one line (the vault's `pyxis-errors.log` or the plugin's
`vault` option may say why) and stop. Folders below are roles (the inbox folder,
the hubs folder…); the block names them. If the block says a folder is missing, say so and stop.

Write notes in the language of the template, else of the vault's CLAUDE.md, else of the notes
around them. Reply in the user's language.

Read `Open todos` in the block: every `- [ ]` of the daily and hubs folders, overdue first,
with its note, line and 📅 date. If it is `none`, say so in one line and stop. If the list
ends with `- … and N more`, it is cut: say so.

Group them by the project tag of their note; read the note if the tag isn't clear from the
block. For each, show the task, its note and its due date. Flag anything overdue.

Then recommend three for today and say why. Don't edit anything.
