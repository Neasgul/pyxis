import { expect, test } from 'claude-code/testing'

import { DEFAULT_CONVENTIONS } from './conventions'
import type { Kit } from './conventions'
import { COMPACT, HOME, VAULT, fakeEngine, startIn } from './fake'
import { rulesBlock } from './rules'

const OPTIONS = { options: { vault: VAULT } }

const KIT: Kit = {
  ...DEFAULT_CONVENTIONS,
  vault: VAULT,
  language: 'en',
  threshold: 300_000,
  home: HOME,
  isVaultFound: true,
  problems: [],
}

test('the block: folders and passation, no hub, no working rule', () => {
  const block = rulesBlock(KIT, 'S1', '/plugins/pyxis')
  expect(block).toContain(`pyxis: notes folder \`${VAULT}\`. Session id: \`S1\`.`)
  expect(block).toContain('Folders, relative to it: templates `Templates`, sessions `AI/sessions`, logs `AI/logs`, passations `AI/passations` (outside a repository: `no-repo`, resumed: `resumed`).')
  expect(block).toContain('`/plugins/pyxis/skills/passation/SKILL.md`')
  for (const gone of ['hub', 'Hub', 'Search before you write', 'Never delete a note', 'CLAUDE.md', 'Obsidian', 'Archive']) {
    expect(block).not.toContain(gone)
  }
})

test('folders turned off leave their sentences out', () => {
  const kit: Kit = {
    ...KIT,
    folders: { ...KIT.folders, templates: null },
    passations: { ...KIT.passations, folder: null },
  }
  const block = rulesBlock(kit, 'S1', '/p')
  expect(block).not.toContain('templates `')
  expect(block).not.toContain('Passation (handoff)')
  expect(block).toContain('sessions `AI/sessions`')
})

test('size of the block, in characters (about 4 per token)', () => {
  const block = rulesBlock(KIT, 'c5b3a9e2-0000-4000-8000-000000000000', `${HOME}/Projects/pyxis/plugins/pyxis`)
  console.log(`rules block: ${block.length} characters`)
  expect(block.length).toBeLessThan(700)
})

test('the block goes with the first message only, and again after a compaction', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/Inbox/a.md`]: 'x' })
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: 'one' })
  await $.prompt.submit({ text: 'two' })
  await $.session.compact(COMPACT)
  await $.prompt.submit({ text: 'three' })

  const blocks = fake.prompts.map(p => p.context.filter(c => c.startsWith('pyxis: ')).length)
  expect(blocks).toEqual([1, 0, 1])
  expect(fake.prompts[0]?.context[0]).toContain('Passation (handoff)')
})

// Where an organisation manages Claude Code, `session.compact` does not reach a user plugin:
// the transcript growing shorter tells the compaction instead.
test('the transcript shrinks without a compaction event: the block goes again', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/Inbox/a.md`]: 'x' })
  await $.session.start(startIn(VAULT))
  fake.transcript = 40
  await $.prompt.submit({ text: 'one' })
  fake.transcript = 42
  await $.prompt.submit({ text: 'two' })
  fake.transcript = 2
  await $.prompt.submit({ text: 'three' })
  fake.transcript = 4
  await $.prompt.submit({ text: 'four' })

  const blocks = fake.prompts.map(p => p.context.filter(c => c.startsWith('pyxis: ')).length)
  expect(blocks).toEqual([1, 0, 1, 0])
})

test('outside the vault: the same block', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/Templates/`]: '' })
  await $.session.start(startIn(`${HOME}/code`))
  await $.prompt.submit({ text: 'one' })

  expect(fake.prompts[0]?.context[0]).toContain(`pyxis: notes folder \`${VAULT}\`.`)
  expect(fake.prompts[0]?.context[0]).toContain('templates `Templates`')
})

test('folders absent from disk: the block says nothing of them', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/AI/`]: '' })
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: 'one' })

  const block = fake.prompts[0]?.context[0] ?? ''
  expect(block).not.toContain('templates `Templates`')
  expect(block).toContain('sessions `AI/sessions`')
})

test('/pyxis:passations typed first: the block waits for the next message', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/Inbox/a.md`]: 'x' })
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: '/pyxis:passations' })
  await $.prompt.submit({ text: 'bonjour' })

  const blocks = fake.prompts.map(p => p.context.filter(c => c.startsWith('pyxis: ')).length)
  expect(blocks).toEqual([0, 1])
})

test('/pyxis:vault typed after the update: the block goes with it like any message, no pane opens', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/Inbox/a.md`]: 'x' })
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: '/pyxis:vault' })

  const blocks = fake.prompts.map(p => p.context.filter(c => c.startsWith('pyxis: ')).length)
  expect(blocks).toEqual([1])
  expect(fake.panes).toEqual([])
})
