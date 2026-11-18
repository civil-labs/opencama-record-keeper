// A real property transfer (spec: Transfer): its fields, recordings and
// codes, and who transferred what to whom.
import type { TransferShare } from '@civil-labs/civil-os-api'
import { useTransport } from '@connectrpc/connect-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { notFound, useParams } from '@tanstack/react-router'
import { Fragment, type ReactNode } from 'react'
import { transferQuery } from '../api/transfers.ts'
import { Fields, formatTimestamp, isWebUrl } from '../components/Fields.tsx'
import { RecordLink } from '../links.tsx'

const EMPTY = '—'

/** Each party as a link labeled with its name, then its share: "Name (0.5)". */
function Shares({
  shares,
  names,
}: {
  shares: readonly TransferShare[]
  names: Readonly<Record<string, string | undefined>>
}) {
  if (shares.length === 0) return EMPTY
  return shares.map((share, index) => (
    <Fragment key={share.partyId}>
      {index > 0 && ', '}
      <RecordLink type="party" id={share.partyId} label={names[share.partyId]} /> (
      {share.transferredShare})
    </Fragment>
  ))
}

/** Grantors and grantees of each parcel or improvement in the transfer. */
function SharesTable({
  heading,
  rows,
  names,
}: {
  heading: string
  rows: { key: string; record: ReactNode; grantors: TransferShare[]; grantees: TransferShare[] }[]
  names: Readonly<Record<string, string | undefined>>
}) {
  return (
    <section>
      <h2>{heading}</h2>
      {rows.length === 0 ? (
        <p>None.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">{heading.replace(/s$/, '')}</th>
              <th scope="col">Grantors (share)</th>
              <th scope="col">Grantees (share)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.record}</td>
                <td>
                  <Shares shares={row.grantors} names={names} />
                </td>
                <td>
                  <Shares shares={row.grantees} names={names} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function TransferPage() {
  const { transferId } = useParams({ from: '/app/transfers/$transferId' })
  const { data } = useSuspenseQuery(transferQuery(useTransport(), transferId))
  const transfer = data.transfers.find((t) => t.transferId === transferId)
  if (!transfer) throw notFound()
  const names = Object.fromEntries(transfer.parties.map((party) => [party.partyId, party.name]))
  const time = transfer.transferTime ? formatTimestamp(transfer.transferTime) : undefined

  return (
    <>
      <h1>Transfer: {time ?? transfer.transferId}</h1>
      <Fields
        fields={[
          { label: 'Transfer ID', kind: 'text', value: transfer.transferId },
          { label: 'Time', kind: 'timestamp', value: transfer.transferTime },
          { label: 'Amount', kind: 'text', value: transfer.transferAmount },
        ]}
      />

      <section>
        <h2>Recordings</h2>
        {transfer.recordings.length === 0 ? (
          <p>None.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Book</th>
                <th scope="col">Page</th>
                <th scope="col">URI</th>
              </tr>
            </thead>
            <tbody>
              {transfer.recordings.map((recording, index) => (
                <tr key={index}>
                  <td>{recording.book || EMPTY}</td>
                  <td>{recording.page || EMPTY}</td>
                  <td>
                    {!recording.uri ? (
                      EMPTY
                    ) : isWebUrl(recording.uri) ? (
                      <a href={recording.uri} rel="noreferrer noopener" target="_blank">
                        {recording.uri}
                      </a>
                    ) : (
                      recording.uri
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Codes</h2>
        {transfer.codes.length === 0 ? (
          <p>None.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Type</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {transfer.codes.map((code) => (
                <tr key={code.codeId}>
                  <td>{code.name}</td>
                  <td>{code.type?.name || EMPTY}</td>
                  <td>{code.description || EMPTY}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <SharesTable
        heading="Parcels"
        names={names}
        rows={transfer.parcels.map((parcel) => ({
          key: parcel.parcelId,
          record: <RecordLink type="parcel" id={parcel.parcelId} />,
          grantors: parcel.grantors,
          grantees: parcel.grantees,
        }))}
      />
      <SharesTable
        heading="Improvements"
        names={names}
        rows={transfer.improvements.map((improvement) => ({
          key: improvement.improvementId,
          record: <RecordLink type="improvement" id={improvement.improvementId} />,
          grantors: improvement.grantors,
          grantees: improvement.grantees,
        }))}
      />

      <section>
        <h2>Parties</h2>
        {transfer.parties.length === 0 ? (
          <p>None.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Party</th>
                <th scope="col">Mailing address at the time</th>
              </tr>
            </thead>
            <tbody>
              {transfer.parties.map((party) => (
                <tr key={party.partyId}>
                  <td>
                    <RecordLink type="party" id={party.partyId} label={party.name} />
                  </td>
                  <td>{party.mailingAddress || EMPTY}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
