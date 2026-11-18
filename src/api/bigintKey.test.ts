// Plan, PR 3: a query whose input holds an int64 (bigint) must build a working
// query key. TanStack Query hashes keys with JSON.stringify, which throws on
// bigint.
import { ParcelsService } from '@civil-labs/civil-os-api'
import { createRouterTransport } from '@connectrpc/connect'
import { createQueryOptions } from '@connectrpc/connect-query'
import { QueryClient } from '@tanstack/react-query'
import { expect, test } from 'vitest'

test('a bigint input builds a query key and caches the result', async () => {
  const transport = createRouterTransport(({ service }) => {
    service(ParcelsService, {
      getParcelIdsByFeatureId: (req) => ({
        parcelIds: Object.fromEntries(
          req.featureIds.map((id) => [id.toString(), `parcel-${id.toString()}`]),
        ),
      }),
    })
  })
  const queryClient = new QueryClient()
  const options = createQueryOptions(
    ParcelsService.method.getParcelIdsByFeatureId,
    { featureIds: [9007199254740993n] },
    { transport },
  )
  const result = await queryClient.fetchQuery(options)
  expect(result.parcelIds['9007199254740993']).toBe('parcel-9007199254740993')
  // Same input, same cache entry.
  expect(
    queryClient.getQueryData(
      createQueryOptions(
        ParcelsService.method.getParcelIdsByFeatureId,
        { featureIds: [9007199254740993n] },
        { transport },
      ).queryKey,
    ),
  ).toBe(result)
})
