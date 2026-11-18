// Parcel tiles come from the gateway, with the same bearer token as the RPCs
// (spec: Auth, step 4). Only requests to {gatewayUrl}/tiles/ get the token;
// the basemap's host never sees it.
import type { RequestParameters } from 'maplibre-gl'

export function parcelTilesUrl(gatewayUrl: string): string {
  return `${gatewayUrl}/tiles/get_parcel_tiles/{z}/{x}/{y}`
}

export function isGatewayTileUrl(gatewayUrl: string, url: string): boolean {
  return url.startsWith(`${gatewayUrl}/tiles/`)
}

/**
 * MapLibre's transformRequest. Adds `Authorization: Bearer <id_token>` to tile
 * requests on the gateway, and leaves every other request alone. With no
 * valid token it calls `onNoToken` (which starts a sign-in) and sends the
 * request without one.
 */
export function createTransformRequest(
  gatewayUrl: string,
  getIdToken: () => Promise<string | null>,
  onNoToken: () => void,
) {
  return async (url: string): Promise<RequestParameters> => {
    if (!isGatewayTileUrl(gatewayUrl, url)) return { url }
    const token = await getIdToken()
    if (token === null) {
      onNoToken()
      return { url }
    }
    return { url, headers: { Authorization: `Bearer ${token}` } }
  }
}
