// A fake Civil OS for page tests: a few lookups and parcels, served through a
// Connect router transport. Synthetic data only.
import {
  AddressesService,
  ImprovementsService,
  PartiesService,
  LandUsesService,
  NeighborhoodsService,
  ParcelsService,
  RealPropertyTransfersService,
  ZoningService,
} from '@civil-labs/civil-os-api'
import {
  Code,
  ConnectError,
  createRouterTransport,
  type ConnectRouter,
} from '@connectrpc/connect'
import { normalizeQuery } from '../search/query.ts'

export const IDS = {
  landUse: '11000000-0000-4000-8000-000000000001',
  zoning: '40000000-0000-4000-8000-000000000001',
  neighborhood: '71000000-0000-4000-8000-000000000001',
  definitionA: '70000000-0000-4000-8000-000000000001',
  definitionB: '70000000-0000-4000-8000-000000000002',
  address: '20000000-0000-4000-8000-000000000002',
  partyA: '30000000-0000-4000-8000-000000000002',
  partyB: '30000000-0000-4000-8000-000000000003',
  partyC: '30000000-0000-4000-8000-000000000004',
  code: '92000000-0000-4000-8000-000000000002',
  improvement: '53000000-0000-4000-8000-000000000002',
  improvementType: '50000000-0000-4000-8000-000000000001',
  improvementCondition: '51000000-0000-4000-8000-000000000002',
  improvementQuality: '52000000-0000-4000-8000-000000000001',
  parcel: 'a0000000-0000-4000-8000-000000000002',
  parcelNoGeometry: 'a0000000-0000-4000-8000-000000000021',
  missing: 'a0000000-0000-4000-8000-000000000099',
  transfer: (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  /** Two parcels that share one address, for search. */
  sharedA: 'a0000000-0000-4000-8000-000000000031',
  sharedB: 'a0000000-0000-4000-8000-000000000032',
  sharedAddress: '20000000-0000-4000-8000-000000000031',
  /** Parcels 10 to 21 on Fixture Way, for search. */
  wayParcel: (n: number) => `a0000000-0000-4000-8000-${String(100 + n).padStart(12, '0')}`,
  wayAddress: (n: number) => `20000000-0000-4000-8000-${String(100 + n).padStart(12, '0')}`,
} as const

/**
 * The addresses search can find, best first. `fixture way` matches 13, so a
 * page of 10 has a next page. `shared court` matches two parcels with the
 * same address.
 */
export const SEARCH_HITS = [
  {
    parcelId: IDS.parcel,
    featureId: 1002n,
    addressId: IDS.address,
    formattedAddress: '2 Fixture Way, Testville ZZ000',
  },
  ...Array.from({ length: 12 }, (_, i) => ({
    parcelId: IDS.wayParcel(10 + i),
    featureId: BigInt(1010 + i),
    addressId: IDS.wayAddress(10 + i),
    formattedAddress: `${10 + i} Fixture Way, Testville ZZ000`,
  })),
  {
    parcelId: IDS.sharedA,
    featureId: 1031n,
    addressId: IDS.sharedAddress,
    formattedAddress: '7 Shared Court, Testville ZZ000',
  },
  {
    parcelId: IDS.sharedB,
    featureId: 1032n,
    addressId: IDS.sharedAddress,
    formattedAddress: '7 Shared Court, Testville ZZ000',
  },
]

export interface FakeCalls {
  calls: { method: string; input: unknown }[]
}

export function fakeCivilOs(
  options: {
    transfers?: number
    /** Delay parcel reads, in milliseconds, to observe loading states. */
    parcelDelayMs?: number
    /** The definitions call fails, or returns none. */
    definitions?: 'fail' | 'none'
    /** The address page's parties section fails. */
    failPartiesByAddress?: boolean
    /** Delay searches, in milliseconds, or by query text. */
    searchDelayMs?: number | ((query: string) => number)
    /** Every search fails with this code. */
    failSearch?: Code
    /** The three improvement lookups (types, conditions, qualities) fail. */
    failImprovementLookups?: boolean
    /** Make every transfers page after the first fail. */
    failNextTransfersPage?: boolean
    register?: (router: ConnectRouter) => void
  } = {},
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
    router.service(NeighborhoodsService, {
      getNeighborhoods: () => ({
        neighborhoods: {
          [IDS.neighborhood]: {
            id: IDS.neighborhood,
            name: 'North Fixture',
            neighborhoodDefinitionIds: [IDS.definitionA],
          },
        },
      }),
      getNeighborhoodDefinitions: () => {
        record('getNeighborhoodDefinitions', {})
        if (options.definitions === 'fail') throw new ConnectError('reader down', Code.Unavailable)
        const neighborhoodDefinitions: Record<string, { id: string; name: string }> = {}
        if (options.definitions !== 'none') {
          neighborhoodDefinitions[IDS.definitionA] = { id: IDS.definitionA, name: 'Fixture districts' }
          neighborhoodDefinitions[IDS.definitionB] = {
            id: IDS.definitionB,
            name: 'Fixture market areas',
          }
        }
        return { neighborhoodDefinitions }
      },
    })
    router.service(ParcelsService, {
      searchParcelsAddresses: async (req, context) => {
        record('searchParcelsAddresses', req)
        const delay =
          typeof options.searchDelayMs === 'function'
            ? options.searchDelayMs(req.query)
            : (options.searchDelayMs ?? 0)
        if (delay) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, delay)
            context.signal.addEventListener('abort', () => {
              clearTimeout(timer)
              reject(new ConnectError('aborted', Code.Canceled))
            })
          })
        }
        if (options.failSearch !== undefined) {
          throw new ConnectError('search failed', options.failSearch)
        }
        const q = normalizeQuery(req.query)
        const matches = SEARCH_HITS.filter((hit) =>
          normalizeQuery(hit.formattedAddress).includes(q),
        )
        const first = req.first ?? 25
        return {
          hits: matches.slice(0, first),
          pageInfo: { hasNextPage: matches.length > first, endCursor: 'cursor' },
        }
      },
      getParcelsWithImprovementSummaryByParcelId: async (req) => {
        record('getParcelsWithImprovementSummaryByParcelId', req)
        if (options.parcelDelayMs) await new Promise((r) => setTimeout(r, options.parcelDelayMs))
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
                primaryConditionId: IDS.improvementCondition,
                totalBedrooms: 3,
                totalFullBathrooms: 2,
                totalHalfBathrooms: 1,
                totalBathrooms: 2.5,
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
      getParcelsByAddressId: (req) => {
        record('getParcelsByAddressId', req)
        return {
          parcels: [{ parcelId: IDS.parcel, featureId: 1002n }],
          pageInfo: { hasNextPage: false },
        }
      },
      getParcelsByPartyId: (req) => {
        record('getParcelsByPartyId', req)
        return {
          parcels: [
            { parcelId: IDS.parcel, ownershipShare: '0.5000' },
            { parcelId: IDS.parcelNoGeometry, ownershipShare: '1.0000' },
          ],
          pageInfo: { hasNextPage: false },
        }
      },
    })
    router.service(RealPropertyTransfersService, {
      getTransfersById: (req) => {
        record('getTransfersById', req)
        return {
          transfers: req.transferIds
            .filter((id) => id === IDS.transfer(3))
            .map((id) => ({
              transferId: id,
              transferTime: { seconds: 1693526400n, nanos: 0 },
              transferAmount: '520000.0000',
              recordings: [
                { book: 'FX-B3', page: '3', uri: 'https://recordings.example.invalid/FX-3' },
                { book: 'FX-B4', uri: 'javascript:alert(1)' },
              ],
              codes: [{ codeId: IDS.code, name: 'Fixture Unqualified', type: { name: 'Fixture Qualification' } }],
              parcels: [
                {
                  parcelId: IDS.parcel,
                  grantors: [{ partyId: IDS.partyA, transferredShare: '1.0000' }],
                  grantees: [
                    { partyId: IDS.partyB, transferredShare: '0.5000' },
                    { partyId: IDS.partyC, transferredShare: '0.5000' },
                  ],
                },
              ],
              improvements: [
                {
                  improvementId: IDS.improvement,
                  grantors: [{ partyId: IDS.partyA, transferredShare: '1.0000' }],
                  grantees: [],
                },
              ],
              parties: [
                { partyId: IDS.partyA, name: 'Fixture Seller', mailingAddress: '1 Old Road' },
                { partyId: IDS.partyB, name: 'Fixture Buyer' },
                { partyId: IDS.partyC },
              ],
            })),
        }
      },
      getTransfersByPartyId: (req) => {
        record('getTransfersByPartyId', req)
        return {
          transfers: [{ transferId: IDS.transfer(3), transferAmount: '520000.0000' }],
          pageInfo: { hasNextPage: false },
        }
      },
      getTransfersByParcelId: (req) => {
        record('getTransfersByParcelId', req)
        if (options.failNextTransfersPage && req.after) {
          throw new ConnectError('reader down', Code.Unavailable)
        }
        const start = req.after ? Number(req.after) : 0
        const first = req.first ?? 25
        const end = Math.min(start + first, transferCount)
        const transfers = []
        for (let n = start; n < end; n++) {
          transfers.push({
            transferId: IDS.transfer(n + 1),
            transferTime: { seconds: BigInt(1700000000 + n * 86400), nanos: 0 },
            transferAmount: `${String(100000 + n)}.00`,
          })
        }
        return {
          transfers,
          pageInfo: {
            hasNextPage: end < transferCount,
            hasPreviousPage: start > 0,
            endCursor: transfers.length ? String(end) : undefined,
          },
        }
      },
    })
    router.service(AddressesService, {
      getAddressesById: (req) => {
        record('getAddressesById', req)
        const addresses: Record<string, object> = {}
        if (req.addressIds.includes(IDS.address)) {
          addresses[IDS.address] = {
            addressId: IDS.address,
            formattedAddress: '2 Fixture Way, Testville ZZ000',
            addressLine1: '2 Fixture Way',
            locality: 'Testville',
            postalCode: 'ZZ000',
            administrativeArea: { code: 'ZZ-FX', name: 'Fixture Province' },
            country: { code: 'ZZ', name: 'Testland' },
            coordinates: { latitude: -39.9998, longitude: -139.9994 },
          }
        }
        return { addresses }
      },
    })
    router.service(ImprovementsService, {
      getImprovementTypes: () => {
        record('getImprovementTypes', {})
        if (options.failImprovementLookups) throw new ConnectError('reader down', Code.Unavailable)
        return {
          improvementTypes: {
            [IDS.improvementType]: {
              id: IDS.improvementType,
              name: 'Single family dwelling',
              code: 'SFD',
              description: 'Fixture dwelling',
            },
          },
        }
      },
      getImprovementConditions: () => {
        record('getImprovementConditions', {})
        if (options.failImprovementLookups) throw new ConnectError('reader down', Code.Unavailable)
        return {
          improvementConditions: {
            [IDS.improvementCondition]: {
              id: IDS.improvementCondition,
              name: 'Average',
              depreciationModifier: 0.8,
            },
          },
        }
      },
      getImprovementQualities: () => {
        record('getImprovementQualities', {})
        if (options.failImprovementLookups) throw new ConnectError('reader down', Code.Unavailable)
        return {
          improvementQualities: {
            [IDS.improvementQuality]: {
              id: IDS.improvementQuality,
              name: 'Fixture Standard',
              qualityAdjustmentModifier: 1,
            },
          },
        }
      },
      getImprovementsByAddressId: (req) => {
        record('getImprovementsByAddressId', req)
        return {
          improvements: [{ improvementId: IDS.improvement, parcelIds: [IDS.parcel] }],
          pageInfo: { hasNextPage: false },
        }
      },
    })
    router.service(PartiesService, {
      getPartiesByAddressId: (req) => {
        record('getPartiesByAddressId', req)
        if (options.failPartiesByAddress) throw new ConnectError('reader down', Code.Unavailable)
        return {
          parties: [{ partyId: IDS.partyA, name: 'Fixture Owner 2', mailingAddressId: IDS.address }],
          pageInfo: { hasNextPage: false },
        }
      },
      getPartiesById: (req) => {
        record('getPartiesById', req)
        const parties: Record<string, object> = {}
        if (req.partyIds.includes(IDS.partyA)) {
          parties[IDS.partyA] = {
            partyId: IDS.partyA,
            name: 'Fixture Owner 2',
            mailingAddressId: IDS.address,
            mailingAddress: '2 Fixture Way, Testville ZZ000',
          }
        }
        if (req.partyIds.includes(IDS.partyC)) {
          parties[IDS.partyC] = { partyId: IDS.partyC, name: 'Fixture Owner 4', mailingAddress: 'PO Box 4' }
        }
        return { parties }
      },
    })
    options.register?.(router)
  })
  return { transport, calls: log }
}
