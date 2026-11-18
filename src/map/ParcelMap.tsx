// The parcels map (spec: Map). One MapLibre instance per mount of the parcels
// layout; it survives selection changes because the layout does.
import 'maplibre-gl/dist/maplibre-gl.css'
import { useTransport } from '@connectrpc/connect-query'
import * as stylex from '@stylexjs/stylex'
import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { Map as MapLibreMap, setWorkerUrl, type ErrorEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useMemo, useRef, useState } from 'react'
import { estimatedExtentQuery } from '../api/parcels.ts'
import { currentPath } from '../auth.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import {
  boundsFromExtent,
  boundsFromMetadata,
  maxBoundsFor,
  type Bounds,
} from './bounds.ts'
import { EMPTY_STYLE, PARCEL_SOURCE, parcelLayers, parcelSource } from './style.ts'
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

/** Adds the parcel source and layers above every layer the style has. */
function addParcelLayers(map: MapLibreMap, tilesUrl: string) {
  if (map.getSource(PARCEL_SOURCE)) return
  map.addSource(PARCEL_SOURCE, parcelSource(tilesUrl))
  for (const layer of parcelLayers(null)) map.addLayer(layer)
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

/** Padding, in pixels, around the bounds when the whole instance is shown. */
const BOUNDS_PADDING_PX = 24

/**
 * Finds the instance's bounds, then draws the map. The bounds come from the
 * instance metadata, or else the estimated parcel extent. If neither is
 * usable, the map pane shows why and no map; the detail pane still works.
 */
export function ParcelMap() {
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
  if (metadataBounds) return <MapView bounds={metadataBounds} />
  if (extent.isError) return <ErrorAlert error={extent.error} />
  if (extent.isPending) return <p>Loading map…</p>
  if (!extentBounds) {
    return <ErrorAlert error={new Error('The instance reports no usable bounds.')} />
  }
  return <MapView bounds={extentBounds} />
}

function MapView({ bounds }: { bounds: Bounds }) {
  const { config, auth } = useRouteContext({ from: '/app/parcels' })
  const container = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<unknown>(null)

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
    })

    // The parcel layers go on every style that loads: the basemap, or the
    // empty fallback below.
    let styleLoaded = false
    map.on('style.load', () => {
      styleLoaded = true
      addParcelLayers(map, tilesUrl)
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

    return () => map.remove()
  }, [config, auth, bounds])

  return (
    <>
      <div ref={container} {...stylex.props(styles.map)} />
      {error !== null && <ErrorAlert error={error} />}
    </>
  )
}
