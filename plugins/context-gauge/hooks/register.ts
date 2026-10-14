import type { EngineInterface, Register } from 'claude-code'

import { settings, statusLine } from './line'
import type { Language } from './line'

async function showUsage($: EngineInterface, threshold: number, language: Language) {
  const usage = await $.session.usage()
  $.ui.status(statusLine(usage.context.tokens, usage.rateLimits, threshold, language))
}

export const register: Register = (on, options) => {
  const { threshold, language } = settings(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await showUsage($, threshold, language)

    return started
  })

  // The desktop app attaches after session.start: a status set before it is not drawn there.
  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    await showUsage($, threshold, language)

    return attached
  })

  on('session.measure', async ($, e, next) => {
    $.ui.status(statusLine(e.context.tokens, e.rateLimits, threshold, language))

    return next(e)
  })
}
