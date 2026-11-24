import { expect, test } from 'claude-code/testing'

import { HOME, VAULT, fakeEngine, startIn } from './fake'

import { inboxLabel } from './inbox'

const WIKI = `${HOME}/wiki`
const INBOX = `${WIKI}/inbox`
const OPTIONS = { options: { vault: VAULT, wiki: WIKI } }

// The vault exists: a toast would then be the inbox's own.
const VAULT_DIR = { [`${VAULT}/AI/`]: '' }

// The count is refreshed without the tool's result waiting for it: let it finish.
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0))

const NOTES = {
  ...VAULT_DIR,
  [`${WIKI}/index.md`]: '# Index\n',
  [`${INBOX}/.gitkeep`]: '',
  [`${INBOX}/2026-11-20-deploy.md`]: 'a',
  [`${INBOX}/2026-11-21-gotcha.md`]: 'b',
}

test('shows the count, hides an empty or unknown inbox', () => {
  expect(inboxLabel(4)).toBe('inbox 4')
  expect(inboxLabel(0)).toBeUndefined()
  expect(inboxLabel(undefined)).toBeUndefined()
})

test('the status counts the .md notes of the inbox after session.start', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(VAULT))

  expect(fake.statuses).toEqual(['inbox 2'])
  expect(fake.toasts).toEqual([])
})

test('a Write that adds a note updates the count', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  on('tool.call', (_$, e) => {
    fake.files.set(`${INBOX}/2026-11-22-new.md`, { text: 'c', mtimeMs: 0 })
    return { result: {} }
  })
  await $.session.start(startIn(VAULT))
  await $.tool.call({ tool: 'Write', file_path: `${INBOX}/2026-11-22-new.md`, content: 'c' })
  await settle()

  expect(fake.statuses.at(-1)).toBe('inbox 3')
})

test('a tool other than Write, Edit and Bash does not refresh', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  on('tool.call', () => ({ result: {} }))
  await $.session.start(startIn(VAULT))
  fake.files.set(`${INBOX}/2026-11-22-new.md`, { text: 'c', mtimeMs: 0 })
  await $.tool.call({ tool: 'Read', file_path: `${INBOX}/x.md` })

  expect(fake.statuses).toEqual(['inbox 2'])
})

test('without the wiki option a tool call touches no status', { options: { vault: VAULT } }, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  on('tool.call', () => ({ result: {} }))
  await $.session.start(startIn(VAULT))
  await $.tool.call({ tool: 'Write', file_path: `${INBOX}/2026-11-22-new.md`, content: 'c' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await settle()

  expect(fake.statuses).toEqual([])
  expect(fake.toasts).toEqual([])
})

test('the count is refreshed every 30 seconds', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(VAULT))
  fake.files.set(`${INBOX}/2026-11-22-new.md`, { text: 'c', mtimeMs: 0 })

  await fake.clock.advance(29_000)
  expect(fake.statuses).toEqual(['inbox 2'])
  await fake.clock.advance(1_000)
  expect(fake.statuses.at(-1)).toBe('inbox 3')
})

test('the status is set again when the desktop app attaches', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(VAULT))
  await $.session.attach({ surface: 'terminal', clientId: 'C2' })

  expect(fake.statuses).toEqual(['inbox 2', 'inbox 2'])
})

test('an emptied inbox clears the status it showed', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(VAULT))
  fake.files.delete(`${INBOX}/2026-11-20-deploy.md`)
  fake.files.delete(`${INBOX}/2026-11-21-gotcha.md`)
  await fake.clock.advance(30_000)

  expect(fake.statuses).toEqual(['inbox 2', undefined])
})

test('no inbox: no status, no toast', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { ...VAULT_DIR, [`${WIKI}/index.md`]: '# Index\n' })
  await $.session.start(startIn(VAULT))
  await $.session.attach({ surface: 'terminal', clientId: 'C2' })
  await fake.clock.advance(60_000)

  expect(fake.statuses).toEqual([])
  expect(fake.toasts).toEqual([])
})

test('an empty inbox: no status', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { ...VAULT_DIR, [`${WIKI}/index.md`]: '# Index\n', [`${INBOX}/.gitkeep`]: '' })
  await $.session.start(startIn(VAULT))

  expect(fake.statuses).toEqual([])
})

test('without the wiki option: no status, no toast, no timer', { options: { vault: VAULT } }, async ($, on) => {
  const fake = fakeEngine(on, { ...NOTES, [`${HOME}/inbox/a.md`]: 'x' })
  await $.session.start(startIn(VAULT))
  await $.session.attach({ surface: 'terminal', clientId: 'C2' })
  await fake.clock.advance(60_000)

  expect(fake.statuses).toEqual([])
  expect(fake.toasts).toEqual([])
})

test('a second session.start does not stack timers', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(VAULT))
  await $.session.start(startIn(VAULT))
  expect(fake.statuses).toEqual(['inbox 2', 'inbox 2'])

  await fake.clock.advance(30_000)
  expect(fake.statuses).toEqual(['inbox 2', 'inbox 2', 'inbox 2'])
})
