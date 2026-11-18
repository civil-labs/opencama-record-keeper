// The selected parcel's details, in the parcels page's right pane (spec:
// Detail pane). The route's loader has already fetched the parcel and the
// lookups; this reads them from the cache.
import type { ParcelDetails, ParcelImprovementsSummary } from '@civil-labs/civil-os-api'
import { useTransport } from '@connectrpc/connect-query'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { notFound, useParams } from '@tanstack/react-router'
import { landUsesQuery, neighborhoodsQuery, zoningQuery } from '../api/lookups.ts'
import { parcelQuery } from '../api/parcels.ts'
import { Fields, type Field } from '../components/Fields.tsx'

/** A label for each ID that a lookup map knows, by its `name`. */
function labels(map: Record<string, { name: string }> | undefined) {
  return Object.fromEntries(Object.entries(map ?? {}).map(([id, { name }]) => [id, name]))
}

function parcelFields(
  parcel: ParcelDetails,
  names: {
    landUses: Record<string, string>
    zoning: Record<string, string>
    neighborhoods: Record<string, string>
  },
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
    {
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

function improvementFields(summary: ParcelImprovementsSummary | undefined): Field[] {
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
    { label: 'Total bathrooms', kind: 'text', value: summary?.totalBathrooms },
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
  const { data } = useSuspenseQuery(parcelQuery(transport, parcelId))
  const landUses = useQuery(landUsesQuery(transport))
  const zoning = useQuery(zoningQuery(transport))
  const neighborhoods = useQuery(neighborhoodsQuery(transport))

  const parcel = data.parcels[parcelId]
  // A parcel the loader found can drop out of a later refetch (voided since).
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
        })}
      />
      <section>
        <h2>Improvements</h2>
        <Fields fields={improvementFields(parcel.improvementSummary)} />
      </section>
    </>
  )
}
