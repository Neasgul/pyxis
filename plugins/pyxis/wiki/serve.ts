// Serves the wiki graph live: the page redraws itself a moment after a file of the wiki changes.
//
//   bun wiki/serve.ts [--port 4321] <wikiDir>
//
// The wiki folder comes from the argument, else WIKI_DIR; without either it exits 2. The port
// from --port, else PORT, else 4321. It listens on 127.0.0.1 only.
// GET / is the graph page (the same template as graph.ts, in live mode); GET /events is a
// server-sent event stream that sends the whole graph on connect and after each change.
// It reads the wiki, it never writes to it. The shared artifact still comes from graph.ts.

import { type FSWatcher, watch } from 'node:fs'
import { join } from 'node:path'
import { buildGraph, renderGraph } from './graph'

export type GraphServer = { url: string; stop: () => void }

const encoder = new TextEncoder()

export async function serveGraph(wikiDir: string, port: number, debounceMs = 100): Promise<GraphServer> {
  const templatePath = join(import.meta.dir, 'graph.template.html')
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>()
  let json = JSON.stringify(await buildGraph(wikiDir))

  const send = (client: ReadableStreamDefaultController<Uint8Array>, chunk: string) => {
    try {
      client.enqueue(encoder.encode(chunk))
    } catch {
      clients.delete(client)
    }
  }
  const broadcast = (chunk: string) => {
    for (const client of clients) {
      send(client, chunk)
    }
  }

  // Rebuilt in full at each change (a few ms for the whole wiki). A file read mid-write or
  // deleted mid-scan can throw: the last good graph stays, the next change retries.
  let timer: ReturnType<typeof setTimeout> | undefined
  const rebuild = async () => {
    try {
      const next = JSON.stringify(await buildGraph(wikiDir))
      if (next !== json) {
        json = next
        broadcast(`data: ${json}\n\n`)
      }
    } catch (error) {
      console.error(`graph not rebuilt: ${error}`)
    }
  }
  const watcher: FSWatcher = watch(wikiDir, { recursive: true }, () => {
    clearTimeout(timer)
    timer = setTimeout(rebuild, debounceMs)
  })
  // A comment line now and then, so a closed tab is noticed and dropped.
  const heartbeat = setInterval(() => broadcast(': ping\n\n'), 25_000)

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port,
    // The event streams stay open; Bun would close them after 10 s of silence.
    idleTimeout: 0,
    async fetch(request) {
      // A page of another site that resolves its own name to 127.0.0.1 (DNS rebinding) sends its own Host.
      const host = request.headers.get('host')
      if (host !== `127.0.0.1:${server.port}` && host !== `localhost:${server.port}`) {
        return new Response('Forbidden', { status: 403 })
      }
      const { pathname } = new URL(request.url)
      if (pathname === '/') {
        // Read at each request, so an edit of the template shows on a reload.
        const template = await Bun.file(templatePath).text()
        const html = renderGraph(JSON.parse(json), template, new Date().toLocaleTimeString('en-GB'), true)

        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      }
      if (pathname === '/events') {
        let self: ReadableStreamDefaultController<Uint8Array>
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            self = controller
            clients.add(controller)
            send(controller, `data: ${json}\n\n`)
          },
          cancel() {
            clients.delete(self)
          },
        })

        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
      }

      return new Response('Not found', { status: 404 })
    },
  })

  return {
    url: server.url.href,
    stop: () => {
      watcher.close()
      clearTimeout(timer)
      clearInterval(heartbeat)
      for (const client of clients) {
        try {
          client.close()
        } catch {}
      }
      server.stop(true)
    },
  }
}

function option(args: string[], name: string): string | undefined {
  const at = args.indexOf(name)

  return at === -1 ? undefined : args[at + 1]
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const portArg = option(args, '--port')
  const positional = args.filter((arg, i) => arg !== '--port' && args[i - 1] !== '--port')
  const wikiDir = positional[0] ?? process.env.WIKI_DIR
  if (!wikiDir) {
    console.error('usage: bun wiki/serve.ts [--port 4321] <wikiDir>')
    process.exit(2)
  }
  const port = Number(portArg ?? process.env.PORT ?? 4321)
  const { url } = await serveGraph(wikiDir, port)
  console.log(`${url} (watching ${wikiDir})`)
}
