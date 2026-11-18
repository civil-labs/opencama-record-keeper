// The parcel layers and their colors (spec: Map). These are MapLibre paint
// properties drawn on a WebGL canvas, not CSS, so they're plain constants.
import type {
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
  VectorSourceSpecification,
} from 'maplibre-gl'

/** The selected parcel's color: a saturated orange that stands out on a light basemap. */
export const HIGHLIGHT_COLOR = '#f97316'

/** Parcel outlines: dark gray. */
export const PARCEL_LINE_COLOR = '#374151'

export const PARCEL_SOURCE = 'parcels'
/** The MVT layer inside get_parcel_tiles. */
export const PARCEL_SOURCE_LAYER = 'parcels'

export const PARCELS_FILL = 'parcels-fill'
export const SELECTED_LAYERS = ['selected-fill', 'selected-line'] as const

export function parcelSource(tilesUrl: string): VectorSourceSpecification {
  return { type: 'vector', tiles: [tilesUrl] }
}

/** Matches only the feature with this ID, or nothing when there's none. */
export function selectedFilter(featureId: number | null): FilterSpecification {
  return featureId === null ? ['boolean', false] : ['==', ['id'], featureId]
}

/** The four parcel layers, bottom to top. They go above every basemap layer. */
export function parcelLayers(featureId: number | null): LayerSpecification[] {
  const common = { source: PARCEL_SOURCE, 'source-layer': PARCEL_SOURCE_LAYER }
  const filter = selectedFilter(featureId)
  return [
    // Invisible, so a click anywhere inside a parcel hits it.
    { id: PARCELS_FILL, type: 'fill', ...common, paint: { 'fill-opacity': 0 } },
    {
      id: 'parcels-line',
      type: 'line',
      ...common,
      paint: { 'line-color': PARCEL_LINE_COLOR, 'line-width': 1 },
    },
    {
      id: 'selected-fill',
      type: 'fill',
      ...common,
      filter,
      paint: { 'fill-color': HIGHLIGHT_COLOR, 'fill-opacity': 0.3 },
    },
    {
      id: 'selected-line',
      type: 'line',
      ...common,
      filter,
      paint: { 'line-color': HIGHLIGHT_COLOR, 'line-width': 3 },
    },
  ]
}

/**
 * Used when the basemap style itself fails to load, so the parcel layers
 * still have a style to sit in. A plain light background, no basemap.
 */
export const EMPTY_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f8f8f8' } },
  ],
}
