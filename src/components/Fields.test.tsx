import { act, cleanup, render, screen } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, describe, expect, test } from 'vitest'
import { Fields, formatTimestamp, isWebUrl, type Field } from './Fields.tsx'

afterEach(cleanup)

const ID = '2b0c7a52-9f0e-4c1e-8a57-3c3f1e6d9a10'

async function renderFields(fields: Field[]) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <Fields fields={fields} /> }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await act(() => router.load())
  render(<RouterProvider router={router} />)
}

/** The <dd> text for a field label. */
function valueOf(label: string) {
  const dt = screen.getByText(label, { selector: 'dt' })
  return dt.nextElementSibling as HTMLElement
}

describe('Fields', () => {
  test('renders a <dl> in the given order', async () => {
    await renderFields([
      { label: 'B', kind: 'text', value: 'b' },
      { label: 'A', kind: 'text', value: 'a' },
    ])
    const terms = [...document.querySelectorAll('dl dt')].map((e) => e.textContent)
    expect(terms).toEqual(['B', 'A'])
  })

  test('text: as returned, with no formatting', async () => {
    await renderFields([
      { label: 'Decimal', kind: 'text', value: '1234.5000' },
      { label: 'Number', kind: 'text', value: 0 },
      { label: 'Bigint', kind: 'text', value: 9007199254740993n },
      { label: 'Bool', kind: 'text', value: false },
    ])
    expect(valueOf('Decimal').textContent).toBe('1234.5000')
    expect(valueOf('Number').textContent).toBe('0')
    expect(valueOf('Bigint').textContent).toBe('9007199254740993')
    expect(valueOf('Bool').textContent).toBe('false')
  })

  test('empty values show —', async () => {
    await renderFields([
      { label: 'Text', kind: 'text', value: '' },
      { label: 'Undefined', kind: 'text', value: undefined },
      { label: 'Record', kind: 'record', type: 'party', id: '' },
      { label: 'Time', kind: 'timestamp', value: undefined },
      { label: 'Json', kind: 'json', value: '' },
      { label: 'Url', kind: 'url', value: undefined },
    ])
    for (const label of ['Text', 'Undefined', 'Record', 'Time', 'Json', 'Url']) {
      expect(valueOf(label).textContent).toBe('—')
    }
  })

  test('record: a link when the type has a page, else plain text', async () => {
    await renderFields([
      { label: 'Land use', kind: 'record', type: 'landUse', id: ID, text: 'Residential' },
      { label: 'Improvement', kind: 'record', type: 'improvement', id: ID },
    ])
    expect(screen.getByRole('link', { name: 'Residential' }).getAttribute('href')).toBe(
      `/land-uses/${ID}`,
    )
    expect(valueOf('Improvement').textContent).toBe(ID)
    expect(valueOf('Improvement').querySelector('a')).toBeNull()
  })

  test('timestamp: ISO 8601', async () => {
    await renderFields([
      { label: 'Time', kind: 'timestamp', value: { seconds: 1700000000n, nanos: 5e8 } },
    ])
    expect(valueOf('Time').textContent).toBe('2023-11-14T22:13:20.500Z')
  })

  test('json: pretty-printed in a <pre>', async () => {
    await renderFields([{ label: 'Properties', kind: 'json', value: '{"a":1}' }])
    const pre = valueOf('Properties').querySelector('pre')
    expect(pre?.textContent).toBe('{\n  "a": 1\n}')
  })

  test('url: http(s) is an external link; anything else is text', async () => {
    await renderFields([
      { label: 'Web', kind: 'url', value: 'https://records.example/doc/1' },
      { label: 'Script', kind: 'url', value: 'javascript:alert(1)' },
    ])
    const link = screen.getByRole('link', { name: 'https://records.example/doc/1' })
    expect(link.getAttribute('rel')).toBe('noreferrer noopener')
    expect(valueOf('Script').querySelector('a')).toBeNull()
  })
})

test('formatTimestamp and isWebUrl', () => {
  expect(formatTimestamp({ seconds: 0n, nanos: 0 })).toBe('1970-01-01T00:00:00.000Z')
  expect(isWebUrl('http://x.example')).toBe(true)
  expect(isWebUrl('ftp://x.example')).toBe(false)
  expect(isWebUrl('not a url')).toBe(false)
})
