// The facts block that goes with each `/pyxis:<skill>` message.
import { expect, test } from 'claude-code/testing'

import { HOME, VAULT, fakeEngine, lastContext, startIn } from './fake'
import type { Notes } from './fake'
import { factsBlock, skillOf, skillOfSubmission } from './skills'
import type { SkillFacts } from './skills'

const OPTIONS = { options: { vault: VAULT } }
const V = VAULT
const NOTES: Notes = {
  [`${V}/Projects/Parcels/parcels.md`]: '---\ntags: [project/parcels]\nrepos:\n  - ~/code/parcels\n---\n- [ ] ship it 📅 2026-10-10\n',
  [`${V}/AI/sessions/2026-10-12-before.md`]: 'x',
  [`${V}/AI/sessions/2026-10-13-today.md`]: 'x',
  [`${V}/AI/logs/pyxis-errors.log`]: '2026-10-13T09:00\thubs\tbad repos\n',
  [`${V}/AI/passations/parcels/`]: '',
  [`${V}/Templates/passation.md`]: '## Task\n',
}
const GIT = { [`${HOME}/code/parcels`]: { branch: 'main', changes: 2 } }

const FACTS: SkillFacts = {
  skill: 'passation',
  vault: V,
  today: '2026-10-13',
  weekday: 'Tuesday',
  sessionId: 'S1',
  folders: [
    { role: 'templates', path: 'Templates' },
    { role: 'sessions', path: 'AI/sessions' },
    { role: 'logs', path: 'AI/logs' },
    { role: 'passations', path: 'AI/passations' },
  ],
  template: { path: 'Templates/passation.md', isPresent: true },
  wiki: null,
  missing: [],
  lists: [{ title: 'Write it in', lines: ['`/home/ada/vault/AI/passations/no-repo`'] }],
}

/** What the facts block says, without the start block that goes with a session's first message. */
const facts = (fake: Parameters<typeof lastContext>[0]) => lastContext(fake).slice(lastContext(fake).indexOf('pyxis, for'))

test('skillOf: wrapup and passation at the start of the message, nothing else', () => {
  expect(skillOf('/pyxis:wrapup')).toBe('wrapup')
  expect(skillOf('  /pyxis:passation')).toBe('passation')
  expect(skillOf('/pyxis:ingest raw/x.md')).toBe('ingest')
  expect(skillOf('/pyxis:lint')).toBe('lint')
  expect(skillOf('/pyxis:graph file')).toBe('graph')
  const removed = ['/pyxis:capture une idée', '/pyxis:inbox', '/pyxis:daily', '/pyxis:morning', '/pyxis:todos', '/pyxis:decision x', '/pyxis:hub x']
  for (const message of [...removed, '/pyxis:passations', '/pyxis:vault', 'pyxis:wrapup', '/wrapup', 'parle-moi de /pyxis:wrapup']) {
    expect(skillOf(message)).toBeNull()
  }
})

test('factsBlock: the text the skills rely on', () => {
  expect(factsBlock(FACTS)).toBe(
    [
      'pyxis, for `/pyxis:passation`: vault `/home/ada/vault`, today Tuesday 2026-10-13, session id `S1`.',
      'Folders, relative to the vault: templates `Templates`, sessions `AI/sessions`, logs `AI/logs`, passations `AI/passations`.',
      'Template: `Templates/passation.md`, follow it.',
      'Write it in:',
      '- `/home/ada/vault/AI/passations/no-repo`',
    ].join('\n'),
  )
})

test('factsBlock: the template line says what is missing', () => {
  const absent = factsBlock({ ...FACTS, skill: 'wrapup', template: { path: 'Templates/session.md', isPresent: false }, lists: [] })
  expect(absent).toContain("Template: none (`Templates/session.md` absent): use the skill's default format.")
  expect(factsBlock({ ...FACTS, skill: 'wrapup', template: null, lists: [] })).toContain("Template: none: use the skill's default format.")
})

test('factsBlock: a missing folder is said once, with its path and the way out, and no list', () => {
  const absent = factsBlock({ ...FACTS, skill: 'wrapup', missing: [{ role: 'sessions', path: 'AI/sessions' }], lists: [] })
  expect(absent).toContain(
    'Missing: the sessions folder (`AI/sessions`) is absent: create it or change it in `.claude/pyxis.json`; say so in one line and stop.',
  )
  const off = factsBlock({ ...FACTS, skill: 'wrapup', missing: [{ role: 'sessions', path: null }], lists: [] })
  expect(off).toContain('Missing: the sessions folder is turned off in `.claude/pyxis.json`: say so in one line and stop.')
})

test('skillOfSubmission: the engine’s command name first, the text as a fallback', () => {
  expect(skillOfSubmission({ text: 'whatever the engine rendered', command: { name: 'pyxis:wrapup', args: '' } })).toBe('wrapup')
  expect(skillOfSubmission({ text: '/pyxis:passation' })).toBe('passation')
  expect(skillOfSubmission({ text: 'hello', command: { name: 'pyxis:capture', args: '' } })).toBeNull()
  expect(skillOfSubmission({ text: 'hello', command: { name: 'pyxis:vault', args: '' } })).toBeNull()
  expect(skillOfSubmission({ text: 'hello', command: { name: 'compact', args: '' } })).toBeNull()
  expect(skillOfSubmission({ text: 'hello' })).toBeNull()
})

test('lists are capped: 30 lines, then how many more', () => {
  const lines = Array.from({ length: 35 }, (_, i) => `\`n${i}.md\``)
  const block = factsBlock({ ...FACTS, lists: [{ title: 'Open passations there', lines }] })
  expect(block).toContain('- `n29.md`\n- … and 5 more')
  expect(block).not.toContain('n30.md')
  expect(block.split('\n').filter(l => l.startsWith('- '))).toHaveLength(31)
})

test('wrapup: the error logs and no hub', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES, {}, GIT)
  await $.session.start(startIn(`${HOME}/code/parcels`))
  await $.prompt.submit({ text: '/pyxis:wrapup' })

  const block = facts(fake)
  expect(block).toContain("Template: none (`Templates/session.md` absent): use the skill's default format.")
  expect(block).toContain('Error logs:\n- `AI/logs/pyxis-errors.log` (1 lines): bad repos')
  expect(block).not.toContain('Hubs:')
  expect(block).not.toContain('Wiki:')
  expect(block).not.toContain('Missing')
  expect(block).not.toContain("This session's hubs:")
  expect(block).not.toContain('parcels.md')
})

test('a removed skill typed after the update: no facts block, no error logged', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { ...NOTES, [`${V}/AI/logs/pyxis-errors.log`]: '' }, {}, GIT)
  for (const text of ['/pyxis:capture une idée', '/pyxis:daily', '/pyxis:hub parcels']) {
    await $.prompt.submit({ text })
    expect(lastContext(fake)).not.toContain('pyxis, for')
  }
  expect(fake.files.get(`${V}/AI/logs/pyxis-errors.log`)?.text ?? '').toBe('')
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
  const notes: Notes = { ...NOTES, [`${V}/.claude/pyxis.json`]: JSON.stringify({ folders: { sessions: null } }) }
  const fake = fakeEngine(on, notes, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:wrapup' })

  const block = facts(fake)
  expect(block).toContain('Missing: the sessions folder is turned off in `.claude/pyxis.json`: say so in one line and stop.')
  expect(block).not.toContain('Error logs')
})

test('a skill typed from a repository outside the vault: the vault’s CLAUDE.md is not named', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES, {}, GIT)
  await $.session.start(startIn(`${HOME}/code/parcels`))
  await $.prompt.submit({ text: '/pyxis:wrapup' })

  expect(facts(fake)).not.toContain('CLAUDE.md')
  expect(facts(fake)).not.toContain('Verify tag')
})

test('the block goes with each pyxis skill, not with a lookalike', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES, {}, GIT)

  await $.prompt.submit({ text: '/pyxis:wrapup' })
  expect(lastContext(fake)).toContain("pyxis: ")
  expect(lastContext(fake)).toContain('pyxis, for `/pyxis:wrapup`')

  await $.prompt.submit({ text: '/pyxis:passation' })
  expect(lastContext(fake)).toContain('pyxis, for `/pyxis:passation`')
  expect(lastContext(fake)).not.toContain('Session id:')

  await $.prompt.submit({ text: '/pyxis:passations' })
  expect(lastContext(fake)).not.toContain('pyxis, for')
})

test('an unreadable date: no facts, a line in the error log, the start block kept', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES, {}, GIT)
  fake.date = 'mardi\n'
  await $.prompt.submit({ text: '/pyxis:wrapup' })

  expect(lastContext(fake)).not.toContain('pyxis, for')
  expect(lastContext(fake)).toContain('Session id:')
  expect(fake.files.get(`${V}/AI/logs/pyxis-errors.log`)?.text).toContain("unreadable date: 'mardi'")
})

test('notes behind symbolic links count as the ones they lead to', OPTIONS, async ($, on) => {
  const notes: Notes = {
    ...NOTES,
    [`${V}/AI/passations/no-repo/shared.md`]: ['---\nstatus: active\ndescription: kept elsewhere\n---\n', 20],
  }
  const fake = fakeEngine(on, notes, {}, GIT)
  fake.links.add(`${V}/AI/passations/no-repo/shared.md`)
  await $.session.start(startIn('/tmp'))
  await $.prompt.submit({ text: '/pyxis:passation' })

  expect(facts(fake)).toContain('no-repo/shared.md` (20 days ago): kept elsewhere')
})

const WIKI = `${HOME}/notes/wiki`
/** The plugin's root is whatever the engine says: the scripts are its `wiki` folder. */
const WIKI_LINE = new RegExp(`^Wiki: \`${WIKI}\`, scripts \`[^\`]*/wiki\`\\.$`, 'm')
const WIKI_OPTIONS = { options: { vault: VAULT, wiki: WIKI } }
const WIKI_NOTES: Notes = { ...NOTES, [`${WIKI}/index.md`]: 'x' }
const WIKI_FACTS: SkillFacts = { ...FACTS, skill: 'ingest', wiki: { path: WIKI, scripts: '/plugins/pyxis/wiki' }, template: null, lists: [] }

test('factsBlock: the wiki line, for the skills that work on a wiki', () => {
  const line = `Wiki: \`${WIKI}\`, scripts \`/plugins/pyxis/wiki\`.`
  for (const skill of ['ingest', 'lint', 'graph', 'wrapup'] as const) {
    expect(factsBlock({ ...WIKI_FACTS, skill })).toContain(line)
  }
  expect(factsBlock({ ...FACTS, skill: 'ingest', template: null })).not.toContain('Wiki:')
})

test('factsBlock: no wiki line for passation, even with a wiki set', () => {
  expect(factsBlock({ ...WIKI_FACTS, skill: 'passation' })).not.toContain('Wiki:')
})

test('factsBlock: a wiki skill has no template line', () => {
  expect(factsBlock(WIKI_FACTS)).not.toContain('Template:')
  expect(factsBlock({ ...WIKI_FACTS, skill: 'wrapup' })).toContain('Template:')
})

test('factsBlock: no wiki is said once, without a path', () => {
  const block = factsBlock({ ...FACTS, skill: 'lint', template: null, missing: [{ role: 'wiki', path: null }], lists: [] })
  expect(block).toContain('Missing: the wiki option is not set or its folder is absent: say so in one line and stop.')
  expect(block).not.toContain('Wiki:')
})

for (const skill of ['ingest', 'lint', 'graph'] as const) {
  test(`${skill}: the wiki and its scripts`, WIKI_OPTIONS, async ($, on) => {
    const fake = fakeEngine(on, WIKI_NOTES, {}, GIT)
    await $.prompt.submit({ text: `/pyxis:${skill}` })

    const block = facts(fake)
    expect(block).toContain(`pyxis, for \`/pyxis:${skill}\``)
    expect(block).toMatch(WIKI_LINE)
    expect(block).not.toContain('Missing')
    expect(block).not.toContain('Template:')
  })

  test(`${skill}: without the wiki option, one Missing line and nothing else to work from`, OPTIONS, async ($, on) => {
    const fake = fakeEngine(on, WIKI_NOTES, {}, GIT)
    await $.prompt.submit({ text: `/pyxis:${skill}` })

    const block = facts(fake)
    expect(block).toContain('Missing: the wiki option is not set or its folder is absent: say so in one line and stop.')
    expect(block).not.toContain('Wiki:')
    expect(block).not.toContain('Graph file')
  })
}

test('a wiki set but absent from disk: the same Missing line', WIKI_OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:ingest' })

  expect(facts(fake)).toContain('Missing: the wiki option is not set or its folder is absent: say so in one line and stop.')
})

test('graph: the file goes in the notes folder', WIKI_OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, WIKI_NOTES, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:graph file' })

  expect(facts(fake)).toContain(`Graph file:\n- \`${V}/wiki-graph.html\``)
})

test('wrapup with a wiki: the Wiki line, no Missing', WIKI_OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, WIKI_NOTES, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:wrapup' })

  expect(facts(fake)).toMatch(WIKI_LINE)
  expect(facts(fake)).not.toContain('Missing')
})

test('passation with a wiki: no Wiki line', WIKI_OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, WIKI_NOTES, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:passation' })

  expect(facts(fake)).toContain('pyxis, for `/pyxis:passation`')
  expect(facts(fake)).not.toContain('Wiki:')
})

test('wrapup with a wiki set but absent from disk: no Wiki line, no Missing', WIKI_OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES, {}, GIT)
  await $.prompt.submit({ text: '/pyxis:wrapup' })

  expect(facts(fake)).not.toContain('Wiki:')
  expect(facts(fake)).not.toContain('Missing')
})
