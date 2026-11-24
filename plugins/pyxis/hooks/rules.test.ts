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
  wiki: '',
  isWikiFound: false,
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

const WIKI = '/Users/someone/notes/wiki'
const WIKI_RULE = `Wiki: \`${WIKI}\` (its contract: \`${WIKI}/AGENTS.md\`). A wiki page injected into the conversation counts as read. If the wiki says nothing on a point, say so rather than filling the gap. When this session settles a durable fact within the wiki's subject (as its AGENTS.md defines it), write it to \`${WIKI}/inbox/YYYY-MM-DD-<subject>.md\` in the format AGENTS.md gives, with the page you propose as \`target:\` and what lets someone check the fact, and tell the user in one line. Never edit a wiki page on your own: nothing enters a page without the user's agreement. Inbox notes are not validated: never cite them as true.`

test('a wiki found: the rule is the last line of the block, with the wiki path', () => {
  const kit: Kit = { ...KIT, wiki: WIKI, isWikiFound: true }
  const block = rulesBlock(kit, 'S1', '/plugins/pyxis')
  expect(block.endsWith(`\n${WIKI_RULE}`)).toBe(true)
  expect(block).not.toContain('<wiki>')
})

test('a wiki found with passation: the rule comes after the passation line', () => {
  const kit: Kit = { ...KIT, wiki: WIKI, isWikiFound: true }
  const lines = rulesBlock(kit, 'S1', '/p').split('\n')
  expect(lines[lines.length - 1]).toBe(WIKI_RULE)
  expect(lines[lines.length - 2]).toContain('Passation (handoff)')
})

test('a wiki set but not found: the block is the same as without a wiki', () => {
  const kit: Kit = { ...KIT, wiki: WIKI, isWikiFound: false }
  expect(rulesBlock(kit, 'S1', '/p')).toBe(rulesBlock(KIT, 'S1', '/p'))
  expect(rulesBlock(kit, 'S1', '/p')).not.toContain('Wiki:')
})
