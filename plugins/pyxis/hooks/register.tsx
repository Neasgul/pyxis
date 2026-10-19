import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { isWithin, loadKit, logLine, onDisk, report, settings } from './conventions'
import type { Kit, Settings } from './conventions'
import { PANE, isDashboardOpen, openDashboard, refresh, renderDashboard } from './dashboard'
import { citedHubs, composeHubs, hubsForRoots, loadHubs, repoRoot } from './hubs'
import { text } from './i18n'
import { currentMemory, measureTranscript, saveMemory } from './memory'
import {
  claimNotice,
  contextSize,
  modelList,
  openPassations,
  passationsDir,
  recordSize,
  renderBanner,
  repoFolder,
  thresholdNotice,
} from './passations'
import { rulesBlock } from './rules'
import { factsBlock, skillFacts, skillOfSubmission } from './skills'

// The session's values, declared in ../types: they survive a reload of the module.
const passations = atom({ plugin: 'pyxis', key: 'passations' } as const, [])
const isBannerHidden = atom({ plugin: 'pyxis', key: 'isBannerHidden' } as const, false)

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])]

// The commands are files of the plugin (`commands/`), so that the desktop app lists them too:
// they run as `/pyxis:<name>`, and the hooks below answer them without the model.
const PASSATIONS_COMMAND = 'pyxis:passations'
const VAULT_COMMAND = 'pyxis:vault'

/** pyxis's own commands answer without the model: what goes with a message waits for the next. */
const isOwnCommand = (prompt: string) => /^\/pyxis:(passations|vault)(\s|$)/.test(prompt.trimStart())

/** A hook never blocks a message: what fails goes to the error log. */
async function failed($: EngineInterface, s: Settings, where: string, error: unknown) {
  const kit = await loadKit($, s)
  await logLine($, kit, where, error instanceof Error ? error.message : String(error))
}

/** The kit, its problems told once; null when the vault is not there. */
async function ready($: EngineInterface, s: Settings, where: string): Promise<Kit | null> {
  const kit = await loadKit($, s)
  await report($, kit, where, kit.problems, true)

  return kit.isVaultFound ? kit : null
}

/** At start: the hubs of the session's repository become active, the banner lists their handoffs. */
async function start($: EngineInterface, s: Settings, cwd: string) {
  const kit = await ready($, s, 'session.start')
  if (kit === null) {
    return
  }
  const repo = await repoRoot($, cwd)
  const { hubs, problems } = await loadHubs($, kit)
  await report($, kit, 'hubs', problems, false)
  const own = hubsForRoots(hubs, repo ? [cwd, repo] : [cwd])
  const memory = await currentMemory($)
  await saveMemory($, { ...memory, active: union(memory.active, own.map(h => h.name)) })

  const isVaultSession = isWithin(cwd, kit.vault)
  const list = await openPassations($, kit, isVaultSession, [...(repo ? [repo] : []), ...own.flatMap(h => h.repos)])
  await update($, passations, () => list)
  if (isVaultSession) {
    await openDashboard($, kit)
  }
}

/** What the model reads with this message: the start block once, cited hubs, the threshold notice once per crossing, a skill's facts. */
async function contextFor($: EngineInterface, s: Settings, e: { text: string; command?: { name: string } }): Promise<string[]> {
  const message = e.text
  const kit = await ready($, s, 'prompt.submit')
  if (kit === null) {
    return []
  }
  const memory = await measureTranscript($, await currentMemory($))
  const cwd = await $.session.cwd()
  const repo = await repoRoot($, cwd)
  const isVaultSession = isWithin(cwd, kit.vault)
  const { hubs, problems } = await loadHubs($, kit)
  await report($, kit, 'hubs', problems, false)

  const own = memory.isPrimed ? [] : hubsForRoots(hubs, repo ? [cwd, repo] : [cwd])
  const cited = citedHubs(hubs, message)
  const candidates = [...new Set([...own, ...cited])].filter(h => !memory.served.includes(h.name))
  const composed = composeHubs(candidates)
  const active = union(memory.active, [...own, ...cited].map(h => h.name))
  const blocks: string[] = []

  if (!memory.isPrimed) {
    blocks.push(rulesBlock(await onDisk($, kit), isVaultSession, memory.id, $.plugin.root))
  }
  if (composed.text) {
    blocks.push(composed.text)
  }
  if (!memory.isPrimed) {
    const repos = hubs.filter(h => active.includes(h.name)).flatMap(h => h.repos)
    const list = await openPassations($, kit, isVaultSession, [...(repo ? [repo] : []), ...repos])
    if (list.length > 0) {
      blocks.push(modelList(list, kit, await $.clock.now()))
    }
  }
  const size = await contextSize($)
  const dir = passationsDir(kit, repo)
  if (size !== null && dir !== null && (await claimNotice($, size, kit.threshold))) {
    blocks.push(thresholdNotice(size, kit.threshold, dir, memory.id, $.plugin.root))
  }

  await saveMemory($, { ...memory, isPrimed: true, served: union(memory.served, composed.served), active })

  // After the memory is saved: the skill's facts see the hubs this message cited. A failure
  // costs the facts only, not the blocks above.
  const skill = skillOfSubmission(e)
  if (skill !== null) {
    try {
      blocks.push(factsBlock(await skillFacts($, kit, skill, cwd)))
    } catch (error) {
      await failed($, s, 'prompt.submit', error)
    }
  }

  return blocks
}

/** `/pyxis:passations`: the banner again, over `outsideRepo`, the session's repository and the active hubs. */
async function passationsCommand($: EngineInterface, s: Settings): Promise<{ text: string }> {
  const t = text(s.language)
  const kit = await ready($, s, 'command.run')
  if (kit === null) {
    return { text: t.vaultMissing(s.vault) }
  }
  const memory = await currentMemory($)
  const active = (await loadHubs($, kit)).hubs.filter(h => memory.active.includes(h.name))
  const repo = await repoRoot($, await $.session.cwd())
  const list = await openPassations($, kit, true, [...(repo ? [repo] : []), ...active.flatMap(h => h.repos)])
  await update($, passations, () => list)
  await update($, isBannerHidden, () => false)
  // The session's repository is named only when no active hub covers it.
  const isRepoNamed = repo !== undefined && !active.some(h => h.repos.includes(repo))
  const scope = [t.outsideRepo, ...active.map(h => h.name), ...(isRepoNamed ? [repoFolder(repo)] : [])].join(', ')

  return { text: list.length === 0 ? t.nonePassations(scope) : t.somePassations(list.length, scope) }
}

export const register: Register = (on, options) => {
  const s = settings(options)
  const t = text(s.language)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await start($, s, e.cwd).catch(error => failed($, s, 'session.start', error))

    return started
  })

  // The desktop app attaches after session.start: a problem found before it is told now.
  // A pane opened at start is the engine's to place; one the person closed stays closed.
  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    await ready($, s, 'session.attach').catch(error => failed($, s, 'session.attach', error))

    return attached
  })

  on('prompt.submit', async ($, e, next) => {
    if (isOwnCommand(e.text)) {
      return next(e)
    }
    // The banner is for the start: the first message hides it, `/pyxis:passations` shows it again.
    if (!(await read($, isBannerHidden))) {
      await update($, isBannerHidden, () => true)
    }
    const context = await contextFor($, s, e).catch(async error => {
      await failed($, s, 'prompt.submit', error)
      return []
    })

    return next(context.length > 0 ? { ...e, context: [...(e.context ?? []), ...context] } : e)
  })

  on('session.measure', async ($, e, next) => {
    await recordSize($, e.context.tokens ?? null, s.threshold)

    return next(e)
  })

  // After a compaction the context holds neither the start block nor the hubs: both go again,
  // and the size is the compacted one until the next measurement. Where an organisation manages
  // Claude Code this hook never runs (seen 2026-10-19): `measureTranscript` sends them again.
  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    if (e.agentId === undefined && e.trigger !== 'precompute' && !('skip' in compacted && compacted.skip)) {
      const memory = await currentMemory($)
      await saveMemory($, { ...memory, isPrimed: false, served: [] })
      await recordSize($, 'tokensAfter' in compacted ? (compacted.tokensAfter ?? null) : null, s.threshold)
    }

    return compacted
  })

  // The menu in the chosen language; the command files carry the English.
  on('command.describe', { command: PASSATIONS_COMMAND }, async ($, e, next) => ({
    ...(await next(e)),
    description: t.passationsCommand,
  }))
  on('command.describe', { command: VAULT_COMMAND }, async ($, e, next) => ({ ...(await next(e)), description: t.vaultCommand }))

  on('command.run', { command: PASSATIONS_COMMAND }, async $ => passationsCommand($, s))

  on('command.run', { command: VAULT_COMMAND }, async $ => {
    const kit = await ready($, s, 'command.run')
    if (kit === null) {
      return { text: t.vaultMissing(s.vault) }
    }
    await openDashboard($, kit)

    return { text: t.dashboardOpened }
  })

  // A response may have ticked a todo, sorted the inbox or resumed a handoff.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && (await isDashboardOpen($))) {
      await refresh($, await loadKit($, s)).catch(error => failed($, s, 'turn.complete', error))
    }

    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => (await renderBanner($, e, s)) ?? next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => renderDashboard($, e, s))
}
