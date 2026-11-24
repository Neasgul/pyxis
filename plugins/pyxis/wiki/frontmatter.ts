// A minimal frontmatter reader:
// `key: value`, `key: [a, b]` and block lists (`key:` then `  - a` or `- a`), quotes removed.
// No YAML library: these tools have no dependencies.

/** Where the closing fence starts (the index of its leading newline); -1 without a closed frontmatter. */
function fenceEnd(text: string): number {
  return text.startsWith('---\n') ? text.indexOf('\n---', 3) : -1
}

/** The frontmatter's lines, without the `---` fences; null without a frontmatter or when it is not closed. */
function head(text: string): string[] | null {
  const end = fenceEnd(text)

  return end === -1 ? null : text.slice(4, end).split('\n')
}

const withoutComment = (value: string) => value.replace(/(^|\s)#.*$/, '').trim()

/** The value without the quotes that wrap it whole: `"a" then "b"` is not one quoted string, it is left as is. */
function unquote(value: string): string {
  const v = value.trim()
  const quote = v[0] ?? ''
  const isQuoted = v.length >= 2 && `"'`.includes(quote) && v.at(-1) === quote && !v.slice(1, -1).includes(quote)

  return isQuoted ? v.slice(1, -1) : v
}

/** True when the text opens a frontmatter and never closes it. */
export const isUnclosed = (text: string) => text.startsWith('---\n') && fenceEnd(text) === -1

/** A field's value, quotes removed, `#` kept (a summary may hold one); '' when absent. */
export function field(text: string, name: string): string {
  const line = (head(text) ?? []).find(l => l.startsWith(`${name}:`))

  return line === undefined ? '' : unquote(line.slice(name.length + 1))
}

/** A field's value without its YAML comment: `target: a.md  # proposed` is `a.md`. */
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

/** The text after the frontmatter; the whole text when there is no closed frontmatter. */
export function body(text: string): string {
  const end = fenceEnd(text)
  if (end === -1) {
    return text
  }
  const lineEnd = text.indexOf('\n', end + 1)

  return lineEnd === -1 ? '' : text.slice(lineEnd + 1)
}
