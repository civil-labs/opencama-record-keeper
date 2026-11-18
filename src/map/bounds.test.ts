import { describe, expect, test } from 'vitest'
import {
  boundsFromExtent,
  boundsFromMetadata,
  defaultZoomFromMetadata,
  FALLBACK_DEFAULT_ZOOM,
  maxBoundsFor,
  padBounds,
  type Bounds,
} from './bounds.ts'

describe('boundsFromMetadata', () => {
  test('reads metadata.bounds', () => {
    expect(
      boundsFromMetadata({ bounds: { west: -140, south: -40, east: -139.9984, north: -39.998 } }),
    ).toEqual([-140, -40, -139.9984, -39.998])
  })

  test.each([
    ['no metadata', undefined],
    ['no bounds', {}],
    ['bounds not an object', { bounds: [1, 2, 3, 4] }],
    ['a missing edge', { bounds: { west: 1, south: 2, east: 3 } }],
    ['a string edge', { bounds: { west: '1', south: 2, east: 3, north: 4 } }],
    ['west ≥ east', { bounds: { west: 3, south: 2, east: 1, north: 4 } }],
    ['south ≥ north', { bounds: { west: 1, south: 4, east: 3, north: 2 } }],
    ['out of range', { bounds: { west: -200, south: 2, east: 3, north: 4 } }],
  ])('null for %s', (_name, metadata) => {
    expect(boundsFromMetadata(metadata)).toBeNull()
  })
})

describe('boundsFromExtent', () => {
  test('reads minX, minY, maxX, maxY', () => {
    expect(boundsFromExtent({ minX: 1, minY: 2, maxX: 3, maxY: 4 })).toEqual([1, 2, 3, 4])
  })
  test('null for an empty extent', () => {
    expect(boundsFromExtent({ minX: 0, minY: 0, maxX: 0, maxY: 0 })).toBeNull()
  })
})

describe('padBounds', () => {
  test('adds 10% on each side', () => {
    expect(padBounds([0, 0, 10, 20])).toEqual([-1, -2, 11, 22])
  })
  test('clamps to the world', () => {
    expect(padBounds([-180, -90, 180, 90])).toEqual([-180, -90, 180, 90])
  })
})

describe('maxBoundsFor', () => {
  test('covers the fitted view, so a wide view of a tall instance fits', () => {
    // A tall instance, 1 wide and 2 high, fitted in a view twice as wide as high.
    const bounds: Bounds = [0, 0, 1, 2]
    const fittedView: Bounds = [-1.5, 0, 2.5, 2]
    expect(maxBoundsFor(bounds, fittedView)).toEqual([-1.9, -0.2, 2.9, 2.2])
  })
  test('pads the bounds when the view is inside them', () => {
    expect(maxBoundsFor([0, 0, 10, 20], [2, 2, 8, 18])).toEqual([-1, -2, 11, 22])
  })
})

describe('defaultZoomFromMetadata', () => {
  test('reads default_zoom', () => {
    expect(defaultZoomFromMetadata({ default_zoom: 15 })).toBe(15)
  })
  test.each([undefined, {}, { default_zoom: '15' }, { default_zoom: -1 }, { default_zoom: 99 }])(
    'falls back to 17 for %o',
    (metadata) => {
      expect(defaultZoomFromMetadata(metadata)).toBe(FALLBACK_DEFAULT_ZOOM)
    },
  )
})
