import { expect, test } from 'claude-code/testing'

import { bareField, field, isUnclosed, listField, markDone } from './frontmatter'
import { text } from './i18n'

const NOTE = `---
created: 2026-10-12
tags: [ai/passation]
status: active
description: "Kit for Victoire. #1 left: batch 1."
repos:
  - ~/Projects/otterbackend
  - ~/Projects/otter_frontend # the web app
triggers: [verbena, 'sandcastles']
---

## Goal

status: active in the body, left alone.
`

test('fields: quotes removed, comments kept in a value, removed from a bare one and from lists', () => {
  expect(field(NOTE, 'status')).toBe('active')
  expect(field(NOTE, 'description')).toBe('Kit for Victoire. #1 left: batch 1.')
  expect(field(NOTE, 'absent')).toBe('')
  expect(field('no frontmatter', 'status')).toBe('')
  expect(bareField('---\nstatus: archived   # old\n---\n', 'status')).toBe('archived')
  expect(bareField('---\nstatus: "archived"\n---\n', 'status')).toBe('archived')
  expect(listField(NOTE, 'repos')).toEqual(['~/Projects/otterbackend', '~/Projects/otter_frontend'])
  expect(listField(NOTE, 'triggers')).toEqual(['verbena', 'sandcastles'])
  expect(listField('---\ntriggers: solo\n---\n', 'triggers')).toEqual(['solo'])
  expect(listField(NOTE, 'absent')).toEqual([])
})

test('unclosed frontmatter: no fields, flagged', () => {
  expect(isUnclosed('---\nstatus: active\n\nno end\n')).toBe(true)
  expect(isUnclosed(NOTE)).toBe(false)
  expect(isUnclosed('no frontmatter')).toBe(false)
  expect(field('---\nstatus: active\n', 'status')).toBe('')
})

test('markDone: the frontmatter only', () => {
  expect(markDone(NOTE)).toBe(NOTE.replace('status: active', 'status: done'))
  expect(markDone('no frontmatter\nstatus: active\n')).toBe('no frontmatter\nstatus: active\n')
})

test('ages, in both languages', () => {
  expect([0, 1, 5].map(text('fr').age)).toEqual(["aujourd'hui", 'hier', 'il y a 5 j'])
  expect([0, 1, 5].map(text('en').age)).toEqual(['today', 'yesterday', '5 days ago'])
})

test('listField: a block list without indent, as YAML allows', () => {
  const note = '---\nrepos:\n- ~/Projects/a\n- ~/Projects/b  # old\nstatus: active\n---\n'
  expect(listField(note, 'repos')).toEqual(['~/Projects/a', '~/Projects/b'])
  expect(bareField(note, 'status')).toBe('active')
})
