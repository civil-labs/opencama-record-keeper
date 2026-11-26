// An improvement (spec: Improvement page): its fields, then the parcels it
// sits on and the owners recorded on it. Both lists come whole with the
// improvement, so neither is paginated. No values: the app chooses no
// valuation.
import type { Improvement, ImprovementShare } from '@civil-labs/civil-os-api'
import { useTransport } from '@connectrpc/connect-query'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { notFound, useParams } from '@tanstack/react-router'
import { improvementQuery } from '../api/improvements.ts'
import {
  improvementConditionsQuery,
  improvementQualitiesQuery,
  improvementTypesQuery,
  labels,
} from '../api/lookups.ts'
import { partiesByIdQuery } from '../api/parties.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { Fields, type Field } from '../components/Fields.tsx'
import { RecordLink } from '../links.tsx'

type Names = Record<string, string | undefined>

/**
 * The heading's label: "{type} at {address}" when both are known, either one
 * alone, else the ID. A type is known once the types lookup names it.
 */
export function improvementLabel(improvement: Improvement, typeNames: Names): string {
  const type = typeNames[improvement.typeId]
  const address = improvement.formattedAddress
  if (type && address) return `${type} at ${address}`
  return type || address || improvement.improvementId
}

/**
 * The fields, in proto order. Every count is optional and passed straight
 * through: unset shows as "—", and a recorded 0 as "0".
 */
export function improvementFields(
  improvement: Improvement,
  names: { types: Names; conditions: Names; qualities: Names },
): Field[] {
  const { conditionId, qualityId } = improvement
  return [
    { label: 'Improvement ID', kind: 'text', value: improvement.improvementId },
    {
      label: 'Type',
      kind: 'record',
      type: 'improvementType',
      id: improvement.typeId,
      text: names.types[improvement.typeId],
    },
    {
      label: 'Condition',
      kind: 'record',
      type: 'improvementCondition',
      id: conditionId,
      text: conditionId && names.conditions[conditionId],
    },
    {
      label: 'Quality',
      kind: 'record',
      type: 'improvementQuality',
      id: qualityId,
      text: qualityId && names.qualities[qualityId],
    },
    {
      label: 'Address',
      kind: 'record',
      type: 'address',
      id: improvement.addressId,
      text: improvement.formattedAddress,
    },
    { label: 'Area (sq ft)', kind: 'text', value: improvement.areaSqFt },
    { label: 'Full bathrooms', kind: 'text', value: improvement.fullBathrooms },
    { label: 'Half bathrooms', kind: 'text', value: improvement.halfBathrooms },
    { label: 'Bathrooms', kind: 'text', value: improvement.bathrooms },
    { label: 'Bedrooms', kind: 'text', value: improvement.bedrooms },
    { label: 'Units', kind: 'text', value: improvement.units },
    { label: 'Year built', kind: 'text', value: improvement.yearBuilt },
    { label: 'Effective year built', kind: 'text', value: improvement.effectiveYearBuilt },
    { label: 'Properties', kind: 'json', value: improvement.properties },
  ]
}

export function ImprovementPage() {
  const { improvementId } = useParams({ from: '/app/improvements/$improvementId' })
  const transport = useTransport()
  const { data } = useSuspenseQuery(improvementQuery(transport, improvementId))
  // A lookup that's loading or failed leaves its IDs unlabelled.
  const types = useQuery(improvementTypesQuery(transport))
  const conditions = useQuery(improvementConditionsQuery(transport))
  const qualities = useQuery(improvementQualitiesQuery(transport))
  const improvement = data.improvements[improvementId]
  if (!improvement) throw notFound()
  const names = {
    types: labels(types.data?.improvementTypes),
    conditions: labels(conditions.data?.improvementConditions),
    qualities: labels(qualities.data?.improvementQualities),
  }
  return (
    <>
      <h1>Improvement: {improvementLabel(improvement, names.types)}</h1>
      <Fields fields={improvementFields(improvement, names)} />
      <ParcelsSection improvement={improvement} />
      <OwnersSection owners={improvement.parties} />
    </>
  )
}

/**
 * Every visible parcel the improvement sits on. Always a list: never read as
 * one parcel. "Primary on parcel" is whether this is that parcel's primary
 * improvement, not a main parcel for the improvement.
 */
function ParcelsSection({ improvement }: { improvement: Improvement }) {
  return (
    <section>
      <h2>Parcels</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Parcel</th>
            <th scope="col">Primary on parcel</th>
          </tr>
        </thead>
        <tbody>
          {improvement.parcels.map((link) => (
            <tr key={link.parcelId}>
              <td>
                <RecordLink type="parcel" id={link.parcelId} />
              </td>
              <td>{link.isPrimary ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/**
 * The owners recorded on the improvement itself, named by one batched read.
 * The rows show at once with IDs, and take names as they arrive.
 */
function OwnersSection({ owners }: { owners: ImprovementShare[] }) {
  const partyIds = owners.map((owner) => owner.partyId)
  const names = useQuery(partiesByIdQuery(useTransport(), partyIds))
  if (owners.length === 0) {
    return (
      <section>
        <h2>Owners</h2>
        <p>
          No owners are recorded on this improvement. Its parcels&apos; owners are on each
          parcel&apos;s page.
        </p>
      </section>
    )
  }
  return (
    <section>
      <h2>Owners</h2>
      {names.isError && <ErrorAlert error={names.error} />}
      <table>
        <thead>
          <tr>
            <th scope="col">Party</th>
            <th scope="col">Ownership share</th>
          </tr>
        </thead>
        <tbody>
          {owners.map((owner) => (
            <tr key={owner.partyId}>
              <td>
                <RecordLink
                  type="party"
                  id={owner.partyId}
                  label={names.data?.parties[owner.partyId]?.name}
                />
              </td>
              <td>{owner.ownershipShare}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
