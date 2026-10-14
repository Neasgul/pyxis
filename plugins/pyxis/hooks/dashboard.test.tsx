// Ported from the tableau-vault mod.
import { expect, test } from 'claude-code/testing'

import { countByFile, daysBetweenDates, grepLines, sortTodos, todo } from './dashboard'
import { HOME, PANE_PROPS, VAULT, fakeEngine, startIn } from './fake'
import type { Notes } from './fake'

const OPTIONS = { options: { vault: VAULT, language: 'fr' } }

const TODOS = [
  'Daily/2026-09-29.md:9:- [ ] Travailler sur Otter [[otter]]',
  'Daily/2026-09-29.md:15:- [ ] Écrire la skill /weekly 📅 2026-10-02 [[2026-09-22-service-hubs]]',
  'Projects/Parcels/parcels.md:40:- [ ] Archiver les scripts 📅 2026-10-20',
].join('\n')

const NOTES: Notes = {
  [`${VAULT}/Daily/2026-09-28.md`]: '# 28\n',
  [`${VAULT}/Daily/2026-09-29.md`]: [
    '# 29',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '- [ ] Travailler sur Otter [[otter]]',
    '',
    '',
    '',
    '',
    '',
    '- [ ] Écrire la skill /weekly 📅 2026-10-02 [[2026-09-22-service-hubs]]',
  ].join('\n'),
  [`${VAULT}/Projects/Parcels/parcels.md`]: '---\nstatus: active\n---\n- [ ] Archiver les scripts 📅 2026-10-20\nstale schema? #todo/verify\n',
  [`${VAULT}/Projects/Garden/garden.md`]: 'plan drifted? #todo/verify\nStats API? #todo/verify\n',
  [`${VAULT}/Daily/2026-09-27.md`]: 'not counted: #todo/verify\n',
  [`${VAULT}/Inbox/achats-de-materiel-2026.md`]: ['note', 15],
  [`${VAULT}/AI/passations/hors-depot/kit-vault-victoire.md`]: ['---\nstatus: active\ndescription: Kit vault pour Victoire.\n---\n', 1],
  [`${VAULT}/AI/passations/otterbackend/reprises/`]: '',
  [`${VAULT}/AI/logs/pyxis-errors.log`]: '2026-10-12T09:00:00\thubs\tfrontmatter not closed\n',
  [`${VAULT}/AI/logs/agent-run.log`]: 'output of an agent, not an error\n',
}

test('grep lines, todos, sorting, counts and days', () => {
  const lines = grepLines(TODOS)
  expect(lines).toHaveLength(3)
  expect(lines[1]?.line).toBe(15)

  const weekly = todo('Daily/2026-09-29.md', 15, lines[1]?.text ?? '', '2026-10-13')
  expect(weekly.due).toBe('2026-10-02')
  expect(weekly.isLate).toBe(true)
  expect(weekly.text).toBe('Écrire la skill /weekly [[2026-09-22-service-hubs]]')

  const sorted = sortTodos(lines.map(l => todo(l.file, l.line, l.text, '2026-10-13')))
  expect(sorted.map(t => t.due)).toEqual(['2026-10-02', '2026-10-20', null])
  expect(countByFile(grepLines('a.md:1:x\nb.md:2:x\nb.md:3:x'))).toEqual([
    { file: 'b.md', count: 2 },
    { file: 'a.md', count: 1 },
  ])
  expect(daysBetweenDates('2026-09-29', '2026-10-13')).toBe(14)
})

test('in the vault: the pane opens and shows what waits', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(VAULT))
  expect(fake.panes).toEqual(['pyxis-vault'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pyxis', surface, ...PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: 'Todos · 3 ouverts, 1 en retard' })).toBeDefined()
    expect((await ui.find({ key: 'todo:Daily/2026-09-29.md:15' }))?.text).toContain('2026-10-02 Écrire la skill /weekly')
    expect(await ui.find({ type: 'Text', text: '●' })).toBeDefined()
    expect((await ui.find({ key: 'daily' }))?.text).toBe('dernier : 2026-09-29')
    expect(await ui.find({ type: 'Text', text: 'il y a 14 j' })).toBeDefined()
    expect(await ui.find({ key: 'inbox:Inbox/achats-de-materiel-2026.md' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'il y a 15 j' })).toBeDefined()
    // The hubs and the inbox only: the Daily sections are counted as todos.
    expect(await ui.find({ type: 'Text', text: 'À vérifier · 3 #todo/verify' })).toBeDefined()
    expect((await ui.find({ key: 'passation:AI/passations/hors-depot/kit-vault-victoire.md' }))?.text).toBe('hors-depot/kit-vault-victoire')
    expect(await ui.find({ type: 'Text', text: 'Kit vault pour Victoire.' })).toBeDefined()
    expect(await ui.find({ key: 'error:AI/logs/pyxis-errors.log' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /frontmatter not closed/ })).toBeDefined()
    expect(await ui.find({ key: 'error:AI/logs/agent-run.log' })).toBeUndefined()
    await ui.unmount()
  }
})

test('a row opens its note in Obsidian: open on macOS', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(VAULT))

  const ui = await $.ui.mount({ plugin: 'pyxis', surface: 'desktop', ...PANE_PROPS })
  await ui.press({ key: 'todo:Daily/2026-09-29.md:15' })
  expect(fake.commands.at(-1)).toEqual(['open', `obsidian://open?path=${encodeURIComponent(`${VAULT}/Daily/2026-09-29.md`)}`])
})

test('outside the vault: nothing opens by itself, /vault opens it', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(`${HOME}/Projects/otterbackend`))
  expect(fake.panes).toEqual([])

  expect(await $.command.run({ command: 'vault' })).toEqual({ text: 'Tableau du vault ouvert.' })
  expect(fake.panes).toEqual(['pyxis-vault'])
})

test('a folder missing from disk hides its section', OPTIONS, async ($, on) => {
  const notes = Object.fromEntries(Object.entries(NOTES).filter(([path]) => !path.startsWith(`${VAULT}/Inbox/`)))
  fakeEngine(on, notes)
  await $.session.start(startIn(VAULT))

  const ui = await $.ui.mount({ plugin: 'pyxis', surface: 'desktop', ...PANE_PROPS })
  expect(await ui.find({ type: 'Text', text: /^Inbox/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'À vérifier · 3 #todo/verify' })).toBeDefined()
})

test('the desktop app attaching after start gets the pane', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start({ cwd: VAULT, surface: null, isInteractive: false })
  fake.panes.length = 0
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  expect(fake.panes).toEqual(['pyxis-vault'])
})
