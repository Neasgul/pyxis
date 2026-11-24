# pyxis

Claude Code plugins for handing work over between sessions.

## context-gauge

Shows the context size and the usage limits in the status line, and warns once the
context reaches a threshold (300k tokens by default):

```text
ctx 182k / 300k · 5h 34% · 7d 12%
ctx 312k / 300k · 5h 41% · 7j 14% · seuil dépassé
```

Options: `threshold` (tokens) and `language` (`en` or `fr`). With a model whose context
window is too small for the threshold, the threshold is 75% of the window (150k for 200k).

## pyxis

Handoffs between sessions, a context threshold alert, a session wrap-up and a wiki Claude keeps.
The first three live in a notes folder (the `vault` option), the wiki in a folder of its own (the
`wiki` option):

- **Rules.** The first message of each session, and the first after a compaction, carries the
  notes folder, its folders and the passation rule.
- **Passations** (handoffs). At start, a banner lists the open ones of the session's
  repository, and those outside any repository in a session of the notes folder; "Resume"
  files the note and resumes it; `/pyxis:passations` shows the banner again. Past the
  threshold, the model is asked once to write one, as `/pyxis:passation` describes; it is
  asked again after the context falls back below the threshold. Hiding the warning cancels the
  request too.
- **Skills.** Each one gets the folders and what it needs from pyxis when you type it:
  `/pyxis:wrapup` (review the session, write its summary) and `/pyxis:passation` (hand a task
  over). With a wiki, the wrap-up writes the session summary and the wiki inbox notes without
  asking; a change to the rules, and a correction to an existing note, wait for your approval.
  Without a wiki, it proposes first and writes nothing before your answer, then the summary.
  Outside the wiki it writes where the rules loaded in the session say, and names the rule
  behind each destination; without one, a fact stays in the session summary.
- **Wiki.** Off by default. Set the `wiki` option to an existing folder (for example
  `~/notes/wiki`; an empty folder is fine, `/pyxis:ingest` offers to create the skeleton in it)
  and Claude keeps it: durable facts a session settles are written as notes to its `inbox/`, and
  never to a page without your agreement. With the option empty, the wiki features are off. If
  the folder is set but absent, pyxis says so once.
  - *Rule.* The rules block carries the wiki's path and the inbox rule: a note goes to
    `<wiki>/inbox/YYYY-MM-DD-<subject>.md`, in the format the wiki's own `AGENTS.md` gives, and
    inbox notes are never cited as true.
  - *Index.* At the first message of a session inside a repository that a wiki page names in its
    `repos:` field, the section of `<wiki>/index.md` for that page's folder is added to the
    block, when it is short enough.
  - *Counter.* The status line shows `inbox N` while notes wait in the inbox, refreshed every 30
    seconds.
  - *Skills.* `/pyxis:ingest [source]` brings a source, or the inbox notes, into the pages, one
    source at a time, after you agree to each change; `/pyxis:lint` checks the wiki (broken
    links, oversized pages, stale index, secrets, pending notes) and reads it for contradictions
    and stale claims, and fixes nothing unasked; `/pyxis:graph [file]` draws the wiki as a graph,
    served live on `127.0.0.1` or written to an HTML file. When the wiki has no `AGENTS.md`,
    ingest offers to create the skeleton (the rules, an empty index, a log, the `inbox/` and
    `raw/` folders), and never overwrites a file.

Removed in 0.3.0: project hubs, the dashboard, and the capture, inbox, hub, decision, daily,
morning and todos skills.

Options: `vault` (the notes folder, required), `wiki` (the wiki folder, optional), `language`
(`en` or `fr`) and `threshold` (tokens, 300k by default, 75% of the model's window when that is
smaller).

The wiki's scripts (index, lint, graph, skeleton) run with [bun](https://bun.sh), which the wiki
skills need; the rest of pyxis needs nothing but Claude Code. To let a session write to the inbox
from any folder, allow that folder yourself in `~/.claude/settings.json` (pyxis does not touch
your settings):

```json
{ "permissions": { "additionalDirectories": ["<wiki>/inbox"] } }
```

### Conventions

`<vault>/.claude/pyxis.json` names the folders, relative to the notes folder. Every key is
optional and falls back to the default below; `null` turns off what depends on a folder (no
`passations`: no handoffs). A key that is unknown or of the wrong type keeps its default, and
pyxis says so once.

```json
{
  "folders": {
    "templates": "Templates",
    "sessions": "AI/sessions",
    "logs": "AI/logs"
  },
  "passations": {
    "folder": "AI/passations",
    "outsideRepo": "no-repo",
    "resumed": "resumed"
  }
}
```

When the templates folder holds `session.md` or `passation.md`, the matching skill follows it.

pyxis never edits a note beyond what its banner and its skills do.

The rules go with your messages, so subagents never get them.

Where an organisation manages Claude Code, some events never reach a user plugin. pyxis does
without them: its blocks go with your messages, and a compaction is told by the conversation
growing shorter.

## Install

With the author's permission (see [License](#license)):

```bash
claude plugin marketplace add Neasgul/pyxis
claude plugin install context-gauge@pyxis --scope user
claude plugin install pyxis@pyxis --scope user
echo '{"vault":"<path to the vault>"}' | claude plugin configure pyxis@pyxis --values-stdin
```

To keep a wiki too, add `"wiki":"<path to the wiki>"` to those values.

`claude plugin marketplace update pyxis` then `claude plugin update pyxis@pyxis` bring a new
version.

### From a local clone

```bash
claude plugin marketplace add <path to this repository>
claude plugin install context-gauge@pyxis --scope user
claude plugin install pyxis@pyxis --scope user
echo '{"vault":"<path to the vault>"}' | claude plugin configure pyxis@pyxis --values-stdin
```

`claude plugin configure <plugin>` shows a plugin's options and their values; with
`--values-stdin` it sets them, leaving out the others:

```bash
echo '{"language":"fr"}' | claude plugin configure context-gauge@pyxis --values-stdin
```

## License

Copyright (c) 2026 Neasgul. All rights reserved: the code is published for reading only.
See [LICENSE](LICENSE).
