# pyxis

Claude Code plugins for a second brain kept in an Obsidian vault.

## context-gauge

Shows the context size and the usage limits in the status line, and warns once the
context reaches a threshold (300k tokens by default):

```text
ctx 182k / 300k · 5h 34% · 7d 12%
```

Options: `threshold` (tokens) and `language` (`en` or `fr`).

## pyxis

The mechanisms of a second brain kept in an Obsidian vault:

- **Rules.** The first message of each session, and the first after a compaction, carries the
  vault's folders, the hub rule and, in a session of the vault, its working rules.
- **Hubs.** Each project has a hub, `<hubs>/<Folder>/<folder in lowercase>.md`, with optional
  `repos:` and `triggers:` in its frontmatter. A session in one of a hub's repositories gets
  the hub with its first message; a message naming a hub or one of its triggers gets it too,
  once per session.
- **Passations** (handoffs). At start, a banner lists the open ones of the session's
  repository; "Resume" files the note and resumes it; `/pyxis:passations` shows the banner
  again. Past the threshold, the model is asked to write one, as `/pyxis:passation` describes.
- **Dashboard.** `/pyxis:vault` opens a pane with the open todos, the latest daily note, the inbox,
  the notes to verify, the open handoffs and the error logs. It opens by itself in a session
  of the vault.
- **Skills.** Each one gets the vault's folders and what it needs from pyxis when you type it:
  `/pyxis:capture` (a raw thought into the inbox), `/pyxis:inbox` (triage the inbox note by
  note), `/pyxis:daily` (write today's note), `/pyxis:morning` (the morning brief),
  `/pyxis:todos` (open todos, three picks for today), `/pyxis:wrapup` (review the session,
  write its summary), `/pyxis:decision` (record a settled decision in a hub's folder),
  `/pyxis:hub` (create or update a project hub), `/pyxis:passation` (hand a task over).

Options: `vault` (the vault's folder, required), `language` (`en` or `fr`) and `threshold`
(tokens, 300k by default).

### Conventions

`<vault>/.claude/pyxis.json` names the vault's folders, relative to the vault. Every key is
optional and falls back to the default below; `null` turns off what depends on a folder (no
`daily`: no daily section in the dashboard). A key that is unknown or of the wrong type keeps
its default, and pyxis says so once.

```json
{
  "folders": {
    "inbox": "Inbox",
    "hubs": "Projects",
    "archive": "Archive",
    "daily": "Daily",
    "templates": "Templates",
    "sessions": "AI/sessions",
    "logs": "AI/logs"
  },
  "passations": {
    "folder": "AI/passations",
    "outsideRepo": "no-repo",
    "resumed": "resumed"
  },
  "verifyTag": "#todo/verify"
}
```

When the templates folder holds `daily.md`, `session.md`, `decision.md`, `hub.md` or
`passation.md`, the matching skills follow it.

pyxis never edits a note beyond what its banner, its dashboard and its skills do, and needs nothing but Claude
Code.

## Install from a local clone

```bash
claude plugin marketplace add <path to this repository>
claude plugin install context-gauge@pyxis --scope user
claude plugin install pyxis@pyxis --scope user
echo '{"vault":"<path to the vault>"}' | claude plugin configure pyxis@pyxis --values-stdin
```
