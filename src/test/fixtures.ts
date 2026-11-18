// A fake Civil OS for page tests: a few lookups and parcels, served through a
// Connect router transport. Synthetic data only.
import {
  LandUsesService,
  NeighborhoodService,
  ParcelsService,
  RealPropertyTransfersService,
  ZoningService,
} from '@civil-labs/civil-os-api'
import { createRouterTransport, type ConnectRouter } from '@connectrpc/connect'

export const IDS = {
  landUse: '11000000-0000-4000-8000-000000000001',
  zoning: '40000000-0000-4000-8000-000000000001',
  neighborhood: '71000000-0000-4000-8000-000000000001',
  definitionA: '70000000-0000-4000-8000-000000000001',
  definitionB: '70000000-0000-4000-8000-000000000002',
  address: '20000000-0000-4000-8000-000000000002',
  partyA: '30000000-0000-4000-8000-000000000002',
  partyB: '30000000-0000-4000-8000-000000000003',
  improvement: '53000000-0000-4000-8000-000000000002',
  parcel: 'a0000000-0000-4000-8000-000000000002',
  parcelNoGeometry: 'a0000000-0000-4000-8000-000000000021',
  missing: 'a0000000-0000-4000-8000-000000000099',
  transfer: (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
} as const

export interface FakeCalls {
  calls: { method: string; input: unknown }[]
}

export function fakeCivilOs(
  options: { transfers?: number; register?: (router: ConnectRouter) => void } = {},
) {
  const log: FakeCalls['calls'] = []
  const record = (method: string, input: unknown) => log.push({ method, input })
  const transferCount = options.transfers ?? 0
  const transport = createRouterTransport((router) => {
    router.service(LandUsesService, {
      getLandUses: () => {
        record('getLandUses', {})
        return {
          landUses: {
            [IDS.landUse]: { id: IDS.landUse, name: 'Single family', landUseTypeName: 'Residential' },
          },
        }
      },
    })
    router.service(ZoningService, {
      getZoning: () => ({ zoning: { [IDS.zoning]: { id: IDS.zoning, name: 'Fixture Residential', code: 'R-1' } } }),
    })
    router.service(NeighborhoodService, {
      getNeighborhoods: () => ({
        neighborhoods: {
          [IDS.neighborhood]: {
            id: IDS.neighborhood,
            name: 'North Fixture',
            neighborhoodDefinitionIds: [IDS.definitionA],
          },
        },
      }),
      getNeighborhoodDefinitions: () => ({
        neighborhoodDefinitions: {
          [IDS.definitionA]: { id: IDS.definitionA, name: 'Fixture districts' },
          [IDS.definitionB]: { id: IDS.definitionB, name: 'Fixture market areas' },
        },
      }),
    })
    router.service(ParcelsService, {
      getParcelsWithImprovementSummaryByParcelId: (req) => {
        record('getParcelsWithImprovementSummaryByParcelId', req)
        const parcels: Record<string, object> = {}
        for (const id of req.parcelIds) {
          if (id === IDS.parcel) {
            parcels[id] = {
              parcelDetails: {
                parcelId: id,
                featureId: 1002n,
                formattedAddress: '2 Fixture Way, Testville ZZ000',
                addressId: IDS.address,
                primaryOwnerName: 'Fixture Owner 2',
                partyIds: [IDS.partyA, IDS.partyB],
                landUseId: IDS.landUse,
                neighborhoodId:
                  req.neighborhoodDefinitionId === IDS.definitionA ? IDS.neighborhood : undefined,
                landAreaSqFt: 4520.838,
                zoningIds: [IDS.zoning],
                properties: '{"n": 2}',
              },
              improvementSummary: {
                improvementIds: [IDS.improvement],
                primaryImprovementId: IDS.improvement,
                totalBedrooms: 3,
              },
            }
          } else if (id === IDS.parcelNoGeometry) {
            parcels[id] = { parcelDetails: { parcelId: id, partyIds: [], zoningIds: [] } }
          }
        }
        return { parcels }
      },
      getParcelExtentsWGS84ByParcelId: (req) => {
        record('getParcelExtentsWGS84ByParcelId', req)
        const extents: Record<string, { minX: number; minY: number; maxX: number; maxY: number }> =
          {}
        if (req.parcelIds.includes(IDS.parcel)) {
          extents[IDS.parcel] = { minX: -139.9996, minY: -40, maxX: -139.9992, maxY: -39.9996 }
        }
        return { extents }
      },
    })
    router.service(RealPropertyTransfersService, {
      getTransfersByParcelId: (req) => {
        record('getTransfersByParcelId', req)
        const start = req.after ? Number(req.after) : 0
        const first = req.first ?? 25
        const end = Math.min(start + first, transferCount)
        const edges = []
        for (let n = start; n < end; n++) {
          edges.push({
            cursor: String(n + 1),
            node: {
              transferId: IDS.transfer(n + 1),
              transferTime: { seconds: BigInt(1700000000 + n * 86400), nanos: 0 },
              transferAmount: `${String(100000 + n)}.00`,
            },
          })
        }
        return {
          edges,
          pageInfo: {
            hasNextPage: end < transferCount,
            hasPreviousPage: start > 0,
            endCursor: edges.length ? String(end) : undefined,
          },
        }
      },
    })
    options.register?.(router)
  })
  return { transport, calls: log }
}
