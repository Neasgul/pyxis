// Another vault, other names: Victoire's conventions (French folders), English interface.
import { expect, test } from 'claude-code/testing'

import { BAND, HOME, VAULT, fakeEngine, lastContext, startIn } from './fake'
import type { Notes } from './fake'

const OPTIONS = { options: { vault: VAULT } }

const CONVENTIONS = {
  folders: { templates: 'Modeles', sessions: 'IA/sessions', logs: 'IA/logs' },
  passations: { folder: 'IA/passations' },
}

const NOTES: Notes = {
  [`${VAULT}/.claude/pyxis.json`]: JSON.stringify(CONVENTIONS),
  [`${VAULT}/Modeles/`]: '',
  [`${VAULT}/IA/passations/no-repo/maquettes.md`]: ['---\nstatus: active\ndescription: Maquettes de l’onboarding.\n---\n', 2],
}

test('the start block names her folders', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, NOTES)
  await $.session.start(startIn(VAULT))
  await $.prompt.submit({ text: 'bonjour' })

  const block = fake.prompts[0]?.context[0] ?? ''
  expect(block).toContain('templates `Modeles`, sessions `IA/sessions`, logs `IA/logs`')
  expect(block).toContain('passations `IA/passations` (outside a repository: `no-repo`, resumed: `resumed`)')
  expect(fake.toasts).toEqual([])
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
