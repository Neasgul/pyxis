import { join } from 'node:path'
import { field, isUnclosed, listField } from './frontmatter'

/** A page is at most this many characters, frontmatter included. */
export const PAGE_LIMIT = 2500

/** Files at the wiki's root that are not pages. */
const RESERVED = ['index.md', 'log.md', 'AGENTS.md']

/** Folders that hold no page: pending facts and raw sources. */
const NOT_PAGES = ['inbox', 'raw']

export type Page = {
  /** Relative to the wiki folder, with `/`. */
  path: string
  /** The first segment of the path; '' for a file at the wiki's root. */
  folder: string
  summary: string
  triggers: string[]
  sources: string[]
  /** Repositories this service lives in, as written (`~` allowed); set on a folder's overview. */
  repos: string[]
  updated: string
  text: string
}

export function parsePage(path: string, text: string): Page {
  return {
    path,
    folder: path.includes('/') ? (path.split('/')[0] ?? '') : '',
    summary: field(text, 'summary'),
    triggers: listField(text, 'triggers'),
    sources: listField(text, 'sources'),
    repos: listField(text, 'repos'),
    updated: field(text, 'updated'),
    text,
  }
}

/** What keeps a page out of the index; empty when the page is fine. */
export function pageProblems(page: Page): string[] {
  const problems: string[] = []
  if (!page.text.startsWith('---\n')) {
    problems.push('no frontmatter')
  } else if (isUnclosed(page.text)) {
    problems.push('frontmatter not closed')
  } else if (!page.summary) {
    problems.push('no summary')
  }
  const size = [...page.text].length
  if (size > PAGE_LIMIT) {
    problems.push(`over ${PAGE_LIMIT} characters (${size})`)
  }
  if (!page.folder) {
    problems.push('not in a folder')
  }

  return problems
}

/** Every page of the wiki, sorted by path. */
export async function loadPages(wikiDir: string): Promise<Page[]> {
  const paths: string[] = []
  for await (const path of new Bun.Glob('**/*.md').scan({ cwd: wikiDir })) {
    const posix = path.replaceAll('\\', '/')
    const first = posix.split('/')[0] ?? ''
    if (!RESERVED.includes(posix) && !NOT_PAGES.includes(first)) {
      paths.push(posix)
    }
  }
  paths.sort()

  return Promise.all(paths.map(async path => parsePage(path, await Bun.file(join(wikiDir, path)).text())))
}
