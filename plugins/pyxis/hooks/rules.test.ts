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

test('the block: vault, folders, hub rule, passation; the working rules in the vault only', () => {
  const outside = rulesBlock(KIT, false, 'S1', '/plugins/pyxis')
  expect(outside).toContain(`Obsidian vault \`${VAULT}\`. Session id: \`S1\`.`)
  expect(outside).toContain('hubs `Projects`')
  expect(outside).toContain('`Projects` is the source of truth')
  expect(outside).toContain('`Archive` may inform your questions, never your answers')
  expect(outside).toContain('`/plugins/pyxis/skills/passation/SKILL.md`')
  expect(outside).not.toContain('Working rules')
  expect(outside).toContain("the vault's CLAUDE.md")

  const inside = rulesBlock(KIT, true, 'S1', '/plugins/pyxis')
  expect(inside).toContain('1. Search before you write')
  expect(inside).toContain('3. Never delete a note: move it to `Archive`')
  expect(inside).toContain('5. Flag, don\'t guess: write `#todo/verify`')
  expect(inside).toContain('6. One change at a time')
})

test('folders turned off leave their sentences out', () => {
  const kit: Kit = {
    ...KIT,
    folders: { ...KIT.folders, hubs: null, archive: null, daily: null },
    passations: { ...KIT.passations, folder: null },
    verifyTag: null,
  }
  const block = rulesBlock(kit, true, 'S1', '/p')
  expect(block).not.toContain('daily `')
  expect(block).not.toContain('Each project has a hub')
  expect(block).not.toContain('Passation (handoff)')
  expect(block).toContain('3. Never delete a note: ask.')
  expect(block).toContain("5. Flag, don't guess: say what you are unsure of")
})

test('size of the block, in characters (about 4 per token)', () => {
  const outside = rulesBlock(KIT, false, 'c5b3a9e2-0000-4000-8000-000000000000', `${HOME}/Projects/pyxis/plugins/pyxis`)
  const inside = rulesBlock(KIT, true, 'c5b3a9e2-0000-4000-8000-000000000000', `${HOME}/Projects/pyxis/plugins/pyxis`)
  console.log(`rules block: ${outside.length} characters outside the vault, ${inside.length} in it`)
  expect(outside.length).toBeLessThan(2000)
  expect(inside.length).toBeLessThan(2800)
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
  expect(fake.prompts[0]?.context[0]).toContain('Working rules in this vault')
})

test('outside the vault: the block without the working rules', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/Inbox/a.md`]: 'x' })
  await $.session.start(startIn(`${HOME}/code`))
  await $.prompt.submit({ text: 'one' })
  expect(fake.prompts[0]?.context[0]).not.toContain('Working rules')
})

test('folders absent from disk: the block says nothing of them', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/Inbox/a.md`]: 'x' })
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: 'one' })

  const block = fake.prompts[0]?.context[0] ?? ''
  expect(block).toContain('inbox `Inbox`')
  for (const absent of ['hubs `Projects`', 'archive `Archive`', 'daily `Daily`', 'templates `Templates`']) {
    expect(block).not.toContain(absent)
  }
  expect(block).not.toContain('Each project has a hub')
  expect(block).not.toContain('may inform your questions')
  expect(block).toContain('3. Never delete a note: ask.')
})

test('/pyxis:passations or /pyxis:vault typed first: the block waits for the next message', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/Inbox/a.md`]: 'x' })
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: '/pyxis:passations' })
  await $.prompt.submit({ text: '/pyxis:vault' })
  await $.prompt.submit({ text: 'bonjour' })

  const blocks = fake.prompts.map(p => p.context.filter(c => c.startsWith('pyxis: ')).length)
  expect(blocks).toEqual([0, 0, 1])
})
