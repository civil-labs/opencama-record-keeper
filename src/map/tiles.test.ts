import { describe, expect, test, vi } from 'vitest'
import { createTransformRequest, isGatewayTileUrl, parcelTilesUrl } from './tiles.ts'

const GATEWAY = 'http://localhost:8080'

test('parcelTilesUrl', () => {
  expect(parcelTilesUrl(GATEWAY)).toBe(
    'http://localhost:8080/tiles/get_parcel_tiles/{z}/{x}/{y}',
  )
})

test('isGatewayTileUrl matches only {gatewayUrl}/tiles/', () => {
  expect(isGatewayTileUrl(GATEWAY, `${GATEWAY}/tiles/get_parcel_tiles/1/2/3`)).toBe(true)
  expect(isGatewayTileUrl(GATEWAY, `${GATEWAY}/civil.public.parcels.v1.X/Y`)).toBe(false)
  expect(isGatewayTileUrl(GATEWAY, 'https://tiles.openfreemap.org/planet/1/2/3.pbf')).toBe(false)
  // A host that merely starts with the gateway's host is not the gateway.
  expect(isGatewayTileUrl(GATEWAY, 'http://localhost:80800/tiles/x')).toBe(false)
})

describe('transformRequest', () => {
  test('adds the bearer token to gateway tiles', async () => {
    const transform = createTransformRequest(GATEWAY, () => Promise.resolve('tok'), vi.fn())
    expect(await transform(`${GATEWAY}/tiles/get_parcel_tiles/1/2/3`)).toEqual({
      url: `${GATEWAY}/tiles/get_parcel_tiles/1/2/3`,
      headers: { Authorization: 'Bearer tok' },
    })
  })

  test('never sends the token to the basemap', async () => {
    const getIdToken = vi.fn(() => Promise.resolve('tok'))
    const transform = createTransformRequest(GATEWAY, getIdToken, vi.fn())
    const url = 'https://tiles.openfreemap.org/styles/positron'
    expect(await transform(url)).toEqual({ url })
    expect(getIdToken).not.toHaveBeenCalled()
  })

  test('with no token, starts sign-in and sends no header', async () => {
    const onNoToken = vi.fn()
    const transform = createTransformRequest(GATEWAY, () => Promise.resolve(null), onNoToken)
    const url = `${GATEWAY}/tiles/get_parcel_tiles/1/2/3`
    expect(await transform(url)).toEqual({ url })
    expect(onNoToken).toHaveBeenCalledOnce()
  })
})
