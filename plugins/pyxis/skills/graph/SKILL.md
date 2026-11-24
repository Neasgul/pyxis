---
description: Draw the wiki as a graph, served live in the browser or written to an HTML file. Use when the user says show the wiki graph or draw the wiki.
argument-hint: "[file]"
disable-model-invocation: true
---

# graph

pyxis attaches a block to this command, starting `pyxis, for /pyxis:graph`. Its `Wiki:` line
gives the wiki folder (`<wiki>` below) and the folder of its scripts (`<scripts>` below); its
`Graph file` list gives the path of the HTML file. If the block is not in your context, pyxis's
hooks did not run or failed: tell the user so in one line (the `pyxis-errors.log` of the logs
folder or the plugin's options may say why) and stop. If it has a `Missing:` line, say so in one
line and stop.

This skill reads the wiki and never writes to it. Reply in the user's language.

## Served (no argument)

Start `bun "<scripts>/serve.ts" "<wiki>"` in the background. It listens on `127.0.0.1` only, redraws
the graph when the wiki changes, and prints its URL (port 4321 by default; pass
`--port <n>` before `<wiki>` to choose another). Give the user the URL it printed, and say that
the server runs until they stop it.

## To a file (argument `file`)

Run `bun "<scripts>/graph.ts" --out "<Graph file>" "<wiki>"`, where `<Graph file>` is the path in the
block's `Graph file` list. Give the user that path. The file is a snapshot: it does not follow
later changes.
