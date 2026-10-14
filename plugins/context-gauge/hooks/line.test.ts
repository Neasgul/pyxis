import { expect, test } from 'claude-code/testing'
import type { SessionRateLimit } from 'claude-code'

import { DEFAULT_THRESHOLD, settings, statusLine } from './line'

const LIMITS: SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 34.4 },
  { kind: 'seven_day', percentUsed: 12 },
]

test('the line shows the context, the usage windows and the threshold', () => {
  expect(statusLine(182_400, LIMITS, 300_000, 'en')).toBe('ctx 182k / 300k · 5h 34% · 7d 12%')
  expect(statusLine(182_400, LIMITS, 300_000, 'fr')).toBe('ctx 182k / 300k · 5h 34% · 7j 12%')
  expect(statusLine(undefined, [], 300_000, 'en')).toBe('ctx ? / 300k')
})

test('at or past the threshold, the line warns', () => {
  expect(statusLine(300_000, [], 300_000, 'en')).toBe('ctx 300k / 300k · over threshold')
  expect(statusLine(312_000, [], 300_000, 'fr')).toBe('ctx 312k / 300k · seuil dépassé')
  expect(statusLine(299_999, [], 300_000, 'en')).toBe('ctx 300k / 300k')
})

test('unknown windows are left out, percentages are rounded', () => {
  const limits: SessionRateLimit[] = [
    { kind: 'spend_limit', percentUsed: 104 },
    { kind: 'five_hour', percentUsed: 99.6 },
    { kind: 'constructor', percentUsed: 5 },
  ]
  expect(statusLine(10_000, limits, 300_000, 'en')).toBe('ctx 10k / 300k · 5h 100%')
})

test('settings: a threshold under 1000 or not a number falls back to the default', () => {
  expect(DEFAULT_THRESHOLD).toBe(300_000)
  expect(settings({ threshold: 200_000, language: 'fr' })).toEqual({ threshold: 200_000, language: 'fr' })
  expect(settings({ threshold: 0, language: 'en' }).threshold).toBe(300_000)
  expect(settings({ threshold: -5, language: 'en' }).threshold).toBe(300_000)
  expect(settings({ threshold: Number.NaN, language: 'en' }).threshold).toBe(300_000)
  expect(settings({ threshold: '200000', language: 'en' }).threshold).toBe(300_000)
  expect(settings({ threshold: 300, language: 'en' }).threshold).toBe(300_000)
  expect(settings({ threshold: 1_000, language: 'en' }).threshold).toBe(1_000)
  expect(settings({}).language).toBe('en')
  expect(settings({ language: 'de' }).language).toBe('en')
})
