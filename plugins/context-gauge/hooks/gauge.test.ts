import { expect, test } from 'claude-code/testing'
import type { On, SessionRateLimit } from 'claude-code'

const LIMITS: SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 34.4 },
  { kind: 'seven_day', percentUsed: 12 },
]

/** The engine under the plugin: the status line, the session's usage and its measurements. */
function engine(on: On, startTokens: number | undefined) {
  const statuses: (string | undefined)[] = []
  on('ui.status', (_$, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { context: { tokens: startTokens, window: 1_000_000 }, rateLimits: LIMITS },
  }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))

  return { statuses }
}

const start = { cwd: '/tmp/project', surface: 'desktop' as const, isInteractive: true }
const measure = (tokens: number) => ({
  context: { tokens, window: 1_000_000 },
  rateLimits: LIMITS,
  changed: ['context' as const],
})

test('the line appears at session start, before any response', async ($, on) => {
  const { statuses } = engine(on, undefined)
  await $.session.start(start)
  expect(statuses.at(-1)).toBe('ctx ? / 300k · 5h 34% · 7d 12%')
})

test('each measurement updates the line', async ($, on) => {
  const { statuses } = engine(on, 50_000)
  await $.session.start(start)
  expect(statuses.at(-1)).toBe('ctx 50k / 300k · 5h 34% · 7d 12%')
  await $.session.measure(measure(310_000))
  expect(statuses.at(-1)).toBe('ctx 310k / 300k · 5h 34% · 7d 12% · over threshold')
})

test('options: French and a lower threshold', { options: { threshold: 200_000, language: 'fr' } }, async ($, on) => {
  const { statuses } = engine(on, 50_000)
  await $.session.measure(measure(210_000))
  expect(statuses.at(-1)).toBe('ctx 210k / 200k · 5h 34% · 7j 12% · seuil dépassé')
})

test('a language outside en | fr falls back to English', { options: { language: 'de' } }, async ($, on) => {
  const { statuses } = engine(on, 50_000)
  await $.session.measure(measure(100_000))
  expect(statuses.at(-1)).toBe('ctx 100k / 300k · 5h 34% · 7d 12%')
})
