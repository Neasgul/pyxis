import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { effectiveThreshold, isWithin, loadKit, logLine, onDisk, report, settings } from './conventions'
import type { Kit, Settings } from './conventions'
import { repoRoot } from './git'
import { text } from './i18n'
import { currentMemory, measureTranscript, saveMemory } from './memory'
import {
  claimNotice,
  contextSize,
  lastThreshold,
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

// The commands are files of the plugin (`commands/`), so that the desktop app lists them too:
// they run as `/pyxis:<name>`, and the hooks below answer them without the model.
const PASSATIONS_COMMAND = 'pyxis:passations'

/** pyxis's own commands answer without the model: what goes with a message waits for the next. */
const isOwnCommand = (prompt: string) => /^\/pyxis:passations(\s|$)/.test(prompt.trimStart())

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

/** At start: the banner lists the open handoffs of the session's repository, and those outside repositories in the vault. */
async function start($: EngineInterface, s: Settings, cwd: string) {
  const kit = await ready($, s, 'session.start')
  if (kit === null) {
    return
  }
  const repo = await repoRoot($, cwd)
  const list = await openPassations($, kit, isWithin(cwd, kit.vault), repo ? [repo] : [])
  await update($, passations, () => list)
}

/** What the model reads with this message: the start block and the open handoffs once, the threshold notice once per crossing, a skill's facts. */
async function contextFor($: EngineInterface, s: Settings, e: { text: string; command?: { name: string } }): Promise<string[]> {
  const kit = await ready($, s, 'prompt.submit')
  if (kit === null) {
    return []
  }
  const memory = await measureTranscript($, await currentMemory($))
  const cwd = await $.session.cwd()
  const repo = await repoRoot($, cwd)
  const isVaultSession = isWithin(cwd, kit.vault)
  const blocks: string[] = []

  if (!memory.isPrimed) {
    blocks.push(rulesBlock(await onDisk($, kit), memory.id, $.plugin.root))
    const list = await openPassations($, kit, isVaultSession, repo ? [repo] : [])
    if (list.length > 0) {
      blocks.push(modelList(list, kit, await $.clock.now()))
    }
  }
  const measured = await contextSize($)
  const dir = passationsDir(kit, repo)
  if (measured !== null && dir !== null && (await claimNotice($, measured.size, measured.threshold))) {
    blocks.push(thresholdNotice(measured.size, measured.threshold, dir, memory.id, $.plugin.root))
  }

  await saveMemory($, { ...memory, isPrimed: true })

  // A failure costs the facts only, not the blocks above.
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

/** `/pyxis:passations`: the banner again, over `outsideRepo` and the session's repository. */
async function passationsCommand($: EngineInterface, s: Settings): Promise<{ text: string }> {
  const t = text(s.language)
  const kit = await ready($, s, 'command.run')
  if (kit === null) {
    return { text: t.vaultMissing((await loadKit($, s)).vault) }
  }
  const repo = await repoRoot($, await $.session.cwd())
  const list = await openPassations($, kit, true, repo ? [repo] : [])
  await update($, passations, () => list)
  await update($, isBannerHidden, () => false)
  const scope = [t.outsideRepo, ...(repo !== undefined ? [repoFolder(repo)] : [])].join(', ')

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
    await recordSize($, e.context.tokens ?? null, effectiveThreshold(s.threshold, e.context.window))

    return next(e)
  })

  // After a compaction the context no longer holds the start block: it goes again, and the size is the compacted one until the next measurement. Where an organisation manages
  // Claude Code this hook never runs (seen 2026-10-19): `measureTranscript` sends them again.
  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    if (e.agentId === undefined && e.trigger !== 'precompute' && !('skip' in compacted && compacted.skip)) {
      const memory = await currentMemory($)
      await saveMemory($, { ...memory, isPrimed: false })
      const threshold = await lastThreshold($, s.threshold)
      await recordSize($, 'tokensAfter' in compacted ? (compacted.tokensAfter ?? null) : null, threshold)
    }

    return compacted
  })

  // The menu in the chosen language; the command files carry the English.
  on('command.describe', { command: PASSATIONS_COMMAND }, async ($, e, next) => ({
    ...(await next(e)),
    description: t.passationsCommand,
  }))

  on('command.run', { command: PASSATIONS_COMMAND }, async $ => passationsCommand($, s))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => (await renderBanner($, e, s)) ?? next(e))
}
