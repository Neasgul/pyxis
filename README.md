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

Handoffs between sessions, a context threshold alert and a session wrap-up, kept in a notes
folder (the `vault` option):

- **Rules.** The first message of each session, and the first after a compaction, carries the
  notes folder, its folders and the passation rule.
- **Passations** (handoffs). At start, a banner lists the open ones of the session's
  repository, and those outside any repository in a session of the notes folder; "Resume"
  files the note and resumes it; `/pyxis:passations` shows the banner again. Past the
  threshold, the model is asked once to write one, as `/pyxis:passation` describes; it is
  asked again after the context falls back below the threshold. Hiding the warning cancels the
  request too.
- **Skills.** Each one gets the folders and what it needs from pyxis when you type it:
  `/pyxis:wrapup` (review the session, propose what to retain and where, write its summary)
  and `/pyxis:passation` (hand a task over). The wrap-up writes where the rules loaded in the
  session say, and names the rule behind each destination; without one, a fact stays in the
  session summary.

Removed in 0.3.0: project hubs, the dashboard, and the capture, inbox, hub, decision, daily,
morning and todos skills.

Options: `vault` (the notes folder, required), `language` (`en` or `fr`) and `threshold`
(tokens, 300k by default, 75% of the model's window when that is smaller).

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

pyxis never edits a note beyond what its banner and its skills do, and needs nothing but Claude
Code.

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
