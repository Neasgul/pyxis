import type { EngineInterface } from 'claude-code'

import { expandHome, isWithin, listEntries } from './conventions'
import type { Kit } from './conventions'
import { listField } from './frontmatter'

/** Characters the section may take with one message, header included. */
export const SECTION_BUDGET = 9000

/** At the wiki's root, folders that hold no page (pending facts, raw sources). Dot-entries are skipped everywhere. */
const NOT_PAGES = ['inbox', 'raw']

const isHidden = (name: string) => name.startsWith('.')

/** Deepest folder level read under a wiki folder: a link back up the tree stops there. */
const MAX_DEPTH = 6

const withoutTrailingSlash = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path)

const sectionHeader = (wiki: string, folder: string) =>
  `Wiki index for \`${folder}\` (${wiki}/index.md). Open a page at ${wiki}/<path> when you need it.`

/** The repositories the wiki knows, from each page's `repos:`; `~` expanded, relative paths ignored. */
export function wikiRepos(
  pages: { folder: string; repos: string[] }[],
  home: string,
): { folder: string; repo: string }[] {
  return pages.flatMap(page =>
    page.repos
      .map(repo => withoutTrailingSlash(expandHome(repo, home)))
      .filter(repo => repo.startsWith('/'))
      .map(repo => ({ folder: page.folder, repo })),
  )
}

/** The wiki folder of the repository `cwd` is in, or null. */
export function folderForCwd(cwd: string, repos: { folder: string; repo: string }[]): string | null {
  return repos.find(({ repo }) => isWithin(withoutTrailingSlash(cwd), repo))?.folder ?? null
}

/** The `.md` files under `path`, as paths relative to the wiki. */
async function markdownFiles($: EngineInterface, wiki: string, path: string, depth: number): Promise<string[]> {
  const nested = await Promise.all(
    (await listEntries($, `${wiki}/${path}`)).map(async entry => {
      if (isHidden(entry.name)) {
        return []
      }
      const relative = `${path}/${entry.name}`
      if (entry.kind === 'file') {
        return entry.name.endsWith('.md') ? [relative] : []
      }

      return entry.kind === 'dir' && depth < MAX_DEPTH ? markdownFiles($, wiki, relative, depth + 1) : []
    }),
  )

  return nested.flat()
}

/** Each page's folder and `repos:`; a page that cannot be read counts for none. */
async function pagesOf($: EngineInterface, wiki: string): Promise<{ folder: string; repos: string[] }[]> {
  const folders = (await listEntries($, wiki)).filter(e => e.kind === 'dir' && !NOT_PAGES.includes(e.name) && !isHidden(e.name))
  const paths = (await Promise.all(folders.map(f => markdownFiles($, wiki, f.name, 1)))).flat()

  return Promise.all(
    paths.map(async path => ({
      folder: path.split('/')[0] ?? '',
      repos: listField((await $.fs.read(`${wiki}/${path}`).catch(() => '')) || '', 'repos'),
    })),
  )
}

/** The `## <folder>` section of the index, up to the next `## `; null when the index does not list the folder. */
function sectionOf(index: string, folder: string): string | null {
  const lines = index.split('\n')
  const start = lines.indexOf(`## ${folder}`)
  if (start === -1) {
    return null
  }
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '))

  return lines.slice(start, end === -1 ? undefined : end).join('\n').trimEnd()
}

/**
 * What the model reads of the wiki's index with its first message: the section of the folder
 * whose `repos:` holds the session's directory. Null without a wiki, a folder for the directory,
 * an index, or when the text goes over `SECTION_BUDGET`.
 */
export async function indexSection($: EngineInterface, kit: Kit, cwd: string): Promise<string | null> {
  if (!kit.isWikiFound) {
    return null
  }
  const folder = folderForCwd(cwd, wikiRepos(await pagesOf($, kit.wiki), kit.home))
  if (folder === null) {
    return null
  }
  const index = await $.fs.read(`${kit.wiki}/index.md`).catch(() => null)
  const section = index === null ? null : sectionOf(index, folder)
  if (section === null) {
    return null
  }
  const text = `${sectionHeader(kit.wiki, folder)}\n\n${section}`

  return text.length <= SECTION_BUDGET ? text : null
}
