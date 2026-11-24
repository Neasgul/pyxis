---
description: Health check of the wiki, in two halves, a script (broken links, oversized pages, stale index, secrets, pending inbox notes) and a read-through for contradictions and stale claims. It reports and fixes nothing on its own. Use when the user says lint the wiki or check the wiki.
disable-model-invocation: true
---

# lint

pyxis attaches a block to this command, starting `pyxis, for /pyxis:lint`. Its `Wiki:` line gives
the wiki folder (`<wiki>` below) and the folder of its scripts (`<scripts>` below). If the block
is not in your context, pyxis's hooks did not run or failed: tell the user so in one line (the
`pyxis-errors.log` of the logs folder or the plugin's options may say why) and stop. If it has a
`Missing:` line, say so in one line and stop.

Read `<wiki>/AGENTS.md` first: the page format and the writing rules. Reply in the user's
language.

**This skill reports. It changes no page** until the user says what to fix. The only thing it
writes on its own is its entry in `<wiki>/log.md`.

## 1. The script

Run `bun "<scripts>/lint.ts" "<wiki>"` and keep its output: errors (page problems, broken links,
possible secrets, stale index) and warnings (no inbound link, missing frontmatter fields,
`TODO(verify)`, notes pending in the inbox).

## 2. The read-through

Read the pages, folder by folder, and look for what a script cannot see:

- **Contradictions** between two pages. Quote both sentences.
- **Stale claims**: a statement the repository named in `sources` no longer supports. Open the
  cited file before saying so; do not report from memory. A source you cannot reach is reported
  as "not checked", not as stale.
- **Each `TODO(verify)`**: can it be checked now? If you check it, say what you found and where.
- **Subjects without a page**: something several pages mention and none explains.
- **References broken by a split**: "above", "the same incident", "see below" pointing at text
  that is now in another page. Name the page it should link to.
- **Summaries** that do not say what their page holds: the summary is what a page is chosen on.

## 3. Report

One report, errors first. For each point: the page, the line, what is wrong, and the fix you
propose. Say plainly what you did not check. Never quote a possible secret, in the report or in
the log: give its page and line only.

## 4. Fix only what the user validates

Wait for them. What they agree to is then written under the rules of `<wiki>/AGENTS.md`: edit
the page, then run `bun "<scripts>/index.ts" "<wiki>"` and `bun "<scripts>/lint.ts" "<wiki>"` again.

## 5. Log

Append one entry to `<wiki>/log.md`, with the script's counts from its first run:

```markdown
## [YYYY-MM-DD] lint | <N> errors, <M> warnings
<what was fixed, or "report only">
```

Do not commit unless the user asks.
