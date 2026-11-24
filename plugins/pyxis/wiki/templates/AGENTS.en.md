# Wiki

What is known about our projects and services, as short pages. The LLM writes and maintains
the pages; the user validates every change.

Pages are written in: English.

## Folders

One line per top-level folder: what it holds. Fill this in as the wiki grows.

- `shared/`: what spans several folders.

## Layout

- `index.md`: one line per page, by folder. Generated. Read it first to find a page.
- `log.md`: what was done to the wiki, append only.
- `inbox/`: facts waiting for the user's validation. They are not validated: never cite them as
  true.
- `raw/`: source documents (PDF, exports, dated notes). Never modify them.
- One folder per subject (`billing/`, `auth/`…), listed in Folders above.

## A page

```markdown
---
summary: Deploy of the billing service, the pipeline that ships it, known gap of the staging tag.
triggers: [deploy, rollout, pipeline]
sources:
  - ~/Projects/billing/Makefile
  - raw/billing/2026-10-23-quota-note.md
updated: 2026-11-13
---

# Billing: deploy
…
```

- At most 2,500 characters, frontmatter included. Split a page that grows past it.
- `summary`: one line that says what the page holds, not its title. It is what the index
  shows and what a page is chosen on.
- `triggers`: the words the user would use for this subject.
- `sources`: where the facts come from (a file of a repo, a file of `raw/`, a ticket).
- Links are relative markdown links (`[Auth: tokens](../auth/tokens.md)`), never `[[wikilinks]]`.
- Mark an uncertain fact `TODO(verify)` instead of asserting it.
- Never write a secret (password, key, token).

## Writing

**Nothing enters a page without the user's agreement.** Do not edit a page on your own
initiative. When a session settles a durable fact (architecture, endpoint, deploy, gotcha,
decision), write it to `inbox/YYYY-MM-DD-<subject>.md` and say so in one line:

```markdown
---
created: 2026-11-13
target: billing/deploy.md
origin: session in ~/Projects/billing
---

The fact, in a few lines, with what lets someone check it (file, commit, ticket).
```

`target` is the page you propose, or `new page`.

## Operations

- `/pyxis:ingest [source]`: bring a source, or the notes of `inbox/`, into the pages. The user
  runs it; it presents each change and waits for their agreement.
- `/pyxis:lint`: health check, a script then a read-through. It reports and fixes nothing on its
  own (broken links, page problems, stale index, secrets, pending notes).
- `/pyxis:graph`: draws the wiki as a graph. It reads, it never writes to the wiki.

After any change to a page that the user agreed to:

1. Regenerate `index.md` (`/pyxis:ingest` does it). It refuses when a page has a problem (too
   long, no `summary`, not in a folder).
2. Run `/pyxis:lint`: no new error.
3. Append an entry to `log.md`: `## [YYYY-MM-DD] <operation> | <title>`, then the pages touched.
