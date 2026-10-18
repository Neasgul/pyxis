---
description: Create or update a project hub - the note to read first for context on a project. Use when I say hub, or ask to document a project.
argument-hint: <project name>
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git:*)
disable-model-invocation: true
---

pyxis attaches a block to this command, starting `pyxis, for /pyxis:hub`: the vault, today's
date, the vault's folders and what this skill needs. If it is not in your context, pyxis's hooks
did not run: tell the user so in one line and stop. Folders below are roles (the inbox folder,
the hubs folder…); the block names them. If the block says a folder is missing, say so and stop.

Write notes in the language of the template, else of the vault's CLAUDE.md, else of the notes
around them. Reply in the user's language.

The block gives the existing hubs and this session's repository, if there is one.

Project: $ARGUMENTS

## Target

`<hubs>/<Folder>/<folder in lowercase>.md` — folder capitalised, filename lowercase
kebab. Create the folder if it's missing; it's not a root folder, so don't
ask first.

Before creating anything, look in `Hubs` for a hub with a close name (another spelling, a
prefix, a plural). If there is one, propose it and ask whether I mean it.

## If the hub doesn't exist

1. Write the skeleton and stop there. If the block names a template, follow it and fill its
   placeholders; never edit the template. Otherwise:

   ```yaml
   ---
   created: <today>
   tags: [project/<folder>]
   status: active
   repos: []
   triggers: []
   ---
   ```

   Then these headings, in order, all empty: `## Purpose` `## Stack`
   `## Architecture` `## Endpoints` `## Deploy & infra` `## Gotchas`
   `## Open questions` `## Related notes`.

2. Interview me. Three questions at a time, maximum. Purpose and stack
   first, then repos and triggers, then deploy, then gotchas. Write each answer into
   its section as I give it — don't hold the whole interview in your head
   and dump it at the end.

3. For `repos:`, propose `This session's repository` from the block, if there is one;
   otherwise ask me for the paths. If the vault's CLAUDE.md says where repositories live,
   list them from there and let me pick. Write them as paths, one `  - ` entry per line,
   so `/pyxis:morning` can read them. Don't map a repo to a project because the names look
   alike — ask.

   For `triggers:`, ask which words besides the project name should bring
   this hub into context — app or product names, a predecessor repo. One
   `  - ` entry per word; pyxis reads them. Leave out words common outside
   the project: each one pulls the hub into unrelated sessions.

4. Stop when I stop answering. An empty section stays empty. Never pad one
   to look finished.

## If the hub exists

1. Read it. Then read `<hubs>/<Folder>/` and, if the block lists them, the daily and sessions
   folders for anything modified since the hub was last edited.
2. Propose additions as a list: section, the line you'd add, the note it
   came from. If the frontmatter has no `triggers:`, propose one too.
3. Append only what I confirm. Don't restyle, reorder or rewrite what's
   already there.

## The archive folder

Read the archive folder, if the block lists one, for orientation only. It can tell you what
to ask me — "the archive mentions X under this project, still live?" — and never
what to write. Nothing from the archive enters a hub note as a statement,
and nothing there gets linked as though it were current.

## Anything you're unsure of

Write it with the verify tag instead of asserting it. That covers anything
you inferred from a repo name, a branch, or the vault's CLAUDE.md
rather than heard from me.

## Don't

- Don't invent endpoints, infrastructure, or project behaviour.
- Don't fill the note in one pass without asking. The interview is the point.
- Don't touch another project's hub.
