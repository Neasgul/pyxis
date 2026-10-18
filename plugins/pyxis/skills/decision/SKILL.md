---
description: Record a settled decision as a note under its project's hub folder and link it from the hub. Use when I say decision, we decided, record this, or ADR.
argument-hint: <what was decided>
allowed-tools: Read, Write, Edit, Glob, Grep
disable-model-invocation: true
---

pyxis attaches a block to this command, starting `pyxis, for /pyxis:decision`: the vault, today's
date, the vault's folders and what this skill needs. If it is not in your context, pyxis's hooks
did not run: tell the user so in one line and stop. Folders below are roles (the inbox folder,
the hubs folder…); the block names them. If the block says a folder is missing, say so and stop.

Write notes in the language of the template, else of the vault's CLAUDE.md, else of the notes
around them. Reply in the user's language.

The block gives the hubs and this session's hubs.

Decision: $ARGUMENTS

## Where it goes

`<hubs>/<Folder>/<today>-<slug>.md`. The hub is the one under `This session's hubs` in the
block; if there is none, or several, ask me. The note follows the template if the block names
one (fill its placeholders; never edit the template). Otherwise:

```yaml
---
created: <today>
tags: [type/decision]
status: active
---
```

Add the hub's project tag to `tags` if the hub has one. Add a ticket field only if the
vault's CLAUDE.md names a ticket tool and a ticket actually came up. Don't hunt for one.

## Body

Four sections, in this order:

- `## Context` — what forced the decision. One paragraph.
- `## Decision` — what we settled on. State it flatly, no hedging.
- `## Alternatives rejected` — what else was on the table and why it lost.
- `## Consequences` — what this commits us to now, including the costs.

**`## Alternatives rejected` is mandatory.** If I haven't told you what we
rejected, ask me. Never write "none considered" — it's almost never true, and
that section is the one I'll actually reread.

## Two modes

**A decision was just made in this conversation** — draft all four sections
from it and show me before you write anything.

**Invoked cold** — interview me: what was decided, what forced it, what lost.
Three questions at a time, maximum.

## The hub line

Once the note is written, append one line and its `[[link]]` to the project
hub, in the section that fits, if the hub has these sections; otherwise propose the section
that fits:

| The decision is about | Section |
|---|---|
| structure, boundaries, how services talk to each other | `## Architecture` |
| a constraint or a trap that will bite someone later | `## Gotchas` |
| a language, framework or library choice | `## Stack` |
| environments, pipelines, infrastructure | `## Deploy & infra` |
| an API contract | `## Endpoints` |

Tell me which section you picked and why before writing it, and let me
redirect you. Append only — don't reorder or restyle the hub.

## Don't

- Don't invent the rationale. If you don't know why something was rejected,
  ask instead of reconstructing it. Anything you inferred gets the verify tag.
- Don't write a decision note for something still under discussion. If it
  isn't settled, say so and stop.
- Don't touch another project's hub.
