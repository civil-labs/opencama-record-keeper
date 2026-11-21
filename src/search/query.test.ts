import { describe, expect, test } from 'vitest'
import { isSearchable, MAX_QUERY_LENGTH, normalizeQuery } from './query.ts'

describe('normalizeQuery', () => {
  test.each([
    ['12 Fixture Way', '12 fixture way'],
    ['12, FIXTURE   way.', '12 fixture way'],
    ['  -- 12 -- ', '12'],
    ['Apt #4/B', 'apt 4 b'],
    ['Café Rd', 'café rd'],
    ['', ''],
    ['?!', ''],
  ])('%j → %j', (raw, expected) => {
    expect(normalizeQuery(raw)).toBe(expected)
  })
})

describe('isSearchable', () => {
  test.each([
    ['12', false],
    ['1-2-3', true],
    ['  ab ', false],
    ['a b', false],
    ['abc', true],
    ['é1ü', true],
    ['!!!', false],
    ['', false],
  ])('%j → %s', (raw, expected) => {
    expect(isSearchable(raw)).toBe(expected)
  })

  test('the 200-character limit applies to the text as typed', () => {
    expect(isSearchable('a'.repeat(MAX_QUERY_LENGTH))).toBe(true)
    expect(isSearchable('a'.repeat(MAX_QUERY_LENGTH + 1))).toBe(false)
    // Punctuation counts towards the raw limit even though it's removed.
    expect(isSearchable('abc' + '-'.repeat(MAX_QUERY_LENGTH - 2))).toBe(false)
  })

  test('the limit counts characters, not UTF-16 code units', () => {
    expect(isSearchable('𝟙'.repeat(MAX_QUERY_LENGTH))).toBe(true)
  })
})
