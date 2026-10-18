// The facts block that goes with each `/pyxis:<skill>` message.
import { expect, test } from 'claude-code/testing'

import { HOME, VAULT, fakeEngine, lastContext, startIn } from './fake'
import type { Notes } from './fake'
import { factsBlock, skillOf } from './skills'
import type { SkillFacts } from './skills'

const OPTIONS = { options: { vault: VAULT } }
const V = VAULT
const NOTES: Notes = {
  [`${V}/Inbox/old-idea.md`]: ['---\ncreated: 2026-10-04\n---\nan old idea', 9],
  [`${V}/Inbox/new-idea.md`]: ['---\ncreated: 2026-10-12\n---\na new idea', 1],
  [`${V}/Projects/Parcels/parcels.md`]: '---\ntags: [project/parcels]\nrepos:\n  - ~/code/parcels\n---\n- [ ] ship it 📅 2026-10-10\n',
  [`${V}/Daily/2026-10-12.md`]: '- [ ] call otter\n',
  [`${V}/Daily/2026-10-13.md`]: '## Today\n',
  [`${V}/AI/sessions/2026-10-12-before.md`]: 'x',
  [`${V}/AI/sessions/2026-10-13-today.md`]: 'x',
  [`${V}/AI/logs/pyxis-errors.log`]: '2026-10-13T09:00\thubs\tbad repos\n',
  [`${V}/AI/passations/parcels/`]: '',
  [`${V}/Templates/daily.md`]: '## Today\n',
  [`${V}/Archive/`]: '',
}
const GIT = { [`${HOME}/code/parcels`]: { branch: 'main', changes: 2 } }

const FACTS: SkillFacts = {
  skill: 'daily',
  vault: V,
  today: '2026-10-13',
  weekday: 'Tuesday',
  sessionId: 'S1',
  folders: [
    { role: 'inbox', path: 'Inbox' },
    { role: 'hubs', path: 'Projects' },
    { role: 'archive', path: 'Archive' },
    { role: 'daily', path: 'Daily' },
    { role: 'templates', path: 'Templates' },
    { role: 'sessions', path: 'AI/sessions' },
    { role: 'logs', path: 'AI/logs' },
    { role: 'passations', path: 'AI/passations' },
  ],
  template: { path: 'Templates/daily.md', isPresent: true },
  missing: [],
  lists: [{ title: 'Previous daily note', lines: ['`Daily/2026-10-12.md`'] }],
}

/** What the facts block says, without the start block that goes with a session's first message. */
const facts = (fake: Parameters<typeof lastContext>[0]) => lastContext(fake).slice(lastContext(fake).indexOf('pyxis, for'))

test('skillOf: a real pyxis skill at the start of the message, nothing that looks like one', () => {
  expect(skillOf('/pyxis:capture une idée')).toBe('capture')
  expect(skillOf('  /pyxis:daily')).toBe('daily')
  expect(skillOf('/pyxis:passation')).toBe('passation')
  for (const message of ['/pyxis:passations', '/pyxis:vault', '/pyxis:hubs', 'pyxis:capture', '/capture', 'parle-moi de /pyxis:capture']) {
    expect(skillOf(message)).toBeNull()
  }
})

test('factsBlock: the text the skills rely on', () => {
  expect(factsBlock(FACTS)).toBe(
    [
      'pyxis, for `/pyxis:daily`: vault `/home/ada/vault`, today Tuesday 2026-10-13, session id `S1`.',
      'Folders, relative to the vault: inbox `Inbox`, hubs `Projects`, archive `Archive`, daily `Daily`, templates `Templates`, sessions `AI/sessions`, logs `AI/logs`, passations `AI/passations`.',
      'Template: `Templates/daily.md`, follow it.',
      'Previous daily note:',
      '- `Daily/2026-10-12.md`',
    ].join('\n'),
  )
})

test('factsBlock: the template line says what is missing, and is left out for a skill without a model', () => {
  const absent = factsBlock({ ...FACTS, skill: 'wrapup', template: { path: 'Templates/session.md', isPresent: false }, lists: [] })
  expect(absent).toContain("Template: none (`Templates/session.md` absent): use the skill's default format.")
  expect(factsBlock({ ...FACTS, skill: 'wrapup', template: null, lists: [] })).toContain("Template: none: use the skill's default format.")
  expect(factsBlock({ ...FACTS, skill: 'inbox', template: null, lists: [] })).not.toContain('Template:')
})

test('factsBlock: a missing folder is said once, with no list', () => {
  const block = factsBlock({ ...FACTS, missing: ['daily'], lists: [] })
  expect(block).toContain('Missing: the daily folder is turned off or absent: say so in one line and stop.')
})

test('lists are capped: 30 lines, then how many more', () => {
  const lines = Array.from({ length: 35 }, (_, i) => `\`n${i}.md\``)
  const block = factsBlock({ ...FACTS, lists: [{ title: 'Inbox, oldest first', lines }] })
  expect(block).toContain('- `n29.md`\n- … and 5 more')
  expect(block).not.toContain('n30.md')
  expect(block.split('\n').filter(l => l.startsWith('- '))).toHaveLength(31)
})

test('daily: its model, today’s note, the previous one and the sessions of today', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:daily' })

  const block = facts(fake)
  expect(block).toContain('Template: `Templates/daily.md`, follow it.')
  expect(block).toContain('- `Daily/2026-10-13.md` (exists)')
  expect(block).toContain('Previous daily note:\n- `Daily/2026-10-12.md`')
  expect(block).toContain('Session notes of today:\n- `AI/sessions/2026-10-13-today.md`')
  expect(block).not.toContain('2026-10-12-before.md')
})

test('morning: todos overdue first, the hubs’ repositories, the inbox oldest first', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:morning' })

  const block = facts(fake)
  const shipIt = block.indexOf('ship it — `Projects/Parcels/parcels.md`:6 (overdue, 📅 2026-10-10)')
  expect(shipIt).toBeGreaterThan(-1)
  expect(block.indexOf('call otter — `Daily/2026-10-12.md`:1')).toBeGreaterThan(shipIt)
  expect(block).toContain('parcels: `/home/ada/code/parcels` on main, 2 uncommitted')
  expect(block).toContain('Newest session note:\n- `AI/sessions/2026-10-13-today.md`')
  const inbox = block.slice(block.indexOf('Inbox, oldest first:'))
  expect(inbox.indexOf('old-idea.md')).toBeGreaterThan(-1)
  expect(inbox.indexOf('new-idea.md')).toBeGreaterThan(inbox.indexOf('old-idea.md'))
})

test('inbox: the age of each note in days', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:inbox' })

  expect(facts(fake)).toContain('- `Inbox/old-idea.md` (9 days)')
  expect(facts(fake)).toContain('- `Inbox/new-idea.md` (1 days)')
})

test('capture: the hubs with their tags', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:capture une idée' })

  expect(facts(fake)).toContain('Hubs:\n- `Projects/Parcels/parcels.md` (tags: project/parcels)')
})

test('wrapup: no session model, the error logs', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:wrapup' })

  const block = facts(fake)
  expect(block).toContain("Template: none (`Templates/session.md` absent): use the skill's default format.")
  expect(block).toContain('- `AI/logs/pyxis-errors.log` (1 lines): bad repos')
})

test('passation: the session’s repository folder, or the one outside repositories', OPTIONS, async ($, on) => {
  const repo = `${HOME}/code/parcels`
  const fake = fakeEngine(on, NOTES, { [repo]: repo }, GIT)
  await $.session.start(startIn(repo))
  await $.prompt.submit({ text: '/pyxis:passation' })
  expect(facts(fake)).toContain(`Write it in:\n- \`${V}/AI/passations/parcels\``)

  await $.session.start(startIn('/tmp'))
  await $.prompt.submit({ text: '/pyxis:passation' })
  expect(facts(fake)).toContain(`- \`${V}/AI/passations/no-repo\``)
})

test('passation: the open ones of that folder', OPTIONS, async ($, on) => {
  const notes: Notes = {
    ...NOTES,
    [`${V}/AI/passations/no-repo/sort-ideas.md`]: ['---\nstatus: active\ndescription: sort the ideas\n---\n', 2],
    [`${V}/AI/passations/no-repo/finished.md`]: '---\nstatus: done\ndescription: done\n---\n',
  }
  const fake = fakeEngine(on, notes, {}, GIT)
  await $.session.start(startIn('/tmp'))
  await $.prompt.submit({ text: '/pyxis:passation' })

  expect(facts(fake)).toContain(`Open passations there:\n- \`${V}/AI/passations/no-repo/sort-ideas.md\` (2 days ago): sort the ideas`)
  expect(facts(fake)).not.toContain('finished.md')
})

test('a folder the skill needs is missing: said, nothing listed', OPTIONS, async ($, on) => {
  const notes: Notes = { ...NOTES, [`${V}/.claude/pyxis.json`]: JSON.stringify({ folders: { daily: null } }) }
  const fake = fakeEngine(on, notes, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:daily' })

  const block = facts(fake)
  expect(block).toContain('Missing: the daily folder is turned off or absent: say so in one line and stop.')
  expect(block).not.toContain('Previous daily note')
  expect(block.split('\n')[1]).not.toContain('daily')
})

test('todos: nothing missing while the daily or the hubs folder is there', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${V}/Inbox/`]: '', [`${V}/Daily/`]: '' }, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:todos' })

  expect(facts(fake)).toContain('Open todos:\n- none')
  expect(facts(fake)).not.toContain('Missing')
})

test('todos: both folders missing, both said', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${V}/Inbox/`]: '' }, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:todos' })

  expect(facts(fake)).toContain('Missing: the daily folder is turned off or absent')
  expect(facts(fake)).toContain('Missing: the hubs folder is turned off or absent')
})

test('an empty vault: every list says none', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${V}/Inbox/`]: '', [`${V}/Daily/`]: '' }, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:morning' })

  expect(facts(fake)).toBe(
    [
      'pyxis, for `/pyxis:morning`: vault `/home/ada/vault`, today Tuesday 2026-10-13, session id `S1`.',
      'Folders, relative to the vault: inbox `Inbox`, daily `Daily`, sessions `AI/sessions`, logs `AI/logs`, passations `AI/passations`.',
      "Template: none: use the skill's default format.",
      "Today's daily note:",
      '- `Daily/2026-10-13.md` (absent)',
      'Previous daily note:',
      '- none',
      'Session notes of today:',
      '- none',
      'Newest session note:',
      '- none',
      'Open todos:',
      '- none',
      'Repositories of the hubs:',
      '- none',
      'Inbox, oldest first:',
      '- none',
    ].join('\n'),
  )
})

test('the block goes with each pyxis skill, not with a lookalike', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES, {}, GIT)

  await $.prompt.submit({ text: '/pyxis:capture une idée' })
  expect(lastContext(fake)).toContain("pyxis: the user's second brain")
  expect(lastContext(fake)).toContain('pyxis, for `/pyxis:capture`')

  await $.prompt.submit({ text: '/pyxis:inbox' })
  expect(lastContext(fake)).toContain('pyxis, for `/pyxis:inbox`')
  expect(lastContext(fake)).not.toContain("pyxis: the user's second brain")

  await $.prompt.submit({ text: '/pyxis:passations' })
  expect(lastContext(fake)).not.toContain('pyxis, for')
})
