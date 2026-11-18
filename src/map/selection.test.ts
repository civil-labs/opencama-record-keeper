import { describe, expect, test } from 'vitest'
import { boxCenter, boxFromExtent, geometryBox, mergeBoxes, selectionZoom } from './selection.ts'

describe('geometryBox', () => {
  test('a polygon', () => {
    expect(
      geometryBox({
        type: 'Polygon',
        coordinates: [[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]],
      }),
    ).toEqual([0, 0, 2, 1])
  })
  test('a multipolygon', () => {
    expect(
      geometryBox({
        type: 'MultiPolygon',
        coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[3, -1], [4, -1], [4, 2], [3, -1]]]],
      }),
    ).toEqual([0, -1, 4, 2])
  })
  test('no coordinates', () => {
    expect(geometryBox({ type: 'Polygon', coordinates: [] })).toBeNull()
  })
})

describe('mergeBoxes', () => {
  test('pieces clipped at a tile edge merge into the whole parcel', () => {
    // The west and east halves of [0, 0, 2, 1], cut at x = 1.
    expect(mergeBoxes([[0, 0, 1, 1], [1, 0, 2, 1]])).toEqual([0, 0, 2, 1])
  })
  test('skips empty pieces; none at all is null', () => {
    expect(mergeBoxes([null, [0, 0, 1, 1]])).toEqual([0, 0, 1, 1])
    expect(mergeBoxes([])).toBeNull()
  })
})

test('boxFromExtent and boxCenter', () => {
  const box = boxFromExtent({ minX: -140, minY: -40, maxX: -139.9, maxY: -39.9 })
  expect(box).toEqual([-140, -40, -139.9, -39.9])
  const [x, y] = boxCenter(box)
  expect(x).toBeCloseTo(-139.95)
  expect(y).toBeCloseTo(-39.95)
})

describe('selectionZoom', () => {
  test('browsing at street level keeps the current zoom', () => {
    expect(selectionZoom({ fitZoom: 20, currentZoom: 18, defaultZoom: 17 })).toBe(18)
  })
  test('from a zoomed-out map, zooms in to the default zoom', () => {
    expect(selectionZoom({ fitZoom: 20, currentZoom: 12, defaultZoom: 17 })).toBe(17)
  })
  test('a parcel too big for the view zooms out until it fits', () => {
    expect(selectionZoom({ fitZoom: 15, currentZoom: 18, defaultZoom: 17 })).toBe(15)
  })
})
