import { afterAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { buildGraph, renderGraph } from './graph'

const dirs: string[] = []

async function wiki(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wiki-'))
  dirs.push(dir)
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await Bun.write(join(dir, path), content)
  }

  return dir
}

afterAll(() => Promise.all(dirs.map(dir => rm(dir, { recursive: true, force: true }))))

const page = (summary: string, rest = '') => `---\nsummary: ${summary}\n${rest}---\n\n# Title of ${summary}\n`

test('pages, raw sources and inbox notes are nodes, in their service folder', async () => {
  const dir = await wiki({
    'index.md': '# Index\n',
    'billing/overview.md': page('Billing'),
    'raw/billing/note.md': 'Some raw note about the quota.\n',
    'inbox/2026-11-17-billing-meteo.md': '---\ncreated: 2026-11-17\ntarget: new page (billing/meteo.md)\n---\n\nWeather.\n',
  })
  const { nodes } = await buildGraph(dir)

  expect(nodes.map(({ id, kind, group }) => [id, kind, group])).toEqual([
    ['billing/overview.md', 'page', 'billing'],
    ['raw/billing/note.md', 'raw', 'billing'],
    ['inbox/2026-11-17-billing-meteo.md', 'inbox', 'billing'],
  ])
  expect(nodes[0]?.title).toBe('Title of Billing')
  expect(nodes[1]?.summary).toBe('Some raw note about the quota.')
  expect(nodes[2]?.updated).toBe('2026-11-17')
})

test('links, cited raw sources and proposed targets are edges; broken links are dropped', async () => {
  const dir = await wiki({
    'billing/overview.md': page('Billing', 'sources:\n  - raw/billing/note.md\n  - ~/repo/Makefile\n') +
      '[Auth](../auth/overview.md#tokens), [gone](gone.md), [self](overview.md), `[code](../auth/overview.md)`\n',
    'auth/overview.md': page('Auth') + '[Billing](../billing/overview.md) and again [it](../billing/overview.md)\n',
    'raw/billing/note.md': 'note\n',
    'inbox/2026-11-17-auth-x.md': '---\ntarget: auth/overview.md\n---\n\nx\n',
  })
  const { links } = await buildGraph(dir)

  expect(links).toEqual([
    { source: 'auth/overview.md', target: 'billing/overview.md', type: 'link' },
    { source: 'billing/overview.md', target: 'auth/overview.md', type: 'link' },
    { source: 'billing/overview.md', target: 'raw/billing/note.md', type: 'link' },
    { source: 'inbox/2026-11-17-auth-x.md', target: 'auth/overview.md', type: 'proposes' },
  ])
})

test('an inbox note without a folder in its target goes to the folder its name starts with, else shared', async () => {
  const dir = await wiki({
    'search/overview.md': page('Search'),
    'inbox/2026-11-17-search-recipients.md': '---\ntarget: new page\n---\n\nx\n',
    'inbox/2026-11-17-reports-reset.md': '---\ntarget: new page\n---\n\nx\n',
  })
  const groups = (await buildGraph(dir)).nodes.map(node => node.group)

  expect(groups).toEqual(['search', 'shared', 'search'])
})

test('the data cannot close the script it is embedded in', () => {
  const html = renderGraph(
    { nodes: [{ id: 'a/b.md', kind: 'page', group: 'a', title: 't', summary: '</script><b>$&', updated: '', size: 1 }], links: [] },
    '<script>const DATA = __DATA__; const D = "__DATE__";</script>',
    '2026-11-17',
  )

  expect(html).toContain('<\\/script><b>$&')
  expect(html).toContain('const D = "2026-11-17"')
  expect(html.match(/<\/script>/g)?.length).toBe(1)
})

test('the live flag is put in, and a summary holding a placeholder is left as written', () => {
  const graph = { nodes: [{ id: 'a/b.md', kind: 'page' as const, group: 'a', title: 't', summary: '__DATE__ __LIVE__', updated: '', size: 1 }], links: [] }
  const template = 'const L = __LIVE__; const DATA = __DATA__; const D = "__DATE__";'

  expect(renderGraph(graph, template, '2026-11-19')).toContain('const L = false;')
  const live = renderGraph(graph, template, '2026-11-19', true)
  expect(live).toContain('const L = true;')
  expect(live).toContain('"summary":"__DATE__ __LIVE__"')
  expect(live).toContain('const D = "2026-11-19"')
})

test('the command without a wiki folder, or without --out, prints a usage and exits 2', async () => {
  const dir = await wiki({ 'billing/overview.md': page('Billing') })
  const run = async (...args: string[]) => {
    const proc = Bun.spawn(['bun', join(import.meta.dir, 'graph.ts'), ...args], { stdout: 'pipe', stderr: 'pipe' })
    const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited])

    return { err, code }
  }

  for (const result of [await run(), await run('--out', join(dir, 'g.html')), await run(dir)]) {
    expect(result.code).toBe(2)
    expect(result.err).toContain('usage:')
  }
})
