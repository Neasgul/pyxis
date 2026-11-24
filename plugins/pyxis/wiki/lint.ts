// The deterministic half of the wiki's health check. It reads, it never writes.
//
//   bun wiki/lint.ts <wikiDir>
//
// Prints one `<level> <path>: <message>` per finding, then `N errors, M warnings`.
// Exits 1 when there is an error. The judgement half (contradictions, stale claims) is the
// `/pyxis:lint` skill's.

import { existsSync } from 'node:fs'
import { join, posix } from 'node:path'
import { bareField } from './frontmatter'
import { renderIndex } from './index'
import { loadPages, pageProblems } from './pages'

export type Finding = { level: 'error' | 'warning'; path: string; message: string }

/** Shapes that are secrets whatever stands around them. */
const SECRET_SHAPES = [
  /AKIA[0-9A-Z]{16}/,
  /BEGIN [A-Z ]*PRIVATE KEY/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/,
  /\bglpat-[\w-]{16,}/,
  // Credentials inside a URL: scheme://user:password@host
  /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i,
]

/**
 * `password = …`, `SECRET_KEY: …`, `"token": "…"`: a secret-looking name, then a value.
 * A colon sits right after the name: `name : value`, with a space before the colon, is French
 * prose, not an assignment.
 */
const ASSIGNMENT = /(?:password|passwd|secret|token|api[_-]?key)[\w-]*["'`*]*(?:\s*=|:)\s*["'`]?([^\s"'`]{8,})/gi

/** A value that looks like a secret and not like a name or a path: it mixes digits or cases. */
function looksSecret(value: string): boolean {
  if (/^(\/|~|\.\/|\.\.\/)/.test(value) || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return false
  }

  return /\d/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value))
}

const hasSecret = (line: string) =>
  SECRET_SHAPES.some(shape => shape.test(line)) || [...line.matchAll(ASSIGNMENT)].some(match => looksSecret(match[1] ?? ''))

const isFence = (line: string) => line.trimStart().startsWith('```')

/** The text's lines with their number (from 1) and whether they are inside a code block. */
function lines(text: string): { n: number; line: string; inCode: boolean }[] {
  let inCode = false

  return text.split('\n').map((line, i) => {
    const fence = isFence(line)
    const entry = { n: i + 1, line, inCode: inCode || fence }
    if (fence) {
      inCode = !inCode
    }

    return entry
  })
}

const isRelative = (target: string) =>
  target !== '' && !target.startsWith('#') && !target.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(target)

/**
 * The relative link targets of a page, code left out: inline links (`[a](x.md)`, with a title or
 * angle brackets) and reference definitions (`[ref]: x.md`). No anchor-only link, no URL, no absolute path.
 */
export function relativeLinks(text: string): string[] {
  const targets: string[] = []
  for (const { line, inCode } of lines(text)) {
    if (inCode) {
      continue
    }
    const prose = line.replace(/`[^`]*`/g, '')
    for (const match of prose.matchAll(/\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g)) {
      targets.push(match[1] ?? match[2] ?? '')
    }
    const definition = /^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/.exec(prose)
    if (definition) {
      targets.push(definition[1] ?? definition[2] ?? '')
    }
  }

  return targets.filter(isRelative)
}

/** Where a link written in the file `from` points, relative to the wiki: anchor removed, `%20` decoded. */
export function resolveLink(from: string, target: string): string {
  const path = target.split('#')[0] ?? ''
  let decoded = path
  try {
    decoded = decodeURIComponent(path)
  } catch {
    // Not percent-encoded after all: keep it as written.
  }

  return posix.normalize(posix.join(posix.dirname(from), decoded)).replace(/\/$/, '')
}

const secretLines = (text: string) =>
  lines(text)
    .filter(({ line }) => hasSecret(line))
    .map(({ n }) => `possible secret: line ${n}`)

export async function lintWiki(wikiDir: string): Promise<Finding[]> {
  const findings: Finding[] = []
  const add = (level: Finding['level'], path: string, message: string) => findings.push({ level, path, message })
  const pages = await loadPages(wikiDir)

  // Every file and folder of the wiki, as written on disk: a link is matched case-sensitively.
  const existing = new Set<string>()
  for await (const path of new Bun.Glob('**/*').scan({ cwd: wikiDir, dot: true })) {
    const parts = path.replaceAll('\\', '/').split('/')
    parts.forEach((_, i) => existing.add(parts.slice(0, i + 1).join('/')))
  }

  const linked = new Set<string>()
  let hasProblem = false
  for (const page of pages) {
    for (const problem of pageProblems(page)) {
      hasProblem = true
      add('error', page.path, problem)
    }
    for (const target of relativeLinks(page.text)) {
      const resolved = resolveLink(page.path, target)
      if (!existing.has(resolved)) {
        add('error', page.path, `broken link: ${target}`)
      } else if (resolved !== page.path) {
        linked.add(resolved)
      }
    }
    for (const message of secretLines(page.text)) {
      add('error', page.path, message)
    }
    for (const source of page.sources.filter(source => source.startsWith('raw/'))) {
      if (!existing.has(source)) {
        add('error', page.path, `missing source: ${source}`)
      }
    }
    for (const [name, value] of [['triggers', page.triggers.length], ['sources', page.sources.length], ['updated', page.updated]] as const) {
      if (!value) {
        add('warning', page.path, `no ${name}`)
      }
    }
    for (const { n, line, inCode } of lines(page.text)) {
      if (!inCode && line.includes('TODO(verify)')) {
        add('warning', page.path, `TODO(verify): line ${n}`)
      }
    }
  }
  for (const page of pages) {
    if (!linked.has(page.path) && !page.path.endsWith('/overview.md')) {
      add('warning', page.path, 'no inbound link')
    }
  }

  if (!hasProblem) {
    const index = Bun.file(join(wikiDir, 'index.md'))
    if (pages.length > 0 && (!(await index.exists()) || (await index.text()) !== renderIndex(pages))) {
      add('error', 'index.md', 'index.md is out of date')
    }
  }

  if (existsSync(join(wikiDir, 'inbox'))) {
    for await (const name of new Bun.Glob('**/*.md').scan({ cwd: join(wikiDir, 'inbox') })) {
      const path = `inbox/${name}`
      const text = await Bun.file(join(wikiDir, path)).text()
      for (const message of secretLines(text)) {
        add('error', path, message)
      }
      add('warning', path, `pending since ${bareField(text, 'created') || '?'}, target ${bareField(text, 'target') || '?'}`)
    }
  }

  // Raw sources are never edited, so a secret there has to be caught: text files only.
  for (const path of [...existing].filter(path => path.startsWith('raw/') && /\.(md|txt)$/i.test(path)).sort()) {
    for (const message of secretLines(await Bun.file(join(wikiDir, path)).text())) {
      add('error', path, message)
    }
  }

  const rank = (finding: Finding) => (finding.level === 'error' ? 0 : 1)

  return findings.sort(
    (a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path) || a.message.localeCompare(b.message, undefined, { numeric: true }),
  )
}

if (import.meta.main) {
  const wikiDir = process.argv[2]
  if (!wikiDir) {
    console.error('usage: bun wiki/lint.ts <wikiDir>')
    process.exit(2)
  }
  const findings = await lintWiki(wikiDir)
  for (const { level, path, message } of findings) {
    console.log(`${level} ${path}: ${message}`)
  }
  const errors = findings.filter(finding => finding.level === 'error').length
  console.log(`${errors} errors, ${findings.length - errors} warnings`)
  process.exit(errors > 0 ? 1 : 0)
}
