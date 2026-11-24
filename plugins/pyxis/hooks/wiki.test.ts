import type { EngineInterface } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { DEFAULT_CONVENTIONS } from './conventions'
import type { Kit } from './conventions'
import { COMPACT, HOME, VAULT, fakeEngine, lastContext, startIn } from './fake'
import { SECTION_BUDGET, folderForCwd, indexSection, wikiRepos } from './wiki'

const home = '/home/ada'
const pages = [
  { folder: 'billing', repos: ['~/code/billing-api'] },
  { folder: 'billing', repos: [] },
  { folder: 'search', repos: ['relative/path'] },
]

test('wikiRepos expands ~ and folderForCwd matches the repository or below', () => {
  const repos = wikiRepos(pages, home)

  expect(repos).toEqual([{ folder: 'billing', repo: '/home/ada/code/billing-api' }])
  expect(folderForCwd('/home/ada/code/billing-api/src', repos)).toBe('billing')
  expect(folderForCwd('/home/ada/code/billing-api2', repos)).toBe(null)
  expect(folderForCwd('/home/ada/code/other', repos)).toBe(null)
})

test('wikiRepos drops a trailing slash and keeps absolute paths', () => {
  const repos = wikiRepos([{ folder: 'billing', repos: ['/srv/billing/', '~'] }], home)

  expect(repos).toEqual([
    { folder: 'billing', repo: '/srv/billing' },
    { folder: 'billing', repo: '/home/ada' },
  ])
  expect(folderForCwd('/srv/billing/', repos)).toBe('billing')
})

const WIKI = `${HOME}/wiki`
const CWD = `${HOME}/code/billing-api/src`
const SECTION_LINES = [
  '## billing',
  '',
  '- [billing/overview.md](billing/overview.md) : Invoices and payments.',
  '- [billing/retries.md](billing/retries.md) : How a failed payment is retried.',
]
const INDEX = [
  '# Index',
  '',
  'Generated, do not edit.',
  '',
  ...SECTION_LINES,
  '',
  '## search',
  '',
  '- [search/overview.md](search/overview.md) : The search service.',
  '',
].join('\n')
const HEADER = `Wiki index for \`billing\` (${WIKI}/index.md). Open a page at ${WIKI}/<path> when you need it.`
const EXPECTED = `${HEADER}\n\n${SECTION_LINES.join('\n')}`
const OVERVIEW = '---\nsummary: Invoices and payments.\nrepos: [~/code/billing-api]\n---\nBody.\n'

const PAGES: Record<string, string> = {
  [`${WIKI}/index.md`]: INDEX,
  [`${WIKI}/billing/overview.md`]: OVERVIEW,
  [`${WIKI}/billing/retries.md`]: '---\nsummary: How a failed payment is retried.\n---\n',
  [`${WIKI}/search/overview.md`]: '---\nsummary: The search service.\nrepos: [~/code/search]\n---\n',
}

const KIT: Kit = {
  ...DEFAULT_CONVENTIONS,
  vault: VAULT,
  language: 'en',
  threshold: 300_000,
  home: HOME,
  isVaultFound: true,
  wiki: WIKI,
  isWikiFound: true,
  problems: [],
}

/** Just the file system the section reads, over a map of absolute path to text. */
function diskOf(files: Record<string, string>): EngineInterface {
  const isDir = (path: string) => Object.keys(files).some(k => k.startsWith(`${path}/`))
  const list = (path: string) => {
    if (!isDir(path)) {
      return Promise.reject(new Error(`ENOENT: ${path}`))
    }
    const names = new Map<string, 'file' | 'dir'>()
    for (const key of Object.keys(files).filter(k => k.startsWith(`${path}/`))) {
      const [name = '', ...rest] = key.slice(path.length + 1).split('/')
      names.set(name, rest.length > 0 ? 'dir' : 'file')
    }

    return Promise.resolve([...names].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })))
  }
  const read = (path: string) => (path in files ? Promise.resolve(files[path]) : Promise.reject(new Error(`ENOENT: ${path}`)))
  const stat = (path: string) => Promise.reject(new Error(`ENOENT: ${path}`))

  return { fs: { list, read, stat } } as unknown as EngineInterface
}

const sectionIn = (files: Record<string, string>, cwd = CWD, kit: Kit = KIT) => indexSection(diskOf(files), kit, cwd)

test('the section of the repository the session is in, under its header', async () => {
  expect(await sectionIn(PAGES)).toBe(EXPECTED)
})

test('null outside a known repository', async () => {
  expect(await sectionIn(PAGES, `${HOME}/code/other`)).toBeNull()
})

test('null without the wiki option or when the wiki is not found', async () => {
  expect(await sectionIn(PAGES, CWD, { ...KIT, wiki: '', isWikiFound: false })).toBeNull()
  expect(await sectionIn(PAGES, CWD, { ...KIT, wiki: `${HOME}/nowhere`, isWikiFound: false })).toBeNull()
})

test('null without index.md, and when the index does not list the folder', async () => {
  const { [`${WIKI}/index.md`]: _index, ...withoutIndex } = PAGES
  expect(await sectionIn(withoutIndex)).toBeNull()
  expect(await sectionIn({ ...PAGES, [`${WIKI}/index.md`]: '# Index\n\n## search\n\n- [s](s) : s\n' })).toBeNull()
})

test('the section stops at the next heading, and may be the last one', async () => {
  const last = '# Index\n\n## search\n\n- [s](s) : s\n\n## billing\n\n- [b](b) : b\n'

  expect(await sectionIn({ ...PAGES, [`${WIKI}/index.md`]: last })).toBe(`${HEADER}\n\n## billing\n\n- [b](b) : b`)
})

test('null when the header and the section go over the budget, the text itself counted', async () => {
  const room = SECTION_BUDGET - HEADER.length - 2
  const index = (size: number) => `# Index\n\n## billing\n${'x'.repeat(size - '## billing\n'.length)}\n`

  expect((await sectionIn({ ...PAGES, [`${WIKI}/index.md`]: index(room) }))?.length).toBe(SECTION_BUDGET)
  expect(await sectionIn({ ...PAGES, [`${WIKI}/index.md`]: index(room + 1) })).toBeNull()
})

test('a page without frontmatter, an unclosed one or an unreadable one claims nothing', async () => {
  const files = {
    [`${WIKI}/index.md`]: INDEX,
    [`${WIKI}/billing/bare.md`]: 'no frontmatter\nrepos: [~/code/billing-api]\n',
    [`${WIKI}/billing/broken.md`]: '---\nsummary: x\nrepos: [~/code/billing-api]\n',
  }
  expect(await sectionIn(files)).toBeNull()

  // A page that cannot be read does not stop the others from being found.
  const disk = diskOf({ ...files, [`${WIKI}/billing/overview.md`]: OVERVIEW })
  const read = disk.fs.read.bind(disk.fs)
  disk.fs.read = (path: string) => (path.endsWith('/broken.md') ? Promise.reject(new Error('EACCES')) : read(path))
  expect(await indexSection(disk, KIT, CWD)).toBe(EXPECTED)
})

test('inbox and raw hold no pages, nor do the files at the root', async () => {
  const claim = '---\nrepos: [~/code/billing-api]\n---\n'
  const files = {
    [`${WIKI}/index.md`]: INDEX,
    [`${WIKI}/AGENTS.md`]: claim,
    [`${WIKI}/inbox/note.md`]: claim,
    [`${WIKI}/raw/source.md`]: claim,
  }

  expect(await sectionIn(files)).toBeNull()
})

test('dot-folders hold no pages, at the root or deeper', async () => {
  const claim = '---\nsummary: s\nrepos: [~/code/billing-api]\n---\n'
  // The index lists the dot-folders, so only the pages' own folder decides.
  const index = { [`${WIKI}/index.md`]: `${INDEX}\n## .git\n- x\n\n## .obsidian\n- x\n` }

  expect(await sectionIn({ ...index, [`${WIKI}/.git/x.md`]: claim })).toBeNull()
  expect(await sectionIn({ ...index, [`${WIKI}/.obsidian/x.md`]: claim })).toBeNull()
  expect(await sectionIn({ ...index, [`${WIKI}/billing/.trash/x.md`]: claim })).toBeNull()
})

test('a page deeper in a folder, or a file that is not markdown', async () => {
  const claim = '---\nsummary: s\nrepos: [~/code/billing-api]\n---\n'

  expect(await sectionIn({ [`${WIKI}/index.md`]: INDEX, [`${WIKI}/billing/deep/api.md`]: claim })).toBe(EXPECTED)
  expect(await sectionIn({ [`${WIKI}/index.md`]: INDEX, [`${WIKI}/billing/api.txt`]: claim })).toBeNull()
})

// The first message of a session, through the hooks.
const OPTIONS = { options: { vault: VAULT, wiki: '~/wiki' } }
const NOTES = { [`${VAULT}/Inbox/a.md`]: 'x', ...PAGES }
const isRules = (c: string) => c.startsWith('pyxis: ')
const isSection = (c: string) => c.startsWith('Wiki index for ')

test('the first message gets the rules block, then the section; the second nothing', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(CWD))
  await $.prompt.submit({ text: 'one' })
  await $.prompt.submit({ text: 'two' })

  const first = fake.prompts[0]?.context ?? []
  expect(first.findIndex(isRules)).toBe(0)
  expect(first.findIndex(isSection)).toBe(1)
  expect(first[1]).toBe(EXPECTED)
  expect(fake.prompts[1]?.context).toEqual([])
})

test('after a compaction the first message gets the section again', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(CWD))
  await $.prompt.submit({ text: 'one' })
  await $.session.compact(COMPACT)
  await $.prompt.submit({ text: 'two' })

  expect(fake.prompts.map(p => p.context.filter(isSection).length)).toEqual([1, 1])
})

test('a session outside the wiki’s repositories gets no section', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(`${HOME}/code/other`))
  await $.prompt.submit({ text: 'one' })

  expect(fake.prompts[0]?.context.some(isSection)).toBe(false)
  expect(fake.prompts[0]?.context.some(isRules)).toBe(true)
})

test('without the wiki option, no section and no reading of the wiki', { options: { vault: VAULT } }, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(CWD))
  await $.prompt.submit({ text: 'one' })

  expect(fake.prompts[0]?.context.some(isSection)).toBe(false)
  expect(lastContext(fake)).not.toContain('Wiki index')
})

test('a wiki option that points nowhere: no section, the rules block still goes', { options: { vault: VAULT, wiki: '~/nowhere' } }, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(CWD))
  await $.prompt.submit({ text: 'one' })

  expect(fake.prompts[0]?.context.some(isSection)).toBe(false)
  expect(fake.prompts[0]?.context.some(isRules)).toBe(true)
})

test('a missing index.md never blocks the message: no section, the rules block goes', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  fake.files.delete(`${WIKI}/index.md`)
  await $.session.start(startIn(CWD))
  await $.prompt.submit({ text: 'one' })

  expect(fake.prompts[0]?.context.some(isSection)).toBe(false)
  expect(fake.prompts[0]?.context.some(isRules)).toBe(true)
})
