import type { Register } from 'claude-code'

import { settings, statusLine } from './line'

export const register: Register = (on, options) => {
  const { threshold, language } = settings(options)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const usage = await $.session.usage()
    $.ui.status(statusLine(usage.context.tokens, usage.rateLimits, threshold, language))

    return started
  })

  on('session.measure', async ($, e, next) => {
    $.ui.status(statusLine(e.context.tokens, e.rateLimits, threshold, language))

    return next(e)
  })
}
