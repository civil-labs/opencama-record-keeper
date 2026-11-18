// Land use, zoning and neighborhood pages (spec: Land use, zoning,
// neighborhood). Each shows one entry from its whole-table lookup, which the
// route's loader has already fetched; an ID missing from it is "Not found".
import { useTransport } from '@connectrpc/connect-query'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { notFound, useParams } from '@tanstack/react-router'
import {
  landUsesQuery,
  neighborhoodDefinitionsQuery,
  neighborhoodsQuery,
  zoningQuery,
} from '../api/lookups.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { Fields } from '../components/Fields.tsx'

/** The entry for `id`, or a "Not found" for the route. */
function entry<T>(map: Record<string, T>, id: string): T {
  const value = map[id]
  if (value === undefined) throw notFound()
  return value
}

export function LandUsePage() {
  const { landUseId } = useParams({ from: '/app/land-uses/$landUseId' })
  const { data } = useSuspenseQuery(landUsesQuery(useTransport()))
  const landUse = entry(data.landUses, landUseId)
  return (
    <>
      <h1>Land use: {landUse.name}</h1>
      <Fields
        fields={[
          { label: 'ID', kind: 'text', value: landUse.id },
          { label: 'Name', kind: 'text', value: landUse.name },
          { label: 'Code', kind: 'text', value: landUse.code },
          { label: 'Description', kind: 'text', value: landUse.description },
          {
            label: 'Land use type',
            kind: 'record',
            type: 'landUseType',
            id: landUse.landUseTypeId,
            text: landUse.landUseTypeName,
          },
        ]}
      />
    </>
  )
}

export function ZoningPage() {
  const { zoningId } = useParams({ from: '/app/zoning/$zoningId' })
  const { data } = useSuspenseQuery(zoningQuery(useTransport()))
  const zoning = entry(data.zoning, zoningId)
  return (
    <>
      <h1>Zoning: {zoning.name}</h1>
      <Fields
        fields={[
          { label: 'ID', kind: 'text', value: zoning.id },
          { label: 'Name', kind: 'text', value: zoning.name },
          { label: 'Code', kind: 'text', value: zoning.code },
          { label: 'Max FAR', kind: 'text', value: zoning.maxFar },
          { label: 'Min lot size (sq ft)', kind: 'text', value: zoning.minLotSizeSqFt },
          { label: 'Max height (ft)', kind: 'text', value: zoning.maxHeightFt },
          {
            label: 'Max dwelling units per acre',
            kind: 'text',
            value: zoning.maxDwellingUnitsPerAcre,
          },
          { label: 'Max lot coverage (%)', kind: 'text', value: zoning.maxLotCoveragePct },
        ]}
      />
    </>
  )
}

export function NeighborhoodPage() {
  const { neighborhoodId } = useParams({ from: '/app/neighborhoods/$neighborhoodId' })
  const transport = useTransport()
  const { data } = useSuspenseQuery(neighborhoodsQuery(transport))
  const neighborhood = entry(data.neighborhoods, neighborhoodId)
  return (
    <>
      <h1>Neighborhood: {neighborhood.name}</h1>
      <Fields
        fields={[
          { label: 'ID', kind: 'text', value: neighborhood.id },
          { label: 'Name', kind: 'text', value: neighborhood.name },
        ]}
      />
      <DefinitionsSection ids={neighborhood.neighborhoodDefinitionIds} />
    </>
  )
}

/**
 * The definitions that use a neighborhood, by name. Definitions have no page,
 * so they're plain text. A secondary section: it loads and fails on its own.
 */
function DefinitionsSection({ ids }: { ids: string[] }) {
  const definitions = useQuery(neighborhoodDefinitionsQuery(useTransport()))
  return (
    <section>
      <h2>Neighborhood definitions</h2>
      {definitions.isError ? (
        <ErrorAlert error={definitions.error} />
      ) : ids.length === 0 ? (
        <p>None.</p>
      ) : (
        <ul>
          {ids.map((id) => (
            <li key={id}>
              {definitions.data?.neighborhoodDefinitions[id]?.name ?? id}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
