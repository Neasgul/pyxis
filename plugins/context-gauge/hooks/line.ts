import type { PluginOptions, SessionRateLimit } from 'claude-code'

export type Language = 'en' | 'fr'

// Same default as `userConfig.threshold` in plugin.json.
export const DEFAULT_THRESHOLD = 300_000

// Below this, a value was most likely typed in thousands (`300` for 300k).
const MIN_THRESHOLD = 1_000

/** Share of the model's window the threshold may take: past it, a smaller window would never reach the option. */
const WINDOW_SHARE = 0.75

/** The threshold for a model's window: the option, or 75% of a window too small for it. */
export const effectiveThreshold = (threshold: number, window: number | undefined) =>
  window === undefined ? threshold : Math.min(threshold, Math.round(window * WINDOW_SHARE))

type Text = { windows: Readonly<Record<string, string | undefined>>; over: string }

const TEXT: Record<Language, Text> = {
  en: { windows: { five_hour: '5h', seven_day: '7d' }, over: 'over threshold' },
  fr: { windows: { five_hour: '5h', seven_day: '7j' }, over: 'seuil dépassé' },
}

const inK = (tokens: number) => `${Math.round(tokens / 1000)}k`

/** The plugin's options, validated: a threshold that is not a number of at least 1000 falls back to the default. */
export function settings(options: PluginOptions): { threshold: number; language: Language } {
  const threshold = options.threshold
  const isValid = typeof threshold === 'number' && Number.isFinite(threshold) && threshold >= MIN_THRESHOLD

  return {
    threshold: isValid ? threshold : DEFAULT_THRESHOLD,
    language: options.language === 'fr' ? 'fr' : 'en',
  }
}

/**
 * The status line: `ctx 182k / 300k · 5h 34% · 7d 12%`, plus a warning from the threshold on.
 * The usage windows come in the order of `TEXT`, whatever the engine's.
 */
export function statusLine(
  tokens: number | undefined,
  limits: readonly SessionRateLimit[],
  option: number,
  language: Language,
  window?: number,
): string {
  const text = TEXT[language]
  const threshold = effectiveThreshold(option, window)
  const ctx = `ctx ${tokens === undefined ? '?' : inK(tokens)} / ${inK(threshold)}`
  const usage = Object.entries(text.windows).flatMap(([kind, label]) => {
    const limit = limits.find(l => l.kind === kind)
    return limit === undefined || label === undefined ? [] : [`${label} ${Math.round(limit.percentUsed)}%`]
  })
  const warning = tokens !== undefined && tokens >= threshold ? [text.over] : []

  return [ctx, ...usage, ...warning].join(' · ')
}
