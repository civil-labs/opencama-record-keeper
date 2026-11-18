// An address (spec: Address): its fields, then what uses it. Each section
// loads and paginates on its own.
import type { Address } from '@civil-labs/civil-os-api'
import { useTransport } from '@connectrpc/connect-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { notFound, useParams } from '@tanstack/react-router'
import { Fragment } from 'react'
import {
  addressQuery,
  useImprovementsByAddress,
  useParcelsByAddress,
  usePartiesByAddress,
} from '../api/addresses.ts'
import { Fields, type Field } from '../components/Fields.tsx'
import { PagedList } from '../components/PagedList.tsx'
import { RecordLink } from '../links.tsx'

/** "Name (code)", or whichever of the two is set. */
export function nameAndCode(value: { name: string; code: string } | undefined): string {
  if (!value) return ''
  if (value.name && value.code) return `${value.name} (${value.code})`
  return value.name || value.code
}

/** "latitude, longitude", as plain text. */
export function formatCoordinates(
  coordinates: { latitude: number; longitude: number } | undefined,
): string {
  return coordinates ? `${String(coordinates.latitude)}, ${String(coordinates.longitude)}` : ''
}

/** Every Address field, in proto order. */
function addressFields(address: Address): Field[] {
  return [
    { label: 'Address ID', kind: 'text', value: address.addressId },
    { label: 'Formatted address', kind: 'text', value: address.formattedAddress },
    { label: 'Address line 1', kind: 'text', value: address.addressLine1 },
    { label: 'Address line 2', kind: 'text', value: address.addressLine2 },
    { label: 'Address line 3', kind: 'text', value: address.addressLine3 },
    { label: 'Locality', kind: 'text', value: address.locality },
    { label: 'Sublocality', kind: 'text', value: address.sublocality },
    { label: 'Postal code', kind: 'text', value: address.postalCode },
    {
      label: 'Administrative area',
      kind: 'text',
      value: nameAndCode(address.administrativeArea),
    },
    { label: 'Country', kind: 'text', value: nameAndCode(address.country) },
    { label: 'Coordinates', kind: 'text', value: formatCoordinates(address.coordinates) },
  ]
}

export function AddressPage() {
  const { addressId } = useParams({ from: '/app/addresses/$addressId' })
  const { data } = useSuspenseQuery(addressQuery(useTransport(), addressId))
  const address = data.addresses[addressId]
  if (!address) throw notFound()
  return (
    <>
      <h1>Address: {address.formattedAddress || address.addressId}</h1>
      <Fields fields={addressFields(address)} />
      <ParcelsSection addressId={addressId} />
      <ImprovementsSection addressId={addressId} />
      <PartiesSection addressId={addressId} />
    </>
  )
}

function ParcelsSection({ addressId }: { addressId: string }) {
  return (
    <section>
      <h2>Parcels at this address</h2>
      <PagedList query={useParcelsByAddress(addressId)}>
        {(parcels) => (
          <ul>
            {parcels.map((parcel) => (
              <li key={parcel.parcelId}>
                <RecordLink type="parcel" id={parcel.parcelId} />
              </li>
            ))}
          </ul>
        )}
      </PagedList>
    </section>
  )
}

function ImprovementsSection({ addressId }: { addressId: string }) {
  return (
    <section>
      <h2>Improvements at this address</h2>
      <PagedList query={useImprovementsByAddress(addressId)}>
        {(improvements) => (
          <table>
            <thead>
              <tr>
                <th scope="col">Improvement</th>
                <th scope="col">Parcels</th>
              </tr>
            </thead>
            <tbody>
              {improvements.map((improvement) => (
                <tr key={improvement.improvementId}>
                  <td>
                    <RecordLink type="improvement" id={improvement.improvementId} />
                  </td>
                  <td>
                    {improvement.parcelIds.length === 0
                      ? '—'
                      : improvement.parcelIds.map((parcelId, index) => (
                          <Fragment key={parcelId}>
                            {index > 0 && ', '}
                            <RecordLink type="parcel" id={parcelId} />
                          </Fragment>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PagedList>
    </section>
  )
}

function PartiesSection({ addressId }: { addressId: string }) {
  return (
    <section>
      <h2>Parties using this as their mailing address</h2>
      <PagedList query={usePartiesByAddress(addressId)}>
        {(parties) => (
          <ul>
            {parties.map((party) => (
              <li key={party.partyId}>
                <RecordLink type="party" id={party.partyId} label={party.name} />
              </li>
            ))}
          </ul>
        )}
      </PagedList>
    </section>
  )
}
