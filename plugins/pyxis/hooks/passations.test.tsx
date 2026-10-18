// Ported from the passations-vault and jauge-contexte mods and from passation-test.py.
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { BAND, COMPACT, HOME, VAULT, fakeEngine, lastContext, measured, startIn } from './fake'
import type { Notes } from './fake'
import { hubsForRoots } from './hubs'

const OPTIONS = { options: { vault: VAULT, language: 'fr' } }
const PASSATIONS = `${VAULT}/AI/passations`
const OUTSIDE = `${PASSATIONS}/hors-depot`
const OTTER = `${HOME}/Projects/otterbackend`
// A repository without a hub: its handoffs come from it alone.
const SAMPLE = `${HOME}/Projects/Android_App_Sample`
const REPOS = { [OTTER]: OTTER, [SAMPLE]: SAMPLE, [`${SAMPLE}/.claude/worktrees/v2`]: SAMPLE }

const note = (description: string, status = 'active') => `---\nstatus: ${status}\ndescription: ${description}\n---\n\n## Goal\n`

const VAULT_NOTES: Notes = {
  [`${VAULT}/.claude/pyxis.json`]: JSON.stringify({ passations: { outsideRepo: 'hors-depot', resumed: 'reprises' } }),
  [`${VAULT}/Projects/Otter/otter.md`]: '---\nstatus: active\nrepos:\n  - ~/Projects/otterbackend\ntriggers: [verbena]\n---\n\n## Purpose\n',
  [`${OUTSIDE}/kit-vault-victoire.md`]: [note('Kit vault + skills pour Victoire.'), 1],
  [`${OUTSIDE}/vieille.md`]: [note('Finie.', 'done'), 9],
  [`${OUTSIDE}/reprises/deja.md`]: note('Déjà reprise.'),
  [`${PASSATIONS}/otterbackend/refonte-design.md`]: [note('Reste deux écrans HS.'), 2],
  [`${PASSATIONS}/Android_App_Sample/maquettes-v2.md`]: [note('Maquettes V2.'), 3],
  [`${PASSATIONS}/Android_App_Sample/ancienne.md`]: [note('Active depuis un mois.'), 30],
}

const banner = ($: Engine, surface: 'terminal' | 'desktop' = 'desktop') => $.ui.mount({ plugin: 'pyxis', surface, ...BAND })

test('hubsForRoots: a repository holds its subfolders, not a folder sharing its prefix', () => {
  const hubs = [{ name: 'otter', path: '', text: '', repos: [OTTER], triggers: [] }]
  expect(hubsForRoots(hubs, [`${OTTER}/apps/accounts`]).map(h => h.name)).toEqual(['otter'])
  expect(hubsForRoots(hubs, [`${OTTER}-copie`])).toEqual([])
})

test('in the vault: the handoffs outside repositories, until a hub is cited', OPTIONS, async ($, on) => {
  fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(VAULT))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await banner($, surface)
    expect(await ui.find({ key: 'resume:hors-depot/kit-vault-victoire.md' })).toBeDefined()
    expect(await ui.find({ key: 'resume:hors-depot/vieille.md' })).toBeUndefined()
    expect(await ui.find({ key: 'resume:hors-depot/deja.md' })).toBeUndefined()
    expect(await ui.find({ key: 'resume:otterbackend/refonte-design.md' })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /kit-vault-victoire/ }))?.text).toContain('hier')
    await ui.unmount()
  }
})

test('a hub cited in a message adds its repositories’ handoffs to /passations', OPTIONS, async ($, on) => {
  fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: 'Où en est la revue de sécurité côté Verbena ?' })

  expect(await $.command.run({ command: 'pyxis:passations' })).toEqual({
    text: '2 passation(s) en cours (hors dépôt, otter), au-dessus de la zone de saisie.',
  })
  const ui = await banner($)
  expect(await ui.find({ key: 'resume:hors-depot/kit-vault-victoire.md' })).toBeDefined()
  expect(await ui.find({ key: 'resume:otterbackend/refonte-design.md' })).toBeDefined()
})

test('in a repository: its hub’s handoffs from the start, not those outside repositories', OPTIONS, async ($, on) => {
  fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(`${OTTER}/otter/home`))

  const ui = await banner($)
  expect(await ui.find({ key: 'resume:otterbackend/refonte-design.md' })).toBeDefined()
  expect(await ui.find({ key: 'resume:hors-depot/kit-vault-victoire.md' })).toBeUndefined()
})

test('“Resume” marks the note done, moves it to reprises/ and submits the resumption', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(VAULT))

  const ui = await banner($)
  await ui.press({ key: 'resume:hors-depot/kit-vault-victoire.md' })

  expect(fake.files.get(`${OUTSIDE}/reprises/kit-vault-victoire.md`)?.text).toContain('status: done')
  expect(fake.files.has(`${OUTSIDE}/kit-vault-victoire.md`)).toBe(false)
  expect(fake.commands.slice(-2)).toEqual([
    ['mkdir', '-p', `${OUTSIDE}/reprises`],
    ['mv', `${OUTSIDE}/kit-vault-victoire.md`, `${OUTSIDE}/reprises/kit-vault-victoire.md`],
  ])
  expect(fake.prompts).toHaveLength(1)
  expect(fake.prompts[0]?.text).toContain(`Reprends la passation \`${OUTSIDE}/reprises/kit-vault-victoire.md\``)
  expect(fake.prompts[0]?.text).not.toContain('concerne le dépôt')
  expect(await ui.find({ key: 'resume:hors-depot/kit-vault-victoire.md' })).toBeUndefined()
  // A plugin's own prompt skips its own hooks: the start block goes with the user's next message.
  expect(fake.prompts[0]?.context).toEqual([])
  await $.prompt.submit({ text: 'suite' })
  expect(fake.prompts[1]?.context[0]).toContain('pyxis: ')
})

test('a note already in reprises/ under that name: the moved one gets a suffix', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { ...VAULT_NOTES, [`${OUTSIDE}/reprises/kit-vault-victoire.md`]: note('Older.') }, REPOS)
  await $.session.start(startIn(VAULT))
  await (await banner($)).press({ key: 'resume:hors-depot/kit-vault-victoire.md' })

  expect(fake.commands.at(-1)?.[2]).toMatch(/reprises\/kit-vault-victoire-\d+\.md$/)
  expect(fake.files.get(`${OUTSIDE}/reprises/kit-vault-victoire.md`)?.text).toContain('Older.')
})

test('resuming a repository’s handoff from the vault says so', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: 'otter' })
  await $.command.run({ command: 'pyxis:passations' })
  await (await banner($)).press({ key: 'resume:otterbackend/refonte-design.md' })

  expect(fake.commands.at(-1)).toEqual([
    'mv',
    `${PASSATIONS}/otterbackend/refonte-design.md`,
    `${PASSATIONS}/otterbackend/reprises/refonte-design.md`,
  ])
  expect(fake.prompts.at(-1)?.text).toContain(`Elle concerne le dépôt \`${OTTER}\``)
})

test('the first message hides the banner, /passations shows it again', OPTIONS, async ($, on) => {
  fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: 'process the inbox' })
  expect(await (await banner($)).find({ key: 'engine' })).toBeDefined()

  expect(await $.command.run({ command: 'pyxis:passations' })).toEqual({
    text: '1 passation(s) en cours (hors dépôt), au-dessus de la zone de saisie.',
  })
  expect(await (await banner($)).find({ key: 'resume:hors-depot/kit-vault-victoire.md' })).toBeDefined()
})

test('in a repository without a hub, from a worktree: its handoffs, at start and with /passations', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(`${SAMPLE}/.claude/worktrees/v2`))

  const ui = await banner($)
  expect(await ui.find({ key: 'resume:Android_App_Sample/maquettes-v2.md' })).toBeDefined()
  // An active note is listed whatever its age: passation.py's 7-day filter is gone.
  expect(await ui.find({ key: 'resume:Android_App_Sample/ancienne.md' })).toBeDefined()
  expect(await ui.find({ key: 'resume:hors-depot/kit-vault-victoire.md' })).toBeUndefined()
  expect(await ui.find({ key: 'resume:otterbackend/refonte-design.md' })).toBeUndefined()
  await ui.unmount()

  await $.prompt.submit({ text: 'on continue' })
  expect(await $.command.run({ command: 'pyxis:passations' })).toEqual({
    text: '3 passation(s) en cours (hors dépôt, Android_App_Sample), au-dessus de la zone de saisie.',
  })
  await (await banner($)).press({ key: 'resume:Android_App_Sample/maquettes-v2.md' })
  expect(fake.prompts.at(-1)?.text).toContain(`${PASSATIONS}/Android_App_Sample/reprises/maquettes-v2.md`)
  expect(fake.prompts.at(-1)?.text).not.toContain('concerne le dépôt')
})

test('a hub’s repository is not named twice in /passations', OPTIONS, async ($, on) => {
  fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(OTTER))
  expect(await $.command.run({ command: 'pyxis:passations' })).toEqual({
    text: '2 passation(s) en cours (hors dépôt, otter), au-dessus de la zone de saisie.',
  })
})

test('outside the vault, any repository and any hub: no banner, no list for the model', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(`${HOME}/Downloads`))
  expect(await (await banner($)).find({ key: 'engine' })).toBeDefined()
  await $.prompt.submit({ text: 'bonjour' })
  expect(lastContext(fake)).not.toContain('Open passations')
})

test('the model reads the same list with the first message, then never again', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(SAMPLE))
  await $.prompt.submit({ text: 'bonjour' })
  const first = lastContext(fake)
  expect(first).toContain('Open passations, left by earlier sessions:')
  expect(first).toContain(`- \`${PASSATIONS}/Android_App_Sample/maquettes-v2.md\` (3 days ago): Maquettes V2.`)
  expect(first).toContain(`- \`${PASSATIONS}/Android_App_Sample/ancienne.md\` (30 days ago)`)
  expect(first.indexOf('maquettes-v2')).toBeLessThan(first.indexOf('ancienne'))
  expect(first).toContain('move it to `reprises/` next to it')
  expect(first).not.toContain('kit-vault-victoire')

  await $.prompt.submit({ text: 'suite' })
  expect(lastContext(fake)).not.toContain('Open passations')
})

test('no handoff: no list', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { [`${VAULT}/Inbox/a.md`]: 'x' }, REPOS)
  await $.session.start(startIn(SAMPLE))
  await $.prompt.submit({ text: 'bonjour' })
  expect(lastContext(fake)).not.toContain('Open passations')
})

test('below the threshold: no notice, no warning; past it, both', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(SAMPLE))
  await $.prompt.submit({ text: 'bonjour' })
  await $.session.measure(measured(299_000))
  await $.prompt.submit({ text: 'suite' })
  expect(lastContext(fake)).not.toContain('past the threshold')
  expect(await (await banner($)).find({ key: 'write-passation' })).toBeUndefined()

  await $.session.measure(measured(612_000))
  await $.prompt.submit({ text: 'encore' })
  const notice = lastContext(fake)
  expect(notice).toContain('Session context: 612k tokens, past the threshold of 300k.')
  expect(notice).toContain(`in \`${PASSATIONS}/Android_App_Sample/<task-slug>.md\` (session \`S1\`)`)
  expect(notice).toContain('/skills/passation/SKILL.md')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await banner($, surface)
    expect((await ui.find({ type: 'Text', text: /612k/ }))?.text).toBe('Contexte à 612k, au-delà du seuil de passation (300k).')
    await ui.unmount()
  }
})

test('the warning sends “passation”, then hides', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(`${HOME}/Downloads`))
  await $.prompt.submit({ text: 'bonjour' })
  await $.session.measure(measured(310_000))

  const ui = await banner($)
  await ui.press({ key: 'write-passation' })
  expect(fake.prompts.at(-1)?.text).toBe('passation')
  await ui.press({ key: 'hide-threshold' })
  expect(await ui.find({ key: 'write-passation' })).toBeUndefined()
})

test('outside any repository, the notice points to outsideRepo', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(`${HOME}/Downloads`))
  await $.session.measure(measured(310_000))
  await $.prompt.submit({ text: 'bonjour' })
  expect(lastContext(fake)).toContain(`in \`${OUTSIDE}/<task-slug>.md\``)
})

test('a lower threshold, in English', { options: { vault: VAULT, threshold: 200_000 } }, async ($, on) => {
  const fake = fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(VAULT))
  await $.session.measure(measured(210_000))
  await $.prompt.submit({ text: 'hi' })
  expect(lastContext(fake)).toContain('past the threshold of 200k')

  const ui = await banner($)
  expect((await ui.find({ type: 'Text', text: /210k/ }))?.text).toBe('Context at 210k, past the handoff threshold (200k).')
})

test('a new session id (/clear) forgets the last size: no notice, no warning', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(SAMPLE))
  await $.prompt.submit({ text: 'bonjour' })
  await $.session.measure(measured(320_000))
  fake.session.id = 'S2'
  await $.prompt.submit({ text: 'nouvelle conversation' })
  expect(lastContext(fake)).not.toContain('past the threshold')
  expect(await (await banner($)).find({ key: 'write-passation' })).toBeUndefined()
})

test('after a compaction, the size is the compacted one, or unknown', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(SAMPLE))
  await $.prompt.submit({ text: 'bonjour' })
  await $.session.measure(measured(320_000))
  fake.tokensAfter = 40_000
  await $.session.compact(COMPACT)
  await $.prompt.submit({ text: 'suite' })
  expect(lastContext(fake)).not.toContain('past the threshold')
  expect(await (await banner($)).find({ key: 'write-passation' })).toBeUndefined()

  fake.tokensAfter = undefined
  await $.session.measure(measured(320_000))
  await $.session.compact(COMPACT)
  await $.prompt.submit({ text: 'encore' })
  expect(lastContext(fake)).not.toContain('past the threshold')
})

test('hidden, the warning comes back at the next crossing', OPTIONS, async ($, on) => {
  fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(`${HOME}/Downloads`))
  await $.session.measure(measured(310_000))
  const ui = await banner($)
  await ui.press({ key: 'hide-threshold' })
  expect(await ui.find({ key: 'write-passation' })).toBeUndefined()

  await $.session.measure(measured(120_000))
  await $.session.measure(measured(305_000))
  expect(await ui.find({ key: 'write-passation' })).toBeDefined()
})

test('Resume on a handoff gone from disk: a toast and a log line, the banner stays', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, VAULT_NOTES, REPOS)
  await $.session.start(startIn(SAMPLE))
  const ui = await banner($)
  fake.files.delete(`${PASSATIONS}/Android_App_Sample/maquettes-v2.md`)
  const before = fake.prompts.length
  await ui.press({ key: 'resume:Android_App_Sample/maquettes-v2.md' })

  expect(fake.prompts).toHaveLength(before)
  expect(fake.toasts).toHaveLength(1)
  expect(fake.toasts[0]).toContain('maquettes-v2.md')
  expect(fake.files.get(`${VAULT}/AI/logs/pyxis-errors.log`)?.text).toContain('\tresume\t')
  expect(await ui.find({ key: 'resume:Android_App_Sample/maquettes-v2.md' })).toBeDefined()
})
