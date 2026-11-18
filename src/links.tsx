// Every link to a record goes through <RecordLink> (spec: Rendering rule).
// The table below maps each record type to its typed route, so no page builds
// a URL by hand, and giving a type a route later links its IDs everywhere.
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

const routed = {
  parcel: (id: string, children: ReactNode) => (
    <Link to="/parcels/$parcelId" params={{ parcelId: id }}>
      {children}
    </Link>
  ),
  address: (id: string, children: ReactNode) => (
    <Link to="/addresses/$addressId" params={{ addressId: id }}>
      {children}
    </Link>
  ),
  party: (id: string, children: ReactNode) => (
    <Link to="/parties/$partyId" params={{ partyId: id }}>
      {children}
    </Link>
  ),
  transfer: (id: string, children: ReactNode) => (
    <Link to="/transfers/$transferId" params={{ transferId: id }}>
      {children}
    </Link>
  ),
  landUse: (id: string, children: ReactNode) => (
    <Link to="/land-uses/$landUseId" params={{ landUseId: id }}>
      {children}
    </Link>
  ),
  zoning: (id: string, children: ReactNode) => (
    <Link to="/zoning/$zoningId" params={{ zoningId: id }}>
      {children}
    </Link>
  ),
  neighborhood: (id: string, children: ReactNode) => (
    <Link to="/neighborhoods/$neighborhoodId" params={{ neighborhoodId: id }}>
      {children}
    </Link>
  ),
} satisfies Record<string, (id: string, children: ReactNode) => ReactNode>

export type RoutedRecordType = keyof typeof routed

/** Record types with no page yet. Their IDs are shown as plain text. */
export type UnroutedRecordType =
  | 'improvement'
  | 'improvementType'
  | 'improvementCondition'
  | 'landUseType'
  | 'neighborhoodDefinition'

export type RecordType = RoutedRecordType | UnroutedRecordType

export function hasRoute(type: RecordType): type is RoutedRecordType {
  return Object.hasOwn(routed, type)
}

/**
 * A reference to another record: a link to its page if the type has one,
 * otherwise plain text. The text is `label` when it's known, else the ID.
 */
export function RecordLink({
  type,
  id,
  label,
}: {
  type: RecordType
  id: string
  label?: string | undefined
}) {
  const text = label !== undefined && label !== '' ? label : id
  return hasRoute(type) ? routed[type](id, text) : <>{text}</>
}

// Feature IDs: MapLibre gives a vector tile feature's id as a number; the API
// takes and returns int64 feature IDs as bigint. Civil OS feature IDs stay
// below 2^53, so the conversion is exact, and anything else is an error.

export function featureIdToBigInt(id: number): bigint {
  if (!Number.isSafeInteger(id) || id < 0) {
    throw new RangeError(`not a feature ID: ${String(id)}`)
  }
  return BigInt(id)
}

export function featureIdToNumber(id: bigint): number {
  if (id < 0n || id > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`feature ID out of range: ${id.toString()}`)
  }
  return Number(id)
}
