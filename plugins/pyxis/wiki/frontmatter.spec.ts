import { expect, test } from 'bun:test'
import { bareField, body, field, isUnclosed, listField } from './frontmatter'

const note =
  '---\nsummary: "Deploy: ECS # staging"\ntriggers: [ecs, make deploy]\nsources:\n  - a.md\n  - b.md\n---\n\n# Title\ntext\n'

test('field returns the value without quotes, and keeps : and #', () => {
  expect(field(note, 'summary')).toBe('Deploy: ECS # staging')
  expect(field(note, 'missing')).toBe('')
})

test('field only removes quotes that wrap the whole value', () => {
  const summary = (value: string) => field(`---\nsummary: ${value}\n---\n`, 'summary')

  expect(summary('"make push" then "make deploy"')).toBe('"make push" then "make deploy"')
  expect(summary("'staging' vs 'prod'")).toBe("'staging' vs 'prod'")
  expect(summary('Deploy # staging')).toBe('Deploy # staging')
})

test('listField reads inline and block lists', () => {
  expect(listField(note, 'triggers')).toEqual(['ecs', 'make deploy'])
  expect(listField(note, 'sources')).toEqual(['a.md', 'b.md'])
  expect(listField(note, 'missing')).toEqual([])
})

test('body drops the frontmatter, or returns the text when there is none', () => {
  expect(body(note)).toBe('\n# Title\ntext\n')
  expect(body('# Title\n')).toBe('# Title\n')
})

test('isUnclosed spots a frontmatter that never closes', () => {
  expect(isUnclosed('---\nsummary: x\n# Title\n')).toBe(true)
  expect(isUnclosed(note)).toBe(false)
})

test('bareField drops a YAML comment, field keeps it', () => {
  const note = '---\ntarget: billing/cd.md  # the page proposed\n---\n'

  expect(bareField(note, 'target')).toBe('billing/cd.md')
  expect(bareField(note, 'missing')).toBe('')
})
