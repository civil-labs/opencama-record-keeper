// The parcels map (spec: Map). One MapLibre instance per mount of the parcels
// layout; it survives selection changes because the layout does.
import 'maplibre-gl/dist/maplibre-gl.css'
import * as stylex from '@stylexjs/stylex'
import { useRouteContext } from '@tanstack/react-router'
import { Map as MapLibreMap, setWorkerUrl, type ErrorEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState } from 'react'
import { currentPath } from '../auth.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
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

export function ParcelMap() {
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
  }, [config, auth])

  return (
    <>
      <div ref={container} {...stylex.props(styles.map)} />
      {error !== null && <ErrorAlert error={error} />}
    </>
  )
}
