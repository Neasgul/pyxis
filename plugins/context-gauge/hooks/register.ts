import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import { settings, statusLine } from './line'
import type { Language } from './line'

type Shown = { limits: readonly SessionRateLimit[]; window: number | undefined }

// The last figures shown: after a /clear, the windows stay and only the size is unknown.
const last: Shown = { limits: [], window: undefined }

function show($: EngineInterface, tokens: number | undefined, figures: Shown, threshold: number, language: Language) {
  last.limits = figures.limits
  last.window = figures.window
  $.ui.status(statusLine(tokens, figures.limits, threshold, language, figures.window))
}

async function showUsage($: EngineInterface, threshold: number, language: Language) {
  const usage = await $.session.usage()
  show($, usage.context.tokens, { limits: usage.rateLimits, window: usage.context.window }, threshold, language)
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
    show($, e.context.tokens, { limits: e.rateLimits, window: e.context.window }, threshold, language)

    return next(e)
  })

  // A /clear fires no session.start: without this, the old size would stay until the next response.
  on('session.end', async ($, e, next) => {
    const ended = await next(e)
    if (e.reason === 'clear') {
      show($, undefined, { ...last }, threshold, language)
    }

    return ended
  })
}
