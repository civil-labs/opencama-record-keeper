import { describe, expect, test } from 'vitest'
import { ConfigError, parseConfig } from './config.ts'

const valid = {
  gatewayUrl: 'http://localhost:8080/',
  clientId: 'civil-os-dev',
  basemapStyleUrl: 'https://tiles.example.org/styles/positron',
}

describe('parseConfig', () => {
  test('accepts a valid config and trims trailing slashes', () => {
    expect(parseConfig(valid)).toEqual({
      ...valid,
      gatewayUrl: 'http://localhost:8080',
    })
  })

  test.each([
    ['not an object', 'nope'],
    ['null', null],
    ['an array', []],
    ['missing gatewayUrl', { ...valid, gatewayUrl: undefined }],
    ['empty clientId', { ...valid, clientId: '' }],
    ['non-string clientId', { ...valid, clientId: 7 }],
    ['malformed URL', { ...valid, gatewayUrl: 'localhost:8080' }],
    ['non-http URL', { ...valid, basemapStyleUrl: 'ftp://example.org/style' }],
  ])('rejects %s', (_name, raw) => {
    expect(() => parseConfig(raw)).toThrow(ConfigError)
  })
})
