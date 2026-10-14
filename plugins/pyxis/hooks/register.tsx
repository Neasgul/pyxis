import type { EngineInterface, Register } from 'claude-code'

import { isWithin, loadKit, logLine, report, settings } from './conventions'
import type { Kit, Settings } from './conventions'
import { citedHubs, composeHubs, hubsForRoots, loadHubs, repoRoot } from './hubs'
import { currentMemory, saveMemory } from './memory'
import { rulesBlock } from './rules'

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

/** What the model reads with this message: the start block once, then the hubs cited. */
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

  await saveMemory($, { ...memory, isPrimed: true, served: union(memory.served, composed.served), active })

  return blocks
}

export const register: Register = (on, options) => {
  const s = settings(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await ready($, s, 'session.start').catch(error => failed($, s, 'session.start', error))

    return started
  })

  on('prompt.submit', async ($, e, next) => {
    const context = await contextFor($, s, e.text).catch(async error => {
      await failed($, s, 'prompt.submit', error)
      return []
    })

    return next(context.length > 0 ? { ...e, context: [...(e.context ?? []), ...context] } : e)
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
}
