// A minimal frontmatter reader, as hub-inject.py had: `key: value`, `key: [a, b]` and block
// lists (`key:` then `  - a` or `- a`), quotes removed. No YAML library: a mod has no dependencies.

/** The frontmatter's lines, without the `---` fences; null without a frontmatter or when it is not closed. */
function head(text: string): string[] | null {
  if (!text.startsWith('---\n')) {
    return null
  }
  const end = text.indexOf('\n---', 3)

  return end === -1 ? null : text.slice(4, end).split('\n')
}

const withoutComment = (value: string) => value.replace(/(^|\s)#.*$/, '').trim()

function unquote(value: string): string {
  const v = value.trim()
  const isQuoted = v.length >= 2 && v[0] === v.at(-1) && `"'`.includes(v[0] ?? '')

  return isQuoted ? v.slice(1, -1) : v
}

/** True when the note opens a frontmatter and never closes it. */
export const isUnclosed = (text: string) => text.startsWith('---\n') && head(text) === null

/** A field's value, quotes removed, comment kept (a description may hold a `#`); '' when absent. */
export function field(text: string, name: string): string {
  const line = (head(text) ?? []).find(l => l.startsWith(`${name}:`))

  return line === undefined ? '' : unquote(line.slice(name.length + 1))
}

/** A field's value without its YAML comment: `status: archived  # old` is `archived`. */
export const bareField = (text: string, name: string) => unquote(withoutComment(field(text, name)))

/** A list field, inline (`[a, b]`), as a block (`  - a`, indented or not) or a single value; comments removed. */
export function listField(text: string, name: string): string[] {
  const lines = head(text) ?? []
  const i = lines.findIndex(l => l.startsWith(`${name}:`))
  if (i === -1) {
    return []
  }
  const value = withoutComment(lines[i]?.slice(name.length + 1) ?? '')
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .filter(v => v.trim())
      .map(unquote)
  }
  if (value) {
    return [unquote(value)]
  }
  const items: string[] = []
  for (const line of lines.slice(i + 1)) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (!item) {
      break
    }
    items.push(unquote(withoutComment(item[1] ?? '')))
  }

  return items
}

/** The note with `status: done` in its frontmatter, its body untouched. */
export function markDone(text: string): string {
  const lines = head(text)
  if (lines === null) {
    return text
  }
  const end = 4 + lines.join('\n').length

  return text.slice(0, end).replace(/^status:.*$/m, 'status: done') + text.slice(end)
}
