# pyxis

Claude Code plugins for a second brain kept in an Obsidian vault.

## context-gauge

Shows the context size and the usage limits in the status line, and warns once the
context reaches a threshold (300k tokens by default):

```text
ctx 182k / 300k · 5h 34% · 7d 12%
```

Options: `threshold` (tokens) and `language` (`en` or `fr`).

## Install from a local clone

```bash
claude plugin marketplace add <path to this repository>
claude plugin install context-gauge@pyxis --scope user
```
