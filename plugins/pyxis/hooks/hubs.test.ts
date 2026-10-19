// Ported from hub-inject-test.py: its case numbers are given in each title.
import { expect, test } from 'claude-code/testing'

import { COMPACT, HOME, VAULT, fakeEngine, lastContext, startIn } from './fake'
import type { Notes } from './fake'
import { HUB_BUDGET, citedHubs, composeHubs, parseHub, words } from './hubs'
import type { Hub } from './hubs'

const OPTIONS = { options: { vault: VAULT } }
const REPO = `${HOME}/repos/ParcelsBackend`
const WORKTREE = `${HOME}/worktree`
const LOG = `${VAULT}/AI/logs/pyxis-errors.log`

/** `Projects/<Name>/<name>.md`; a list becomes a YAML block list. */
function hubNote(name: string, fields: Record<string, string | string[]>, body = `## Purpose\n\nContent of ${name}.`) {
  const lines = ['---']
  for (const [key, value] of Object.entries(fields)) {
    lines.push(...(Array.isArray(value) ? [`${key}:`, ...value.map(v => `  - ${v}`)] : [`${key}: ${value}`]))
  }
  const folder = name[0]?.toUpperCase() + name.slice(1)

  return { [`${VAULT}/Projects/${folder}/${name}.md`]: [...lines, '---', '', body, ''].join('\n') }
}

const hub = (name: string, triggers: string[] = [], text = ''): Hub => ({ name, path: `/v/${name}.md`, text, repos: [], triggers })

const HUBS: Notes = {
  ...hubNote('parcels', { status: 'active', repos: [REPO] }),
  ...hubNote('otter', { status: 'active', triggers: '[verbena, sandcastles]' }),
  ...hubNote('loft', { status: 'active', triggers: ['jwks'], repos: ['~/loft-identity'] }),
  ...hubNote('garden', { status: 'active', triggers: ['sterling_log_api'] }),
  ...hubNote('hypatie', { status: 'archived' }),
  ...hubNote('cygnus', { status: '"archived"' }),
  ...hubNote('vela', { status: 'archived   # no longer kept' }),
  [`${VAULT}/Projects/Parcels/glossaire-des-acronymes.md`]: '---\nstatus: active\n---\n\nNot a hub.\n',
}

test('parseHub: repos expanded, relative ones dropped, archived and unclosed hubs', () => {
  const text = '---\nrepos: [~/a/, "/b", rel/dir, ""]\ntriggers:\n  - x # comment\n---\n'
  const { hub: parsed, problems } = parseHub('a', '/v/a.md', text, '/home/ada')
  expect(parsed?.repos).toEqual(['/home/ada/a', '/b'])
  expect(parsed?.triggers).toEqual(['x'])
  expect(problems).toEqual(["/v/a.md: repo ignored, not an absolute path: 'rel/dir'", "/v/a.md: repo ignored, not an absolute path: ''"])

  expect(parseHub('v', '/v/v.md', '---\nstatus: archived # old\n---\n', '').hub).toBeNull()
  const unclosed = parseHub('p', '/v/p.md', '---\nstatus: active\n\nNo end.\n', '')
  expect(unclosed.hub?.name).toBe('p')
  expect(unclosed.problems).toEqual(['/v/p.md: frontmatter not closed'])
})

test('words and citations: whole words, case and accents ignored, multi-word triggers (2-6, 18)', () => {
  expect(words('garden_logs_api/api/views.py')).toEqual(['garden', 'logs', 'api', 'api', 'views', 'py'])
  const hubs = [hub('loft', ['jwks']), hub('otter', ['verbena']), hub('garden', ['sterling_log_api'])]
  const names = (message: string) => citedHubs(hubs, message).map(h => h.name)

  expect(names('le jwks est vide')).toEqual(['loft'])
  expect(names('un poème lyrique')).toEqual([])
  expect(names('LOFT ne répond plus')).toEqual(['loft'])
  expect(names('la Verbéna redémarre')).toEqual(['otter'])
  expect(names('dans garden_logs_api/api/views.py')).toEqual(['garden'])
  expect(names('migrer depuis sterling_log_api')).toEqual(['garden'])
  expect(names('le log de sterling')).toEqual([])
  expect(names('<task-notification>\n<summary>garden_logs_api</summary>')).toEqual([])
  expect(names('<system-reminder>loft</system-reminder>')).toEqual([])
  expect(names('loft renvoie <html>')).toEqual(['loft'])
})

test('ranking: most triggers found first, then the first cited', () => {
  const hubs = [hub('delta', ['quasar']), hub('epsilon')]
  expect(citedHubs(hubs, 'epsilon, puis delta').map(h => h.name)).toEqual(['epsilon', 'delta'])
  expect(citedHubs(hubs, 'epsilon puis delta et son quasar').map(h => h.name)).toEqual(['delta', 'epsilon'])
})

test('budget: whole hubs while they fit, then pointers, the first one cut (13, 14)', () => {
  const bulk = (name: string) => hub(name, [], `${'x'.repeat(4000)}\nend ${name}`)
  const three = composeHubs([bulk('alpha'), bulk('beta'), bulk('gamma')])
  expect(three.text.length).toBeLessThanOrEqual(HUB_BUDGET)
  expect(three.text).toContain('end alpha')
  expect(three.text).toContain('end beta')
  expect(three.text).not.toContain('end gamma')
  expect(three.text).toContain('Also relevant, not injected (context budget): `/v/gamma.md`')
  expect(three.served).toEqual(['alpha', 'beta'])

  const giant = composeHubs([hub('giant', [], `${'y'.repeat(12000)}\nend giant`)])
  expect(giant.text.length).toBeLessThanOrEqual(HUB_BUDGET)
  expect(giant.text).not.toContain('end giant')
  expect(giant.text).toContain('Full hub: `/v/giant.md`')
  expect(giant.served).toEqual(['giant'])
})

test('a name in a message brings its hub once per session; another note of the folder is no hub (1, 7, 16, 17)', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, HUBS)
  await $.session.start(startIn(HOME))
  await $.prompt.submit({ text: 'Le endpoint parcels /me renvoie 500' })
  expect(lastContext(fake)).toContain(`Hub \`parcels\` (\`${VAULT}/Projects/Parcels/parcels.md\`), injected by pyxis`)
  expect(lastContext(fake)).toContain('Content of parcels.')
  expect(lastContext(fake)).not.toContain('Not a hub.')

  await $.prompt.submit({ text: 'encore parcels' })
  expect(lastContext(fake)).toBe('')

  fake.files.set(`${VAULT}/Projects/Andromeda/andromeda.md`, { text: '---\nstatus: active\n---\nContent of andromeda.', mtimeMs: 0 })
  await $.prompt.submit({ text: 'andromeda' })
  expect(lastContext(fake)).toContain('Content of andromeda.')
})

test('archived hubs are never served, whatever the quoting or comment (15)', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, HUBS)
  await $.session.start(startIn(HOME))
  await $.prompt.submit({ text: 'start' })
  await $.prompt.submit({ text: 'hypatie, cygnus et vela' })
  expect(lastContext(fake)).toBe('')
})

test('at start, in a repository of a hub, its subfolder or a worktree: the hub with the first message (10, 11)', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, HUBS, { [REPO]: REPO, [WORKTREE]: REPO })
  for (const cwd of [REPO, `${REPO}/apps`, WORKTREE]) {
    fake.session.id = cwd
    await $.session.start(startIn(cwd))
    await $.prompt.submit({ text: 'bonjour' })
    expect(lastContext(fake)).toContain('Content of parcels.')
  }
})

test('~ in repos: is expanded (10)', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, HUBS, { [`${HOME}/loft-identity`]: `${HOME}/loft-identity` })
  await $.session.start(startIn(`${HOME}/loft-identity`))
  await $.prompt.submit({ text: 'bonjour' })
  expect(lastContext(fake)).toContain('Content of loft.')
})

test('outside any repository, or in the folder above them: no hub (12)', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, HUBS, { [REPO]: REPO })
  for (const cwd of [HOME, `${HOME}/repos`]) {
    fake.session.id = cwd
    await $.session.start(startIn(cwd))
    await $.prompt.submit({ text: 'bonjour' })
    expect(lastContext(fake)).not.toContain('Content of')
  }
})

test('the repository hub is served: naming it later brings nothing (7)', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, HUBS, { [REPO]: REPO })
  await $.session.start(startIn(REPO))
  await $.prompt.submit({ text: 'bonjour' })
  await $.prompt.submit({ text: 'parcels' })
  expect(lastContext(fake)).toBe('')
})

test('after a compaction, the repository hub comes back with the next message, a cited one at its mention (8)', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, HUBS, { [REPO]: REPO })
  await $.session.start(startIn(REPO))
  await $.prompt.submit({ text: 'bonjour' })
  await $.prompt.submit({ text: 'jwks' })
  await $.session.compact(COMPACT)

  await $.prompt.submit({ text: 'on continue' })
  expect(lastContext(fake)).toContain('Content of parcels.')
  expect(lastContext(fake)).not.toContain('Content of loft.')
  await $.prompt.submit({ text: 'jwks' })
  expect(lastContext(fake)).toContain('Content of loft.')
})

test('the transcript shrinks without a compaction event: the repository hub comes again', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, HUBS, { [REPO]: REPO })
  await $.session.start(startIn(REPO))
  fake.transcript = 30
  await $.prompt.submit({ text: 'bonjour' })
  fake.transcript = 3
  await $.prompt.submit({ text: 'on continue' })
  expect(lastContext(fake)).toContain('Content of parcels.')
})

test('a new session id (/clear) starts over: the repository hub comes again', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, HUBS, { [REPO]: REPO })
  await $.session.start(startIn(REPO))
  await $.prompt.submit({ text: 'bonjour' })
  fake.session.id = 'S2'
  await $.prompt.submit({ text: 'bonjour' })
  expect(lastContext(fake)).toContain('Content of parcels.')
})

test('a pointer is not served: the hub comes whole at its next mention (13)', OPTIONS, async ($, on) => {
  const bulk = (name: string) => hubNote(name, { status: 'active' }, `${'x'.repeat(4000)}\nend ${name}`)
  const fake = fakeEngine(on, { ...bulk('alpha'), ...bulk('beta'), ...bulk('gamma') })
  await $.session.start(startIn(HOME))
  await $.prompt.submit({ text: 'alpha beta gamma' })
  expect(lastContext(fake)).not.toContain('end gamma')
  await $.prompt.submit({ text: 'gamma' })
  expect(lastContext(fake)).toContain('end gamma')
  await $.prompt.submit({ text: 'alpha beta' })
  expect(lastContext(fake)).toBe('')
})

test('several hubs on one repository: all, in folder order', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { ...HUBS, ...hubNote('lacerta', { status: 'active', repos: [REPO] }) }, { [REPO]: REPO })
  await $.session.start(startIn(REPO))
  await $.prompt.submit({ text: 'bonjour' })
  const context = lastContext(fake)
  expect(context.indexOf('Content of lacerta.')).toBeLessThan(context.indexOf('Content of parcels.'))
  expect(context.indexOf('Content of lacerta.')).toBeGreaterThan(-1)
})

test('an unclosed frontmatter or a relative repo: served on its name, logged once (19)', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, {
    ...HUBS,
    [`${VAULT}/Projects/Pyxis/pyxis.md`]: '---\nstatus: active\n\nNo end of frontmatter.\n',
    ...hubNote('carina', { status: 'active', repos: ['relative/repo'] }),
  })
  await $.session.start(startIn(HOME))
  await $.prompt.submit({ text: 'pyxis' })
  await $.prompt.submit({ text: 'carina' })
  expect(fake.prompts[0]?.context.join('\n')).toContain('No end of frontmatter.')

  const log = fake.files.get(LOG)?.text ?? ''
  expect(log.match(/frontmatter not closed/g)).toHaveLength(1)
  expect(log.match(/repo ignored, not an absolute path: 'relative\/repo'/g)).toHaveLength(1)
  expect(fake.toasts).toEqual([])
})

test('no hubs folder (hubs: null): no hub, no error', OPTIONS, async ($, on) => {
  const fake = fakeEngine(on, { ...HUBS, [`${VAULT}/.claude/pyxis.json`]: '{ "folders": { "hubs": null } }' })
  await $.session.start(startIn(HOME))
  await $.prompt.submit({ text: 'parcels' })
  expect(lastContext(fake)).not.toContain('Content of')
  expect(fake.files.has(LOG)).toBe(false)
})
