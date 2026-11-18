// The parcels map (spec: Map). One MapLibre instance per mount of the parcels
// layout; it survives selection changes because the layout does.
import 'maplibre-gl/dist/maplibre-gl.css'
import { Code, ConnectError } from '@connectrpc/connect'
import { useTransport } from '@connectrpc/connect-query'
import * as stylex from '@stylexjs/stylex'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useRouteContext } from '@tanstack/react-router'
import {
  Map as MapLibreMap,
  setWorkerUrl,
  type ErrorEvent,
  type FilterSpecification,
} from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  estimatedExtentQuery,
  parcelExtentQuery,
  parcelIdsByFeatureQuery,
  parcelQuery,
} from '../api/parcels.ts'
import { currentPath } from '../auth.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { featureIdToBigInt, featureIdToNumber } from '../links.tsx'
import {
  boundsFromExtent,
  boundsFromMetadata,
  defaultZoomFromMetadata,
  maxBoundsFor,
  type Bounds,
} from './bounds.ts'
import {
  EMPTY_STYLE,
  PARCEL_SOURCE,
  PARCEL_SOURCE_LAYER,
  PARCELS_FILL,
  parcelLayers,
  parcelSource,
  SELECTED_LAYERS,
  selectedFilter,
} from './style.ts'
import {
  boxCenter,
  boxFromExtent,
  geometryBox,
  mergeBoxes,
  SELECTION_PADDING_PX,
  selectionZoom,
} from './selection.ts'
import { createTransformRequest, parcelTilesUrl } from './tiles.ts'

// MapLibre finds its worker next to its own module by default, which a bundle
// doesn't have. Point it at the worker file Vite emits: same-origin, so it
// loads as a module worker under a `script-src 'self'` CSP.
setWorkerUrl(workerUrl)

const styles = stylex.create({
  // MapLibre needs a sized container: fill the grid cell.
  map: {
    position: 'absolute',
    inset: 0,
  },
})

/**
 * Adds the parcel source and layers above every layer the style has, with
 * the current highlight.
 */
function addParcelLayers(map: MapLibreMap, tilesUrl: string, featureId: number | null) {
  if (map.getSource(PARCEL_SOURCE)) return
  map.addSource(PARCEL_SOURCE, parcelSource(tilesUrl))
  for (const layer of parcelLayers(featureId)) map.addLayer(layer)
}

function setHighlight(map: MapLibreMap, featureId: number | null) {
  for (const id of SELECTED_LAYERS) {
    if (map.getLayer(id)) map.setFilter(id, selectedFilter(featureId))
  }
}

/** The box of a feature from the tiles already loaded, merging clipped pieces. */
function boxFromLoadedTiles(map: MapLibreMap, featureId: number) {
  const filter: FilterSpecification = ['==', ['id'], featureId]
  const pieces = map.querySourceFeatures(PARCEL_SOURCE, {
    sourceLayer: PARCEL_SOURCE_LAYER,
    filter,
  })
  // MapLibre types `geometry` with @types/geojson, which isn't a dependency.
  return mergeBoxes(pieces.map((piece) => geometryBox((piece as { geometry: unknown }).geometry)))
}

/** Runs once the map has loaded every tile it needs for the current view. */
function whenIdle(map: MapLibreMap, run: () => void): () => void {
  if (map.loaded() && map.areTilesLoaded()) {
    run()
    return () => {}
  }
  map.once('idle', run)
  return () => map.off('idle', run)
}

/** The HTTP status of a failed request, if the error carries one. */
function errorStatus(event: ErrorEvent): number | undefined {
  const status = (event.error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

/** The source a tile error came from. MapLibre sets it, but doesn't type it. */
function errorSourceId(event: ErrorEvent): string | undefined {
  const { sourceId } = event as { sourceId?: unknown }
  return typeof sourceId === 'string' ? sourceId : undefined
}

/** A one-line message from the map, for the detail pane. */
export type MapNote = (message: string) => void

function describeError(error: unknown): string {
  const connectError = ConnectError.from(error)
  return `${Code[connectError.code]}: ${connectError.rawMessage}`
}

/** Padding, in pixels, around the bounds when the whole instance is shown. */
const BOUNDS_PADDING_PX = 24

/**
 * Finds the instance's bounds, then draws the map. The bounds come from the
 * instance metadata, or else the estimated parcel extent. If neither is
 * usable, the map pane shows why and no map; the detail pane still works.
 */
export function ParcelMap({ onNote }: { onNote: MapNote }) {
  const { instance } = useRouteContext({ from: '/app/parcels' })
  const metadataBounds = useMemo(
    () => boundsFromMetadata(instance.metadata),
    [instance.metadata],
  )
  const extent = useQuery({
    ...estimatedExtentQuery(useTransport()),
    enabled: metadataBounds === null,
  })
  const extentBounds = useMemo(
    () => (extent.data ? boundsFromExtent(extent.data) : null),
    [extent.data],
  )
  if (metadataBounds) return <MapView bounds={metadataBounds} onNote={onNote} />
  if (extent.isError) return <ErrorAlert error={extent.error} />
  if (extent.isPending) return <p>Loading map…</p>
  if (!extentBounds) {
    return <ErrorAlert error={new Error('The instance reports no usable bounds.')} />
  }
  return <MapView bounds={extentBounds} onNote={onNote} />
}

function MapView({ bounds, onNote }: { bounds: Bounds; onNote: MapNote }) {
  const { config, auth, queryClient, instance } = useRouteContext({ from: '/app/parcels' })
  const transport = useTransport()
  const navigate = useNavigate()
  const { parcelId } = useParams({ strict: false })
  const container = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<unknown>(null)
  // The map, once it has loaded and fitted the instance. Selection waits for it.
  const [loadedMap, setLoadedMap] = useState<MapLibreMap | null>(null)
  // The highlighted feature, for layers added when a style (re)loads.
  const highlighted = useRef<number | null>(null)

  // The map is created once; its click handler reads the latest values here.
  const latest = useRef({ parcelId, onNote })
  useEffect(() => {
    latest.current = { parcelId, onNote }
  })

  /**
   * A click on a parcel (spec: Click): look up its parcel ID, then navigate,
   * pushing a history entry so Back returns to the previous selection.
   */
  async function selectFeature(featureId: number) {
    try {
      const { parcelIds } = await queryClient.fetchQuery(
        parcelIdsByFeatureQuery(transport, [featureIdToBigInt(featureId)]),
      )
      const clicked = parcelIds[String(featureId)]
      if (clicked === undefined) {
        latest.current.onNote('This map feature has no parcel record.')
      } else if (clicked !== latest.current.parcelId) {
        await navigate({ to: '/parcels/$parcelId', params: { parcelId: clicked } })
      }
    } catch (caught) {
      latest.current.onNote(`Couldn't select that parcel. ${describeError(caught)}`)
    }
  }
  const selectFeatureRef = useRef(selectFeature)
  useEffect(() => {
    selectFeatureRef.current = selectFeature
  })

  useEffect(() => {
    if (!container.current) return
    const tilesUrl = parcelTilesUrl(config.gatewayUrl)
    let map: MapLibreMap
    try {
      map = new MapLibreMap({
        container: container.current,
        style: config.basemapStyleUrl,
        // Start on the whole instance.
        bounds,
        fitBoundsOptions: { padding: BOUNDS_PADDING_PX },
        transformRequest: createTransformRequest(
          config.gatewayUrl,
          () => auth.getIdToken(),
          () => void auth.clearAndSignIn(currentPath()),
        ),
      })
    } catch (caught) {
      // No WebGL, for example. The detail pane still works. Recording an
      // external system's failure is what this effect is for.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(caught)
      return
    }

    // Never pan far outside the instance. Set once the map has fitted the
    // bounds, so maxBounds can include the fitted view (see maxBoundsFor).
    map.once('load', () => {
      map.setMaxBounds(maxBoundsFor(bounds, map.getBounds().toArray().flat() as Bounds))
      setLoadedMap(map)
    })

    // A click inside a parcel selects it. A click on empty map changes nothing.
    map.on('click', PARCELS_FILL, (event) => {
      const featureId = event.features?.[0]?.id
      if (typeof featureId === 'number') void selectFeatureRef.current(featureId)
    })

    // The parcel layers go on every style that loads: the basemap, or the
    // empty fallback below.
    let styleLoaded = false
    map.on('style.load', () => {
      styleLoaded = true
      addParcelLayers(map, tilesUrl, highlighted.current)
    })

    map.on('error', (event) => {
      // Any error before a style has loaded is the basemap style failing.
      // Fall back to an empty style so the parcel layers still draw.
      if (!styleLoaded) {
        styleLoaded = true
        console.warn('Basemap style failed to load; continuing without it', event.error)
        map.setStyle(EMPTY_STYLE)
        return
      }
      // A parcel tile rejected for its token: sign in again (spec: Auth, step 5).
      if (errorSourceId(event) === PARCEL_SOURCE && errorStatus(event) === 401) {
        void auth.clearAndSignIn(currentPath())
      }
    })

    return () => {
      setLoadedMap(null)
      map.remove()
    }
  }, [config, auth, bounds])

  /**
   * Selection (spec: Selection): when the selected parcel changes, highlight
   * its feature and move the camera to it. Cleared, the highlight goes and
   * the camera stays.
   */
  useEffect(() => {
    if (!loadedMap) return
    const map: MapLibreMap = loadedMap
    let cancelled = false
    let stopWaiting = () => {}
    const highlight = (featureId: number | null) => {
      highlighted.current = featureId
      setHighlight(map, featureId)
    }
    const center = (box: Bounds) => {
      const fit = map.cameraForBounds(box, { padding: SELECTION_PADDING_PX })
      const zoom = selectionZoom({
        fitZoom: fit?.zoom ?? map.getMaxZoom(),
        currentZoom: map.getZoom(),
        defaultZoom: defaultZoomFromMetadata(instance.metadata),
      })
      map.easeTo({ center: boxCenter(box), zoom })
    }

    async function select(parcelId: string) {
      // The same query as the pane, so no extra request. If it fails, the pane
      // shows why; the map just has nothing to show.
      let featureId: number | null = null
      try {
        const { parcels } = await queryClient.fetchQuery(parcelQuery(transport, parcelId))
        const id = parcels[parcelId]?.parcelDetails?.featureId
        featureId = id === undefined ? null : featureIdToNumber(id)
      } catch {
        return
      }
      if (cancelled) return
      highlight(featureId)
      // No current geometry: nothing to find. The pane says so.
      if (featureId === null) return

      let box: Bounds | null = null
      try {
        const { extents } = await queryClient.fetchQuery(parcelExtentQuery(transport, parcelId))
        const extent = extents[parcelId]
        box = extent ? boxFromExtent(extent) : null
      } catch {
        // The tile fallback below; the error isn't shown (spec: Parcel location).
      }
      if (cancelled) return
      if (box) {
        center(box)
        return
      }
      const found = featureId
      stopWaiting = whenIdle(map, () => {
        if (cancelled) return
        const tileBox = boxFromLoadedTiles(map, found)
        if (tileBox) center(tileBox)
        else latest.current.onNote('Location not loaded. Zoom in to find it on the map.')
      })
    }

    if (parcelId === undefined) highlight(null)
    else void select(parcelId)
    return () => {
      cancelled = true
      stopWaiting()
    }
  }, [loadedMap, parcelId, queryClient, transport, instance.metadata])

  return (
    <>
      <div ref={container} {...stylex.props(styles.map)} />
      {error !== null && <ErrorAlert error={error} />}
    </>
  )
}
