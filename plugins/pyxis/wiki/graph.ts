// Draws the wiki as an interactive graph: one HTML page, its data embedded.
//
//   bun wiki/graph.ts --out <file> <wikiDir>
//
// Nodes are the pages, the raw sources and the inbox notes. Edges are the relative links
// (read as lint.ts reads them), the `raw/` files a page cites in `sources`, and the page an
// inbox note proposes in `target`. The page is `graph.template.html` with the data put in.
// It reads the wiki, it never writes to it.

import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { body, field } from './frontmatter'
import { relativeLinks, resolveLink } from './lint'
import { loadPages } from './pages'

export type GraphNode = {
  id: string
  kind: 'page' | 'raw' | 'inbox'
  /** The service folder it belongs to. */
  group: string
  title: string
  summary: string
  updated: string
  size: number
}

export type GraphLink = { source: string; target: string; type: 'link' | 'proposes' }

export type Graph = { nodes: GraphNode[]; links: GraphLink[] }

/** The first `# ` heading of the body, else the file name. */
function title(path: string, text: string): string {
  const heading = /^# (.+)$/m.exec(body(text))

  return heading?.[1]?.trim() ?? path.split('/').pop()?.replace(/\.md$/, '') ?? path
}

/** The summary, or the start of the body for a file that has none (raw sources, inbox notes). */
function summary(text: string): string {
  const own = field(text, 'summary')
  if (own) {
    return own
  }
  const flat = body(text).replace(/^#.*$/gm, '').replace(/\s+/g, ' ').trim()

  return flat.length > 220 ? `${flat.slice(0, 219)}…` : flat
}

async function scan(wikiDir: string, folder: string): Promise<string[]> {
  const paths: string[] = []
  for await (const path of new Bun.Glob(`${folder}/**/*.md`).scan({ cwd: wikiDir })) {
    paths.push(path.replaceAll('\\', '/'))
  }

  return paths.sort()
}

export async function buildGraph(wikiDir: string): Promise<Graph> {
  const pages = await loadPages(wikiDir)
  const folders = new Set(pages.map(page => page.folder))
  const texts = new Map<string, string>()
  const nodes: GraphNode[] = []
  const add = (node: Omit<GraphNode, 'title' | 'summary' | 'size'>, text: string) => {
    texts.set(node.id, text)
    nodes.push({ ...node, title: title(node.id, text), summary: summary(text), size: [...text].length })
  }

  for (const page of pages) {
    add({ id: page.path, kind: 'page', group: page.folder, updated: page.updated }, page.text)
  }
  for (const path of await scan(wikiDir, 'raw')) {
    const text = await Bun.file(join(wikiDir, path)).text()
    add({ id: path, kind: 'raw', group: path.split('/')[1] ?? 'raw', updated: field(text, 'updated') }, text)
  }
  for (const path of await scan(wikiDir, 'inbox')) {
    const text = await Bun.file(join(wikiDir, path)).text()
    const target = field(text, 'target')
    const fromTarget = /([\w-]+)\/[\w-]+\.md/.exec(target)?.[1]
    const fromName = path.split('/').pop()?.replace(/^\d{4}-\d\d-\d\d-/, '').split('-')[0] ?? ''
    const group = fromTarget ?? (folders.has(fromName) ? fromName : 'shared')
    add({ id: path, kind: 'inbox', group, updated: field(text, 'created') }, text)
  }

  const ids = new Set(nodes.map(node => node.id))
  const seen = new Set<string>()
  const links: GraphLink[] = []
  const link = (source: string, target: string, type: GraphLink['type']) => {
    const key = `${source}>${target}>${type}`
    if (source !== target && ids.has(target) && !seen.has(key)) {
      seen.add(key)
      links.push({ source, target, type })
    }
  }

  for (const node of nodes) {
    const text = texts.get(node.id) ?? ''
    for (const target of relativeLinks(text)) {
      link(node.id, resolveLink(node.id, target), 'link')
    }
    for (const source of pages.find(page => page.path === node.id)?.sources ?? []) {
      if (source.startsWith('raw/')) {
        link(node.id, source, 'link')
      }
    }
    if (node.kind === 'inbox') {
      const proposed = /([\w-]+\/[\w-]+\.md)/.exec(field(text, 'target'))?.[1]
      if (proposed) {
        link(node.id, proposed, 'proposes')
      }
    }
  }

  return { nodes, links }
}

/**
 * The template with the graph, the date and the live flag put in. `</` is escaped so no summary
 * can close the script; the data goes in last so a summary holding `__DATE__` is left alone.
 * A live page listens to `serve.ts` for updates; a static one (the shared artifact) does not.
 */
export function renderGraph(graph: Graph, template: string, date: string, live = false): string {
  const data = JSON.stringify(graph).replaceAll('</', '<\\/')

  return template
    .replace('__DATE__', () => date)
    .replace('__LIVE__', () => String(live))
    .replace('__DATA__', () => data)
}

async function main(args: string[]): Promise<number> {
  const at = args.indexOf('--out')
  const out = at === -1 ? undefined : args[at + 1]
  const wikiDir = args.find((arg, i) => arg !== '--out' && (at === -1 || i !== at + 1))
  if (!out || !wikiDir) {
    console.error('usage: bun wiki/graph.ts --out <file> <wikiDir>')

    return 2
  }
  const graph = await buildGraph(wikiDir)
  const template = await Bun.file(join(import.meta.dir, 'graph.template.html')).text()
  await mkdir(dirname(out), { recursive: true })
  await Bun.write(out, renderGraph(graph, template, new Date().toISOString().slice(0, 10)))
  const count = (kind: GraphNode['kind']) => graph.nodes.filter(node => node.kind === kind).length
  console.log(`${out}: ${count('page')} pages, ${count('raw')} raw, ${count('inbox')} inbox, ${graph.links.length} links`)

  return 0
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)))
}
