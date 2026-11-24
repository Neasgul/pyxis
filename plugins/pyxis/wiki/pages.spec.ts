import { afterAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadPages, pageProblems, parsePage } from './pages'

const page = (summary: string) => `---\nsummary: ${summary}\n---\n\n`

const dirs: string[] = []

/** A throwaway wiki holding the given files, each a valid page. */
async function wiki(paths: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wiki-'))
  dirs.push(dir)
  for (const path of paths) {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await Bun.write(join(dir, path), page('Fine'))
  }

  return dir
}

afterAll(async () => {
  await Promise.all(dirs.map(dir => rm(dir, { recursive: true })))
})

test('parsePage reads path, folder and frontmatter', () => {
  const p = parsePage(
    'billing/deploy.md',
    '---\nsummary: Deploy\ntriggers: [ecs]\nsources: [a.md]\nupdated: 2026-11-14\n---\n\nx',
  )

  expect(p).toMatchObject({
    path: 'billing/deploy.md',
    folder: 'billing',
    summary: 'Deploy',
    triggers: ['ecs'],
    sources: ['a.md'],
    updated: '2026-11-14',
  })
})

test('a valid page has no problem', () => {
  expect(pageProblems(parsePage('billing/a.md', page('Fine')))).toEqual([])
})

test('size is counted in characters, not bytes', () => {
  const text = page('Fine')
  const fill = (n: number) => text + 'é'.repeat(n - [...text].length)

  expect(pageProblems(parsePage('billing/a.md', fill(2500)))).toEqual([])
  expect(pageProblems(parsePage('billing/a.md', fill(2501)))).toEqual(['over 2500 characters (2501)'])
})

test('missing or unclosed frontmatter, missing summary, page at the root', () => {
  expect(pageProblems(parsePage('billing/a.md', '# Title\n'))).toEqual(['no frontmatter'])
  expect(pageProblems(parsePage('billing/a.md', '---\nsummary: x\n# Title\n'))).toEqual(['frontmatter not closed'])
  expect(pageProblems(parsePage('billing/a.md', '---\nupdated: 2026-11-14\n---\n'))).toEqual(['no summary'])
  expect(pageProblems(parsePage('stray.md', page('Fine')))).toEqual(['not in a folder'])
})

test('loadPages skips index.md, log.md, AGENTS.md, inbox/ and raw/, and sorts by path', async () => {
  const dir = await wiki([
    'index.md',
    'log.md',
    'AGENTS.md',
    'inbox/n.md',
    'raw/billing/r.md',
    'billing/b.md',
    'billing/a.md',
    'auth/x.md',
    'stray.md',
  ])

  expect((await loadPages(dir)).map(p => p.path)).toEqual(['auth/x.md', 'billing/a.md', 'billing/b.md', 'stray.md'])
})

test('loadPages on an empty wiki returns no page', async () => {
  expect(await loadPages(await wiki([]))).toEqual([])
})

test('parsePage reads repos', () => {
  const overview = '---\nsummary: x\nrepos:\n  - ~/code/billing-api\n---\n'

  expect(parsePage('billing/overview.md', overview).repos).toEqual(['~/code/billing-api'])
  expect(parsePage('billing/a.md', '---\nsummary: x\n---\n').repos).toEqual([])
})
