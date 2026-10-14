import { expect, test } from 'claude-code/testing'

import { DEFAULT_CONVENTIONS, parseConventions, settings } from './conventions'
import { HOME, VAULT, fakeEngine, startIn } from './fake'

const OPTIONS = { options: { vault: VAULT } }

test('settings: the vault as given, a bad threshold and an unknown language fall back', () => {
  expect(settings({ vault: '~/vault', threshold: 200_000, language: 'fr' })).toEqual({ vault: '~/vault', threshold: 200_000, language: 'fr' })
  expect(settings({ vault: VAULT, threshold: 300 }).threshold).toBe(300_000)
  expect(settings({ vault: VAULT, threshold: Number.NaN }).threshold).toBe(300_000)
  expect(settings({ vault: VAULT, language: 'de' }).language).toBe('en')
})

test('conventions: no file, the defaults; each key over its default', () => {
  expect(parseConventions(null)).toEqual({ conventions: DEFAULT_CONVENTIONS, problems: [] })

  const { conventions, problems } = parseConventions(
    JSON.stringify({ passations: { outsideRepo: 'hors-depot', resumed: 'reprises' }, folders: { daily: null, inbox: 'A-trier/' } }),
  )
  expect(problems).toEqual([])
  expect(conventions.passations).toEqual({ folder: 'AI/passations', outsideRepo: 'hors-depot', resumed: 'reprises' })
  expect(conventions.folders.daily).toBeNull()
  expect(conventions.folders.inbox).toBe('A-trier')
  expect(conventions.folders.hubs).toBe('Projects')
  expect(conventions.verifyTag).toBe('#todo/verify')
})

test('conventions: unreadable JSON, wrong types and unknown keys keep the defaults and are named', () => {
  expect(parseConventions('{ "folders": ').problems).toEqual(['JSON'])
  expect(parseConventions('[]').problems).toEqual(['JSON'])

  const { conventions, problems } = parseConventions(
    JSON.stringify({
      floders: {},
      folders: { inbox: 3, hubs: '/abs/Projects', archive: '../Archive', templates: '', daily: 'Journal', extra: 'x' },
      passations: { outsideRepo: 'a/b', resumed: '..' },
      verifyTag: 'two words',
    }),
  )
  expect(problems.sort()).toEqual(
    [
      'floders',
      'folders.archive',
      'folders.extra',
      'folders.hubs',
      'folders.inbox',
      'folders.templates',
      'passations.outsideRepo',
      'passations.resumed',
      'verifyTag',
    ].sort(),
  )
  expect(conventions.folders).toEqual({ ...DEFAULT_CONVENTIONS.folders, daily: 'Journal' })
  expect(conventions.passations).toEqual(DEFAULT_CONVENTIONS.passations)
  expect(conventions.verifyTag).toBe('#todo/verify')
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
