import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { isWithin, loadKit, logLine, report, settings } from './conventions'
import type { Kit, Settings } from './conventions'
import { PANE, isDashboardOpen, openDashboard, refresh, renderDashboard } from './dashboard'
import { citedHubs, composeHubs, hubsForRoots, loadHubs, repoRoot } from './hubs'
import { text } from './i18n'
import { currentMemory, saveMemory } from './memory'
import { modelList, openPassations, passationsDir, renderBanner, repoFolder, thresholdNotice } from './passations'
import { rulesBlock } from './rules'

// The session's values, declared in ../types: they survive a reload of the module.
const passations = atom({ plugin: 'pyxis', key: 'passations' } as const, [])
const isBannerHidden = atom({ plugin: 'pyxis', key: 'isBannerHidden' } as const, false)
const tokens = atom({ plugin: 'pyxis', key: 'tokens' } as const, null)

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])]

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

/** What the model reads with this message: the start block once, cited hubs, the threshold notice. */
async function contextFor($: EngineInterface, s: Settings, message: string): Promise<string[]> {
  const kit = await ready($, s, 'prompt.submit')
  if (kit === null) {
    return []
  }
  const memory = await currentMemory($)
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
    blocks.push(rulesBlock(kit, isVaultSession, memory.id, $.plugin.root))
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
  const size = await read($, tokens)
  const dir = passationsDir(kit, repo)
  if (size !== null && size >= kit.threshold && dir !== null) {
    blocks.push(thresholdNotice(size, kit.threshold, dir, memory.id, $.plugin.root))
  }

  await saveMemory($, { ...memory, isPrimed: true, served: union(memory.served, composed.served), active })

  return blocks
}

/** `/passations`: the banner again, over `outsideRepo`, the session's repository and the active hubs. */
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
    await $.command.register({ name: 'passations', description: t.passationsCommand })
    await $.command.register({ name: 'vault', description: t.vaultCommand })
    const started = await next(e)
    await start($, s, e.cwd).catch(error => failed($, s, 'session.start', error))

    return started
  })

  // The desktop app attaches after session.start: a pane opened before it is not placed there.
  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    try {
      const kit = await loadKit($, s)
      if (kit.isVaultFound && isWithin(await $.session.cwd(), kit.vault) && !(await isDashboardOpen($))) {
        await openDashboard($, kit)
      }
    } catch (error) {
      await failed($, s, 'session.attach', error)
    }

    return attached
  })

  on('prompt.submit', async ($, e, next) => {
    // The banner is for the start: the first message hides it, `/passations` shows it again.
    if (!e.text.trimStart().startsWith('/passations') && !(await read($, isBannerHidden))) {
      await update($, isBannerHidden, () => true)
    }
    const context = await contextFor($, s, e.text).catch(async error => {
      await failed($, s, 'prompt.submit', error)
      return []
    })

    return next(context.length > 0 ? { ...e, context: [...(e.context ?? []), ...context] } : e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, tokens, () => e.context.tokens ?? null)

    return next(e)
  })

  // After a compaction the context holds neither the start block nor the hubs: both go again.
  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    if (e.agentId === undefined && e.trigger !== 'precompute' && !('skip' in compacted && compacted.skip)) {
      const memory = await currentMemory($)
      await saveMemory($, { ...memory, isPrimed: false, served: [] })
    }

    return compacted
  })

  on('command.run', { command: 'passations' }, async $ => passationsCommand($, s))

  on('command.run', { command: 'vault' }, async $ => {
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
