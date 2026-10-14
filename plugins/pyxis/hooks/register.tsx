import type { EngineInterface, Register } from 'claude-code'

import { loadKit, logLine, report, settings } from './conventions'
import type { Kit, Settings } from './conventions'

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

export const register: Register = (on, options) => {
  const s = settings(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await ready($, s, 'session.start').catch(error => failed($, s, 'session.start', error))

    return started
  })

  on('prompt.submit', async ($, e, next) => {
    await ready($, s, 'prompt.submit').catch(error => failed($, s, 'prompt.submit', error))

    return next(e)
  })
}
