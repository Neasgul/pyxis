---
description: Capture a raw thought into the vault's inbox as a new note. Use when I say capture, note this, jot down, or dump this.
argument-hint: <the thing to capture>
allowed-tools: Read, Write, Glob, Grep
disable-model-invocation: true
---

pyxis attaches a block to this command, starting `pyxis, for /pyxis:capture`: the vault, today's
date, the vault's folders and what this skill needs. If it is not in your context, pyxis's hooks
did not run or failed: tell the user so in one line (the vault's `pyxis-errors.log` or the plugin's
`vault` option may say why) and stop. Folders below are roles (the inbox folder,
the hubs folder…); the block names them. If the block says a folder is missing, say so and stop.

Write notes in the language of the template, else of the vault's CLAUDE.md, else of the notes
around them. Reply in the user's language.

Create `<inbox>/<kebab-slug>.md` from what follows. Do not embellish,
do not research, do not add sections I didn't ask for.

The slug is kebab-case and has no em dash or en dash: `[[…]]` links compare
the file name as it is.

Frontmatter: created (today), tags, status: active.

- Tags: reuse tags already in the vault: those of the hubs listed in the block, or
  found by grepping `tags:` in the hubs folder. Never invent a tag family. If nothing fits,
  leave `tags: []`.
- Add a ticket field only if the vault's CLAUDE.md names a ticket tool and I gave a ticket.

Body: my words, in the language I typed them (no translation, no rewording), cleaned of typos
only. The language rule above applies to the frontmatter and structure, not to my words.
If I mentioned an existing note, link it with [[wikilinks]].

Then print the path and nothing else.

Capture this: $ARGUMENTS
