import type { PluginOptions, SessionRateLimit } from 'claude-code'

export type Language = 'en' | 'fr'

export const DEFAULT_THRESHOLD = 300_000

type Text = { windows: Readonly<Record<string, string | undefined>>; over: string }

const TEXT: Record<Language, Text> = {
  en: { windows: { five_hour: '5h', seven_day: '7d' }, over: 'over threshold' },
  fr: { windows: { five_hour: '5h', seven_day: '7j' }, over: 'seuil dépassé' },
}

const inK = (tokens: number) => `${Math.round(tokens / 1000)}k`

/** The plugin's options, validated: a threshold that is not a positive number falls back to the default. */
export function settings(options: PluginOptions): { threshold: number; language: Language } {
  const threshold = options.threshold
  const isValid = typeof threshold === 'number' && Number.isFinite(threshold) && threshold > 0

  return {
    threshold: isValid ? threshold : DEFAULT_THRESHOLD,
    language: options.language === 'fr' ? 'fr' : 'en',
  }
}

/** The status line: `ctx 182k / 300k · 5h 34% · 7d 12%`, plus a warning from the threshold on. */
export function statusLine(
  tokens: number | undefined,
  limits: readonly SessionRateLimit[],
  threshold: number,
  language: Language,
): string {
  const text = TEXT[language]
  const ctx = `ctx ${tokens === undefined ? '?' : inK(tokens)} / ${inK(threshold)}`
  const usage = limits.flatMap(l => {
    const label = Object.prototype.hasOwnProperty.call(text.windows, l.kind) ? text.windows[l.kind] : undefined
    return label === undefined ? [] : [`${label} ${Math.round(l.percentUsed)}%`]
  })
  const warning = tokens !== undefined && tokens >= threshold ? [text.over] : []

  return [ctx, ...usage, ...warning].join(' · ')
}
