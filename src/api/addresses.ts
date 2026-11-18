// Query options for addresses (spec: Address).
import { AddressesService } from '@civil-labs/civil-os-api'
import type { Transport } from '@connectrpc/connect'
import { createQueryOptions, useInfiniteQuery } from '@connectrpc/connect-query'
import { FIRST_PAGE, PAGE_SIZE, pagedOptions } from '../components/PagedList.tsx'

/** One address, from the `addresses` map keyed by ID. */
export const addressQuery = (transport: Transport, addressId: string) =>
  createQueryOptions(
    AddressesService.method.getAddressesById,
    { addressIds: [addressId] },
    { transport },
  )

/** The parcels at an address, a page at a time. */
export const useParcelsByAddress = (addressId: string) =>
  useInfiniteQuery(
    AddressesService.method.getParcelsByAddressId,
    { addressId, first: PAGE_SIZE, after: FIRST_PAGE },
    pagedOptions,
  )

/** The improvements at an address, a page at a time. */
export const useImprovementsByAddress = (addressId: string) =>
  useInfiniteQuery(
    AddressesService.method.getImprovementsByAddressId,
    { addressId, first: PAGE_SIZE, after: FIRST_PAGE },
    pagedOptions,
  )

/** The parties using an address as their mailing address, a page at a time. */
export const usePartiesByAddress = (addressId: string) =>
  useInfiniteQuery(
    AddressesService.method.getPartiesByAddressId,
    { addressId, first: PAGE_SIZE, after: FIRST_PAGE },
    pagedOptions,
  )
