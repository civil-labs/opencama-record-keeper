// The selected parcel's details, in the parcels page's right pane (spec:
// Detail pane). The route's loader has already fetched the parcel and the
// lookups; this reads them from the cache.
import type { ParcelDetails, ParcelImprovementsSummary } from '@civil-labs/civil-os-api'
import { useTransport } from '@connectrpc/connect-query'
import { useQuery } from '@tanstack/react-query'
import { notFound, useParams } from '@tanstack/react-router'
import {
  improvementConditionsQuery,
  labels,
  landUsesQuery,
  neighborhoodsQuery,
  zoningQuery,
} from '../api/lookups.ts'
import { parcelQuery } from '../api/parcels.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { Fields, type Field } from '../components/Fields.tsx'
import { TransfersList, useTransfersByParcel } from '../components/TransfersList.tsx'
import { useNeighborhoodDefinition } from './NeighborhoodDefinitionSelect.tsx'

function parcelFields(
  parcel: ParcelDetails,
  names: {
    landUses: Record<string, string>
    zoning: Record<string, string>
    neighborhoods: Record<string, string>
  },
  /** The neighborhood is being read under a newly selected definition. */
  neighborhoodLoading: boolean,
): Field[] {
  return [
    { label: 'Parcel ID', kind: 'text', value: parcel.parcelId },
    // Plain text: the map already shows the parcel.
    { label: 'Feature ID', kind: 'text', value: parcel.featureId },
    { label: 'Address', kind: 'text', value: parcel.formattedAddress },
    {
      label: 'Address record',
      kind: 'record',
      type: 'address',
      id: parcel.addressId,
      text: parcel.formattedAddress,
    },
    { label: 'Primary owner', kind: 'text', value: parcel.primaryOwnerName },
    { label: 'Primary owner address', kind: 'text', value: parcel.primaryOwnerAddress },
    { label: 'Parties', kind: 'records', type: 'party', ids: parcel.partyIds },
    {
      label: 'Land use',
      kind: 'record',
      type: 'landUse',
      id: parcel.landUseId,
      text: parcel.landUseId && names.landUses[parcel.landUseId],
    },
    neighborhoodLoading
      ? { label: 'Neighborhood', kind: 'text', value: 'Loading…' }
      : {
          label: 'Neighborhood',
          kind: 'record',
          type: 'neighborhood',
          id: parcel.neighborhoodId,
          text: parcel.neighborhoodId && names.neighborhoods[parcel.neighborhoodId],
        },
    { label: 'Land area (sq ft)', kind: 'text', value: parcel.landAreaSqFt },
    { label: 'Frontage (ft)', kind: 'text', value: parcel.frontageFt },
    { label: 'Depth (ft)', kind: 'text', value: parcel.depthFt },
    {
      label: 'Zoning',
      kind: 'records',
      type: 'zoning',
      ids: parcel.zoningIds,
      labels: names.zoning,
    },
    { label: 'Market land value', kind: 'text', value: parcel.marketLandValue },
    { label: 'Assessed land value', kind: 'text', value: parcel.assessedLandValue },
    { label: 'Properties', kind: 'json', value: parcel.properties },
  ]
}

/**
 * A parcel's bathrooms as counts: "2 full, 1 half", or "3 full" with no half
 * baths. Undefined, shown as empty, when both are 0 (civil-os reports 0 for
 * counts that aren't recorded).
 */
export function formatBathrooms(full: number, half: number): string | undefined {
  const parts = []
  if (full > 0) parts.push(`${full} full`)
  if (half > 0) parts.push(`${half} half`)
  return parts.length ? parts.join(', ') : undefined
}

function improvementFields(
  summary: ParcelImprovementsSummary | undefined,
  conditions: Record<string, string>,
): Field[] {
  return [
    {
      label: 'Improvements',
      kind: 'records',
      type: 'improvement',
      ids: summary?.improvementIds ?? [],
    },
    {
      label: 'Primary improvement',
      kind: 'record',
      type: 'improvement',
      id: summary?.primaryImprovementId,
    },
    { label: 'Total area (sq ft)', kind: 'text', value: summary?.totalAreaSqFt },
    {
      label: 'Bathrooms',
      kind: 'text',
      value: summary && formatBathrooms(summary.totalFullBathrooms, summary.totalHalfBathrooms),
    },
    { label: 'Total bedrooms', kind: 'text', value: summary?.totalBedrooms },
    { label: 'Total units', kind: 'text', value: summary?.totalUnits },
    { label: 'Primary year built', kind: 'text', value: summary?.primaryYearBuilt },
    {
      label: 'Primary effective year built',
      kind: 'text',
      value: summary?.primaryEffectiveYearBuilt,
    },
    {
      label: 'Primary condition',
      kind: 'record',
      type: 'improvementCondition',
      id: summary?.primaryConditionId,
      text: summary?.primaryConditionId && conditions[summary.primaryConditionId],
    },
    {
      label: 'Total market improvement value',
      kind: 'text',
      value: summary?.totalMarketImprovementValue,
    },
    {
      label: 'Total assessed improvement value',
      kind: 'text',
      value: summary?.totalAssessedImprovementValue,
    },
  ]
}

export function ParcelPane() {
  const { parcelId } = useParams({ from: '/app/parcels/$parcelId' })
  const transport = useTransport()
  const { definitionId } = useNeighborhoodDefinition()
  // The loader fetched this under the same definition. A new definition is a
  // new query: keep showing this parcel's previous result while it loads.
  const query = useQuery({
    ...parcelQuery(transport, parcelId, definitionId),
    placeholderData: (previous) => (previous?.parcels[parcelId] ? previous : undefined),
  })
  const landUses = useQuery(landUsesQuery(transport))
  const zoning = useQuery(zoningQuery(transport))
  const neighborhoods = useQuery(neighborhoodsQuery(transport))
  const conditions = useQuery(improvementConditionsQuery(transport))

  if (query.isPending) return <p>Loading…</p>
  if (query.isError) return <ErrorAlert error={query.error} />
  const parcel = query.data.parcels[parcelId]
  // A parcel the loader found can drop out of a later read (voided since).
  if (!parcel?.parcelDetails) throw notFound()
  const details = parcel.parcelDetails

  return (
    <>
      <h1>Parcel: {details.formattedAddress || details.parcelId}</h1>
      {details.featureId === undefined && <p>This parcel has no map geometry.</p>}
      <Fields
        fields={parcelFields(details, {
          landUses: labels(landUses.data?.landUses),
          zoning: labels(zoning.data?.zoning),
          neighborhoods: labels(neighborhoods.data?.neighborhoods),
        }, query.isPlaceholderData)}
      />
      <section>
        <h2>Improvements</h2>
        <Fields
          fields={improvementFields(
            parcel.improvementSummary,
            labels(conditions.data?.improvementConditions),
          )}
        />
      </section>
      <ParcelTransfers parcelId={parcelId} />
    </>
  )
}

function ParcelTransfers({ parcelId }: { parcelId: string }) {
  const transfers = useTransfersByParcel(parcelId)
  return (
    <section>
      <h2>Transfers</h2>
      <TransfersList query={transfers} />
    </section>
  )
}
