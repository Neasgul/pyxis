---
description: Bring a source, or the notes waiting in the wiki inbox, into the wiki's pages, after the user agrees to each change. Use when the user says ingest, process the wiki inbox, or add this to the wiki.
argument-hint: "[source]"
disable-model-invocation: true
---

# ingest

pyxis attaches a block to this command, starting `pyxis, for /pyxis:ingest`. Its `Wiki:` line
gives the wiki folder (`<wiki>` below) and the folder of its scripts (`<scripts>` below). If the
block is not in your context, pyxis's hooks did not run or failed: tell the user so in one line
(the `pyxis-errors.log` of the logs folder or the plugin's options may say why) and stop. If it
has a `Missing:` line, say so in one line and stop.

The wiki's contract is `<wiki>/AGENTS.md`: the page format and the writing rules. Reply in the
user's language; write pages in the language `<wiki>/AGENTS.md` sets.

**Nothing enters a page without the user's agreement.** Steps 0 to 3 only read, except the setup
of step 0, which waits for the user's yes. Write nothing before they have agreed to the source
you are on.

## 0. The contract

If `<wiki>/AGENTS.md` exists, go on to step 1.

If it is missing, the folder is not yet a wiki. Propose to create its skeleton with
`bun "<scripts>/init.ts" "<wiki>" <language>`, where `<language>` is `en` or `fr`, the user's
language. The script never overwrites an existing file. Wait for the user's agreement, then run
it. Then ask the user to fill the `## Folders` section of `<wiki>/AGENTS.md` (one line per
top-level folder: what it holds), and do no ingest until it is filled.

## 1. Gather the sources

- With an argument: that source. Read it whole. A Jira or Confluence page is read through its
  connector; a repo document through its path.
- Without an argument: every note in `<wiki>/inbox/` (not `.gitkeep`), oldest first.
- No argument and an empty inbox: say so and stop.

Check each source for secrets (a password, a key, a token, credentials in a URL) before going
further. If it holds one, tell the user which source and which line, without quoting the value,
and set that source aside: it is not presented, moved or saved until they have dealt with it.

## 2. Find where each source lands

Read `<wiki>/index.md`, then the pages the source touches. For a note, start from its `target:`,
but check the other pages of the folder too: the fact may already be there, or contradict one.

## 3. Present, one source at a time, and wait

For each source, give the user:

- one line saying what it is;
- every page you would change, create or split, and what changes in each, in a line or two. A
  page that a change pushes past 2,500 characters is split: say so here, with the new page's
  name;
- what it overlaps or contradicts in an existing page: name the page and quote the sentence.

Then wait for their answer on that source. Once they agree, do steps 4 to 6 for that source
before presenting the next one: the next proposal must be made against the pages as they now
are.

If they refuse, leave the note where it is. Delete a note only when they say to. If they agree
to part of it, write that part and ask them whether the note moves to `raw/` or stays in the
inbox.

## 4. Write what they agreed to

- Edit or create the pages you presented, and only those. If writing shows that another page
  must change or be split, stop and ask them first.
- Keep their wording and the source's facts; do not add what the source does not say. Mark what
  you could not check `TODO(verify)`. Never write a secret.
- A page stays under 2,500 characters, frontmatter included. Split one that grows past it, and
  link the two halves to each other.
- Link a page to the sibling pages it relies on, with relative markdown links.
- Update `summary` (it must still say what the page holds), `triggers`, `sources`, `updated`.
- The source becomes a file under `<wiki>/raw/<folder>/`, cited in `sources`:
  - an inbox note is moved there, unchanged: `mkdir -p <wiki>/raw/<folder>`, then
    `mv <wiki>/inbox/<note> <wiki>/raw/<folder>/` (a note is usually untracked, so `git mv`
    fails);
  - an external document with no file (a Confluence page, a conversation) is saved there first;
  - a file outside any repository (a session note, a download) is copied there;
  - a file of a repository is cited by its path and not copied;
  - a file already under `<wiki>/raw/` is cited as it is.
- Never modify a file under `<wiki>/raw/` once it is there.

## 5. Check

1. `bun "<scripts>/index.ts" "<wiki>"`: it rewrites `<wiki>/index.md` and refuses when a page has a
   problem. Fix what it reports and run it again.
2. `bun "<scripts>/lint.ts" "<wiki>"`: no new error. Fix an error your change caused. An error on a
   page or a line you did not touch, and any `possible secret`, is the user's call: report it
   with its page and line, without quoting a secret, and do not rewrite it yourself. Tell them
   about new warnings.

## 6. Log and report

Append to `<wiki>/log.md`, one entry per source:

```markdown
## [YYYY-MM-DD] ingest | <title of the source>
Pages: <pages touched>. Raw: <file added under raw/>.
```

Then list the pages touched, in one line each. Do not commit unless the user asks.
