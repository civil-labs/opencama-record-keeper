// A party (spec: Party): its name and mailing address, then its parcels with
// their shares, and its transfers. Each section loads and paginates on its own.
import { useTransport } from '@connectrpc/connect-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { notFound, useParams } from '@tanstack/react-router'
import { parcelsByPartyRows, partyQuery, useParcelsByParty } from '../api/parties.ts'
import { Fields } from '../components/Fields.tsx'
import { PagedList } from '../components/PagedList.tsx'
import { TransfersList, useTransfersByParty } from '../components/TransfersList.tsx'
import { RecordLink } from '../links.tsx'

export function PartyPage() {
  const { partyId } = useParams({ from: '/app/parties/$partyId' })
  const { data } = useSuspenseQuery(partyQuery(useTransport(), partyId))
  const party = data.parties[partyId]
  if (!party) throw notFound()
  return (
    <>
      <h1>Party: {party.name || party.partyId}</h1>
      <Fields
        fields={[
          { label: 'Party ID', kind: 'text', value: party.partyId },
          { label: 'Name', kind: 'text', value: party.name },
          // Linked when the address record is known; otherwise the text alone.
          party.mailingAddressId
            ? {
                label: 'Mailing address',
                kind: 'record',
                type: 'address',
                id: party.mailingAddressId,
                text: party.mailingAddress,
              }
            : { label: 'Mailing address', kind: 'text', value: party.mailingAddress },
        ]}
      />
      <ParcelsSection partyId={partyId} />
      <TransfersSection partyId={partyId} />
    </>
  )
}

function ParcelsSection({ partyId }: { partyId: string }) {
  return (
    <section>
      <h2>Parcels</h2>
      <PagedList query={useParcelsByParty(partyId)} rows={parcelsByPartyRows}>
        {(parcels) => (
          <table>
            <thead>
              <tr>
                <th scope="col">Parcel</th>
                <th scope="col">Ownership share</th>
              </tr>
            </thead>
            <tbody>
              {parcels.map((parcel) => (
                <tr key={parcel.parcelId}>
                  <td>
                    <RecordLink type="parcel" id={parcel.parcelId} />
                  </td>
                  <td>{parcel.ownershipShare}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PagedList>
    </section>
  )
}

function TransfersSection({ partyId }: { partyId: string }) {
  return (
    <section>
      <h2>Transfers</h2>
      <TransfersList query={useTransfersByParty(partyId)} />
    </section>
  )
}
