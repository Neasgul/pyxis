// Creates the skeleton of a wiki: the rules, an empty index, a log, and the inbox and raw folders.
//
//   bun wiki/init.ts <wikiDir> <en|fr>
//
// It only creates what is missing: an existing AGENTS.md (the user edits it) or any other
// existing file is left untouched. It prints one line per file it created.

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { renderIndex } from './index'

export type Language = 'en' | 'fr'

const LANGUAGES: readonly string[] = ['en', 'fr']

export const isLanguage = (value: string | undefined): value is Language => LANGUAGES.includes(value ?? '')

/** Creates the missing files of a wiki and returns their paths, relative to the wiki. */
export async function initWiki(wikiDir: string, language: Language): Promise<string[]> {
  const rules = () => Bun.file(join(import.meta.dir, 'templates', `AGENTS.${language}.md`)).text()
  const files: [string, () => string | Promise<string>][] = [
    ['AGENTS.md', rules],
    ['index.md', () => renderIndex([])],
    ['log.md', () => '# Log\n'],
    ['inbox/.gitkeep', () => ''],
    ['raw/.gitkeep', () => ''],
  ]

  const created: string[] = []
  for (const [path, content] of files) {
    const target = join(wikiDir, path)
    if (existsSync(target)) {
      continue
    }
    await mkdir(dirname(target), { recursive: true })
    await Bun.write(target, await content())
    created.push(path)
  }

  return created
}

async function main(args: string[]): Promise<number> {
  const [wikiDir, language] = args
  if (!wikiDir || !isLanguage(language)) {
    console.error('usage: bun wiki/init.ts <wikiDir> <en|fr>')

    return 2
  }
  for (const path of await initWiki(wikiDir, language)) {
    console.log(path)
  }

  return 0
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)))
}
