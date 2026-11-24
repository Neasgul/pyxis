import type { EngineInterface } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { DEFAULT_CONVENTIONS, loadKit, parseConventions, settings } from './conventions'
import { HOME, VAULT, fakeEngine, startIn } from './fake'

const OPTIONS = { options: { vault: VAULT } }

test('settings: the vault as given, a bad threshold and an unknown language fall back', () => {
  expect(settings({ vault: '~/vault', threshold: 200_000, language: 'fr' })).toEqual({ vault: '~/vault', wiki: '', threshold: 200_000, language: 'fr' })
  expect(settings({ vault: VAULT, threshold: 300 }).threshold).toBe(300_000)
  expect(settings({ vault: VAULT, threshold: Number.NaN }).threshold).toBe(300_000)
  expect(settings({ vault: VAULT, language: 'de' }).language).toBe('en')
})

test('settings: the wiki as given, empty when absent or not a string', () => {
  expect(settings({ vault: VAULT, wiki: '~/notes/wiki' }).wiki).toBe('~/notes/wiki')
  expect(settings({ vault: VAULT }).wiki).toBe('')
  expect(settings({ vault: VAULT, wiki: 3 }).wiki).toBe('')
})

test('conventions: no file, the defaults; each key over its default', () => {
  expect(parseConventions(null)).toEqual({ conventions: DEFAULT_CONVENTIONS, problems: [] })

  const { conventions, problems } = parseConventions(
    JSON.stringify({ passations: { outsideRepo: 'hors-depot', resumed: 'reprises' }, folders: { templates: null, sessions: 'IA/sessions/' } }),
  )
  expect(problems).toEqual([])
  expect(conventions.passations).toEqual({ folder: 'AI/passations', outsideRepo: 'hors-depot', resumed: 'reprises' })
  expect(conventions.folders).toEqual({ templates: null, sessions: 'IA/sessions', logs: 'AI/logs' })
})

test('conventions: unreadable JSON, wrong types and unknown keys keep the defaults and are named', () => {
  expect(parseConventions('{ "folders": ').problems).toEqual(['JSON'])
  expect(parseConventions('[]').problems).toEqual(['JSON'])

  const { conventions, problems } = parseConventions(
    JSON.stringify({
      floders: {},
      folders: { sessions: 3, logs: '/abs/logs', templates: '../T', extra: 'x' },
      passations: { outsideRepo: 'a/b', resumed: '..' },
    }),
  )
  expect(problems.sort()).toEqual(
    ['floders', 'folders.extra', 'folders.logs', 'folders.sessions', 'folders.templates', 'passations.outsideRepo', 'passations.resumed'].sort(),
  )
  expect(conventions).toEqual(DEFAULT_CONVENTIONS)
})

test('conventions: keys removed in 0.3.0 are named once and ignored', () => {
  const { conventions, problems } = parseConventions('{"folders":{"hubs":"Projects","daily":"Daily"},"verifyTag":"#x"}')
  expect(problems).toEqual(['verifyTag', 'folders.hubs', 'folders.daily'])
  expect(conventions).toEqual(DEFAULT_CONVENTIONS)
})

test('a vault of 0.2.0 with removed keys: one toast, one log line each, the rest works', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, {
    [`${VAULT}/.claude/pyxis.json`]: '{"folders":{"hubs":"Projects","inbox":"Inbox"},"verifyTag":"#x"}',
    [`${VAULT}/AI/passations/no-repo/a.md`]: '---\nstatus: active\ndescription: a\n---\n',
  })
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: 'hello' })
  await $.prompt.submit({ text: 'again' })

  expect(fake.toasts).toHaveLength(1)
  for (const key of ['verifyTag', 'folders.hubs', 'folders.inbox']) {
    expect(fake.toasts[0]).toContain(`${key} ignored`)
  }
  const log = fake.files.get(`${VAULT}/AI/logs/pyxis-errors.log`)?.text ?? ''
  expect(log.trim().split('\n')).toHaveLength(3)
  expect(fake.prompts[0]?.context.join('\n')).toContain('no-repo/a.md')
})

test('vault not found: one toast naming where to set the option, nothing else', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, {})
  await $.session.start(startIn(HOME))
  await $.prompt.submit({ text: 'hello' })
  await $.prompt.submit({ text: 'again' })

  expect(fake.toasts).toHaveLength(1)
  expect(fake.toasts[0]).toContain(`vault folder not found (${VAULT})`)
  expect(fake.toasts[0]).toContain('claude plugin configure pyxis@pyxis')
  expect(fake.prompts.every(p => p.context.length === 0)).toBe(true)
})

test('vault option with ~: expanded against HOME', { options: { vault: '~/vault/' } }, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/Inbox/note.md`]: 'x' })
  await $.session.start(startIn(HOME))

  expect(fake.toasts).toEqual([])
})

test('a missing vault given with ~: the commands name the expanded path', { options: { vault: '~/nowhere/' } }, async ($, on) => {
  fakeEngine(on, {})
  await $.session.start(startIn(HOME))
  for (const command of ['pyxis:passations']) {
    const answer = await $.command.run({ command })
    expect(answer).toEqual({ text: expect.stringContaining(`(${HOME}/nowhere)`) })
  }
})

test('the error log stamps its lines in UTC, with a Z', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/.claude/pyxis.json`]: '{ "folders": { "inbox": 3 } }' })
  await $.session.start(startIn(VAULT))
  expect(fake.files.get(`${VAULT}/AI/logs/pyxis-errors.log`)?.text).toMatch(/^2026-10-13T10:00:00Z\t/)
})

test('a conventions problem: one toast, one line in the error log, defaults used', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/.claude/pyxis.json`]: '{ "folders": { "inbox": 3 } }' })
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: 'hello' })

  expect(fake.toasts).toEqual(['pyxis: .claude/pyxis.json: folders.inbox ignored, default used.'])
  const log = fake.files.get(`${VAULT}/AI/logs/pyxis-errors.log`)?.text ?? ''
  expect(log.trim().split('\n')).toHaveLength(1)
  expect(log).toContain('folders.inbox ignored')
})

test('French: the toasts too', { options: { vault: VAULT, language: 'fr' } }, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/.claude/pyxis.json`]: 'not json' })
  await $.session.start(startIn(VAULT))

  expect(fake.toasts).toEqual(['pyxis : .claude/pyxis.json : JSON ignoré, valeur par défaut.'])
})

test('several problems: one toast, one log line each', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/.claude/pyxis.json`]: '{ "floders": {}, "folders": { "inbox": 3 } }' })
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: 'hello' })

  expect(fake.toasts).toHaveLength(1)
  expect(fake.toasts[0]).toContain('floders ignored')
  expect(fake.toasts[0]).toContain('folders.inbox ignored')
  const log = fake.files.get(`${VAULT}/AI/logs/pyxis-errors.log`)?.text ?? ''
  expect(log.trim().split('\n')).toHaveLength(2)
})

test('the desktop app: a problem found before it attaches is shown once it does', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, {})
  await $.session.start({ cwd: HOME, surface: null, isInteractive: false })
  expect(fake.toasts).toEqual([])

  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await $.prompt.submit({ text: 'hello' })
  expect(fake.toasts).toHaveLength(1)
  expect(fake.toasts[0]).toContain(`vault folder not found (${VAULT})`)
})

const WIKI = `${HOME}/notes/wiki`

/** Just what `loadKit` asks of the engine: HOME, stat and read over a set of files and folders. */
const stubEngine = (files: Record<string, string>) => {
  const isDir = (path: string) => Object.keys(files).some(k => k.startsWith(`${path}/`))

  return {
    env: { get: async (name: string) => (name === 'HOME' ? HOME : undefined) },
    fs: {
      stat: async (path: string) =>
        path in files ? { kind: 'file', size: 0, mtimeMs: 0 } : isDir(path) ? { kind: 'dir', size: 0, mtimeMs: 0 } : Promise.reject(new Error('ENOENT')),
      read: async (path: string) => files[path] ?? Promise.reject(new Error('ENOENT')),
    },
  } as unknown as EngineInterface
}

const kitOf = (files: Record<string, string>, options: Record<string, unknown>) => loadKit(stubEngine(files), settings(options))

test('no wiki option: no wiki, no problem', async () => {
  const kit = await kitOf({ [`${VAULT}/.claude/pyxis.json`]: '{}' }, { vault: VAULT })

  expect(kit.wiki).toBe('')
  expect(kit.isWikiFound).toBe(false)
  expect(kit.problems).toEqual([])
})

test('wiki option with ~ and a trailing slash: expanded, found', async () => {
  const kit = await kitOf({ [`${VAULT}/.claude/pyxis.json`]: '{}', [`${WIKI}/index.md`]: 'x' }, { vault: VAULT, wiki: '~/notes/wiki/' })

  expect(kit.wiki).toBe(WIKI)
  expect(kit.isWikiFound).toBe(true)
  expect(kit.problems).toEqual([])
})

test('a wiki that is missing: reported once, the vault keeps working', { options: { vault: VAULT, wiki: '~/notes/wiki/' } }, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/AI/passations/no-repo/a.md`]: '---\nstatus: active\ndescription: a\n---\n' })
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: 'hello' })
  await $.prompt.submit({ text: 'again' })

  expect(fake.toasts).toHaveLength(1)
  expect(fake.toasts[0]).toBe(
    `pyxis: wiki folder not found (${WIKI}). Set the wiki option in /config, or with \`claude plugin configure pyxis@pyxis\`.`,
  )
  expect(fake.prompts[0]?.context.join('\n')).toContain('no-repo/a.md')
  const log = fake.files.get(`${VAULT}/AI/logs/pyxis-errors.log`)?.text ?? ''
  expect(log.trim().split('\n')).toHaveLength(1)
  expect(log).toContain('wiki folder not found')
})

test('a wiki that is missing: the kit keeps its path, the vault is found', async () => {
  const kit = await kitOf({ [`${VAULT}/.claude/pyxis.json`]: '{}' }, { vault: VAULT, wiki: '~/notes/wiki/' })

  expect(kit.wiki).toBe(WIKI)
  expect(kit.isWikiFound).toBe(false)
  expect(kit.isVaultFound).toBe(true)
  expect(kit.problems).toEqual([expect.stringContaining(`wiki folder not found (${WIKI})`)])
})

test('a missing wiki next to a missing vault: both told', { options: { vault: VAULT, wiki: '~/notes/wiki' } }, async ($, on) => {
  const fake = fakeEngine(on, {})
  await $.session.start(startIn(HOME))
  await $.prompt.submit({ text: 'hello' })

  expect(fake.toasts).toHaveLength(1)
  expect(fake.toasts[0]).toContain(`vault folder not found (${VAULT})`)
  expect(fake.toasts[0]).toContain(`wiki folder not found (${WIKI})`)
})

test('French: the missing wiki toast', { options: { vault: VAULT, wiki: '~/notes/wiki', language: 'fr' } }, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/.claude/pyxis.json`]: '{}' })
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: 'hello' })

  expect(fake.toasts).toEqual([
    `pyxis : dossier du wiki introuvable (${WIKI}). Réglez l'option wiki dans /config, ou par \`claude plugin configure pyxis@pyxis\`.`,
  ])
})
