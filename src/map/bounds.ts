// The instance's bounds and the map's starting view (spec: Bounds and starting
// view).

/** [west, south, east, north], in degrees. */
export type Bounds = [number, number, number, number]

/** The fallback zoom when the metadata has no default_zoom (spec: Selection). */
export const FALLBACK_DEFAULT_ZOOM = 17


/** Valid if every edge is a finite coordinate and the box has area. */
export function isValidBounds(bounds: Bounds): boolean {
  const [west, south, east, north] = bounds
  return (
    bounds.every(Number.isFinite) &&
    west >= -180 &&
    east <= 180 &&
    south >= -90 &&
    north <= 90 &&
    west < east &&
    south < north
  )
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * `metadata.bounds` ({ west, south, east, north }), a convention in the
 * instance metadata rather than a proto contract. Null if missing or malformed.
 */
export function boundsFromMetadata(metadata: unknown): Bounds | null {
  const bounds = record(record(metadata)?.bounds)
  if (!bounds) return null
  const edges = [bounds.west, bounds.south, bounds.east, bounds.north]
  if (!edges.every((edge) => typeof edge === 'number')) return null
  const result = edges as Bounds
  return isValidBounds(result) ? result : null
}

/** GetEstimatedParcelsExtentWGS84's box, or null if it's not usable. */
export function boundsFromExtent(extent: {
  minX: number
  minY: number
  maxX: number
  maxY: number
}): Bounds | null {
  const result: Bounds = [extent.minX, extent.minY, extent.maxX, extent.maxY]
  return isValidBounds(result) ? result : null
}

/** The smallest box containing both. */
export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ]
}

/**
 * The map's maxBounds: the instance bounds together with the view that fits
 * them, extended on each side by half that view's width and height.
 *
 * MapLibre keeps the whole viewport inside maxBounds. Including the fitted
 * view lets the whole instance be shown even when its shape differs from the
 * pane's (a tall instance in a wide pane). The half-view margin lets any point
 * inside the bounds, such as a parcel on the edge, be centered at that zoom or
 * closer. Clamped to the world.
 */
export function maxBoundsFor(bounds: Bounds, fittedView: Bounds): Bounds {
  const [west, south, east, north] = unionBounds(bounds, fittedView)
  const dx = (fittedView[2] - fittedView[0]) / 2
  const dy = (fittedView[3] - fittedView[1]) / 2
  return [
    Math.max(-180, west - dx),
    Math.max(-90, south - dy),
    Math.min(180, east + dx),
    Math.min(90, north + dy),
  ]
}

/** `metadata.default_zoom`, if it's a usable zoom level. */
export function defaultZoomFromMetadata(metadata: unknown): number {
  const zoom = record(metadata)?.default_zoom
  return typeof zoom === 'number' && Number.isFinite(zoom) && zoom >= 0 && zoom <= 24
    ? zoom
    : FALLBACK_DEFAULT_ZOOM
}
