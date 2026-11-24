import { afterAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderIndex } from './index'
import { initWiki } from './init'

const roots: string[] = []
afterAll(() => Promise.all(roots.map(root => rm(root, { recursive: true, force: true }))))

async function emptyDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pyxis-init-'))
  roots.push(root)

  return root
}

const template = (language: 'en' | 'fr') => Bun.file(join(import.meta.dir, 'templates', `AGENTS.${language}.md`)).text()

async function run(...args: string[]) {
  const proc = Bun.spawn(['bun', join(import.meta.dir, 'init.ts'), ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])

  return { code: await proc.exited, out, err }
}

test('an empty folder gets the whole skeleton, with the template of the language', async () => {
  const dir = await emptyDir()

  const created = await initWiki(dir, 'fr')

  expect(created.sort()).toEqual(['AGENTS.md', 'inbox/.gitkeep', 'index.md', 'log.md', 'raw/.gitkeep'])
  expect(await Bun.file(join(dir, 'AGENTS.md')).text()).toBe(await template('fr'))
  expect(await Bun.file(join(dir, 'index.md')).text()).toBe(renderIndex([]))
  expect(await Bun.file(join(dir, 'log.md')).text()).toStartWith('# Log')
  expect(await Bun.file(join(dir, 'inbox/.gitkeep')).exists()).toBe(true)
  expect(await Bun.file(join(dir, 'raw/.gitkeep')).exists()).toBe(true)
})

test('the English template is used for en', async () => {
  const dir = await emptyDir()

  await initWiki(dir, 'en')

  expect(await Bun.file(join(dir, 'AGENTS.md')).text()).toBe(await template('en'))
})

test('a folder missing from the path is created', async () => {
  const dir = join(await emptyDir(), 'nested', 'wiki')

  expect(await initWiki(dir, 'en')).toContain('AGENTS.md')
  expect(await Bun.file(join(dir, 'index.md')).exists()).toBe(true)
})

test('an existing AGENTS.md is left byte for byte, and only the missing files are created', async () => {
  const dir = await emptyDir()
  const edited = '# My wiki\n\nEdited by hand.\n'
  await Bun.write(join(dir, 'AGENTS.md'), edited)
  await mkdir(join(dir, 'raw'))
  await Bun.write(join(dir, 'raw/.gitkeep'), '')

  const created = await initWiki(dir, 'en')

  expect(created.sort()).toEqual(['inbox/.gitkeep', 'index.md', 'log.md'])
  expect(await Bun.file(join(dir, 'AGENTS.md')).text()).toBe(edited)
})

test('a second call creates nothing', async () => {
  const dir = await emptyDir()
  await initWiki(dir, 'en')

  expect(await initWiki(dir, 'en')).toEqual([])
})

test('the templates have the same sections and carry the language line', async () => {
  const headings = (text: string) => text.split('\n').filter(line => line.startsWith('#') && !line.startsWith('# '))
  const en = await template('en')
  const fr = await template('fr')

  expect(headings(en).length).toBeGreaterThan(0)
  expect(headings(fr).length).toBe(headings(en).length)
  expect(en).toContain('Pages are written in: English.')
  expect(fr).toContain('Les pages sont écrites en : français.')
  expect(en).not.toContain('keeps the language of its source')
  expect(fr).not.toContain('garde la langue de sa source')
  expect(en).toContain('## Folders')
  expect(en).toContain('/pyxis:ingest')
  expect(fr).toContain('/pyxis:lint')
  expect(fr).toContain('/pyxis:graph')
})

test('the command prints one line per created file', async () => {
  const dir = await emptyDir()

  const { code, out } = await run(dir, 'en')

  expect(code).toBe(0)
  expect(out.trim().split('\n').sort()).toEqual(['AGENTS.md', 'inbox/.gitkeep', 'index.md', 'log.md', 'raw/.gitkeep'])
})

test('the command without a folder, or with another language, prints a usage and exits 2', async () => {
  for (const args of [[], ['somewhere'], ['somewhere', 'de']]) {
    const { code, err } = await run(...args)

    expect(code).toBe(2)
    expect(err).toContain('usage:')
  }
})
