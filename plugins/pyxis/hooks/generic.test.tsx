// Another vault, other names: Victoire's conventions (French folders, no daily notes), English interface.
import { expect, test } from 'claude-code/testing'

import { BAND, HOME, PANE_PROPS, VAULT, fakeEngine, lastContext, startIn } from './fake'
import type { Notes } from './fake'

const OPTIONS = { options: { vault: VAULT } }

const CONVENTIONS = {
  folders: { inbox: 'A-trier', hubs: 'Features', archive: 'Archives', daily: null, templates: 'Modeles', sessions: 'IA/sessions', logs: 'IA/logs' },
  passations: { folder: 'IA/passations' },
  verifyTag: '#a-verifier',
}

const NOTES: Notes = {
  [`${VAULT}/.claude/pyxis.json`]: JSON.stringify(CONVENTIONS),
  [`${VAULT}/Features/Onboarding/onboarding.md`]: '---\nstatus: active\ntriggers: [inscription]\n---\n\n## But\n\nParcours d’inscription. #a-verifier\n- [ ] Relire les écrans\n',
  [`${VAULT}/A-trier/idee.md`]: 'Une idée #a-verifier\n',
  [`${VAULT}/Archives/`]: '',
  [`${VAULT}/Modeles/`]: '',
  [`${VAULT}/Daily/2026-10-01.md`]: '- [ ] not hers: daily is off\n',
  [`${VAULT}/IA/passations/no-repo/maquettes.md`]: ['---\nstatus: active\ndescription: Maquettes de l’onboarding.\n---\n', 2],
}

test('the start block names her folders and her tag, and no daily folder', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: 'bonjour' })

  const block = fake.prompts[0]?.context[0] ?? ''
  expect(block).toContain('inbox `A-trier`, hubs `Features`, archive `Archives`, templates `Modeles`')
  expect(block).not.toContain('daily')
  expect(block).toContain('passations `IA/passations` (outside a repository: `no-repo`, resumed: `resumed`)')
  expect(block).toContain('`Features/<Folder>/<folder in lowercase>.md`')
  expect(block).toContain("5. Flag, don't guess: write `#a-verifier`")
  expect(block).toContain('move it to `Archives`')
  expect(fake.toasts).toEqual([])
})

test('her hubs come at their name or trigger', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(`${HOME}/Documents`))
  await $.prompt.submit({ text: 'Le parcours d’inscription bloque' })
  expect(lastContext(fake)).toContain(`Hub \`onboarding\` (\`${VAULT}/Features/Onboarding/onboarding.md\`)`)
})

test('her handoffs: no-repo at start, resumed into resumed/', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(VAULT))

  const ui = await $.ui.mount({ plugin: 'pyxis', surface: 'desktop', ...BAND })
  expect((await ui.find({ type: 'Text', text: /maquettes/ }))?.text).toContain('2 days ago')
  await ui.press({ key: 'resume:no-repo/maquettes.md' })
  expect(fake.files.get(`${VAULT}/IA/passations/no-repo/resumed/maquettes.md`)?.text).toContain('status: done')
  expect(fake.prompts.at(-1)?.text).toBe(
    `Resume the passation \`${VAULT}/IA/passations/no-repo/resumed/maquettes.md\`. It is already \`status: done\` and moved to \`resumed/\`: read it in full, then carry on.`,
  )
})

test('her dashboard: no Daily section, her tag in her hubs and inbox', OPTIONS, async ($, on) => {
  fakeEngine(on, NOTES)
  await $.session.start(startIn(VAULT))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pyxis', surface, ...PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: 'Todos · 1 open' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Daily' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Inbox · 1' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'To verify · 2 #a-verifier' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Active handoffs · 1' })).toBeDefined()
    // No logs folder on disk: no Errors section.
    expect(await ui.find({ type: 'Text', text: 'Errors' })).toBeUndefined()
    await ui.unmount()
  }
})
