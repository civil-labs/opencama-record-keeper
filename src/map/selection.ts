// Finding and framing the selected parcel (spec: Selection, Parcel location).
// Pure functions; ParcelMap applies them to the map.
import type { Bounds } from './bounds.ts'

/** Padding, in pixels, around a selected parcel when the camera fits it. */
export const SELECTION_PADDING_PX = 48

/** The `[w, s, e, n]` box of an extent from Civil OS. */
export function boxFromExtent(extent: {
  minX: number
  minY: number
  maxX: number
  maxY: number
}): Bounds {
  return [extent.minX, extent.minY, extent.maxX, extent.maxY]
}

/** The box around every position in a GeoJSON geometry's coordinates. */
export function geometryBox(geometry: unknown): Bounds | null {
  let box: Bounds | null = null
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      const [x, y] = value as [number, number]
      box = box
        ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]
        : [x, y, x, y]
      return
    }
    for (const child of value) visit(child)
  }
  if (typeof geometry === 'object' && geometry !== null && 'coordinates' in geometry) {
    visit(geometry.coordinates)
  }
  return box
}

/**
 * The box of a parcel split across tiles: each tile returns its own clipped
 * piece, and together they cover the parcel. Null when there are none.
 */
export function mergeBoxes(boxes: readonly (Bounds | null)[]): Bounds | null {
  let merged: Bounds | null = null
  for (const box of boxes) {
    if (!box) continue
    merged = merged
      ? [
          Math.min(merged[0], box[0]),
          Math.min(merged[1], box[1]),
          Math.max(merged[2], box[2]),
          Math.max(merged[3], box[3]),
        ]
      : box
  }
  return merged
}

/** The middle of a box, as `[lon, lat]`. */
export function boxCenter(box: Bounds): [number, number] {
  return [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]
}

/**
 * The zoom for a selected parcel: the lower of the zoom that fits it and the
 * higher of the current zoom and the instance's default zoom. Browsing at
 * street level keeps the zoom; from far out it zooms in to the parcel; and a
 * parcel too big for the view zooms out until it fits.
 */
export function selectionZoom({
  fitZoom,
  currentZoom,
  defaultZoom,
}: {
  fitZoom: number
  currentZoom: number
  defaultZoom: number
}): number {
  return Math.min(fitZoom, Math.max(currentZoom, defaultZoom))
}
