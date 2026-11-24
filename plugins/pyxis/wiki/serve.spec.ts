import { afterAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Graph } from './graph'
import { type GraphServer, serveGraph } from './serve'

const dirs: string[] = []
const servers: GraphServer[] = []

afterAll(async () => {
  for (const server of servers) {
    server.stop()
  }
  await Promise.all(dirs.map(dir => rm(dir, { recursive: true, force: true })))
})

async function start(): Promise<{ dir: string; url: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'wiki-serve-'))
  dirs.push(dir)
  await mkdir(join(dir, 'billing'))
  await Bun.write(join(dir, 'billing/overview.md'), '---\nsummary: Billing\n---\n\n# Billing\n')
  const server = await serveGraph(dir, 0, 20)
  servers.push(server)

  return { dir, url: server.url }
}

/** Reads the `data:` events of an event stream, one at a time. */
function events(body: ReadableStream<Uint8Array>): () => Promise<Graph> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  return async () => {
    for (;;) {
      const end = buffer.indexOf('\n\n')
      if (end !== -1) {
        const event = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        if (event.startsWith('data: ')) {
          return JSON.parse(event.slice(6))
        }
        continue
      }
      const { value, done } = await reader.read()
      if (done) {
        throw new Error('stream closed')
      }
      buffer += decoder.decode(value, { stream: true })
    }
  }
}

test('a request whose Host is not the loopback address and the port is refused', async () => {
  const { url } = await start()
  const port = new URL(url).port

  for (const host of ['evil.example', `evil.example:${port}`, `127.0.0.1:${Number(port) + 1}`, '127.0.0.1']) {
    for (const path of ['/', '/events']) {
      expect((await fetch(new URL(path, url), { headers: { Host: host } })).status).toBe(403)
    }
  }
  expect((await fetch(url, { headers: { Host: `localhost:${port}` } })).status).toBe(200)
  expect((await fetch(url)).status).toBe(200)
})

test('the page is the graph in live mode', async () => {
  const { url } = await start()
  const html = await (await fetch(url)).text()

  expect(html).toContain('const LIVE = true;')
  expect(html).toContain('"id":"billing/overview.md"')
})

test('the event stream sends the graph on connect, then again when a file changes', async () => {
  const { dir, url } = await start()
  const response = await fetch(new URL('events', url))
  expect(response.headers.get('content-type')).toBe('text/event-stream')
  const next = events(response.body as ReadableStream<Uint8Array>)

  expect((await next()).nodes.map(node => node.id)).toEqual(['billing/overview.md'])

  await Bun.write(join(dir, 'billing/quota.md'), '---\nsummary: Quota\n---\n\n# Quota\n\n[Overview](overview.md)\n')
  const graph = await next()
  expect(graph.nodes.map(node => node.id)).toEqual(['billing/overview.md', 'billing/quota.md'])
  expect(graph.links).toEqual([{ source: 'billing/quota.md', target: 'billing/overview.md', type: 'link' }])
}, 5000)

test('an unknown path is a 404', async () => {
  const { url } = await start()

  expect((await fetch(new URL('nope', url))).status).toBe(404)
})

test('the command without a wiki folder prints a usage and exits 2', async () => {
  const env = { ...process.env, WIKI_DIR: '' }
  delete env.WIKI_DIR
  const proc = Bun.spawn(['bun', join(import.meta.dir, 'serve.ts')], { stdout: 'pipe', stderr: 'pipe', env })
  const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited])

  expect(code).toBe(2)
  expect(err).toContain('usage:')
})
