// The <dl> of a record's fields, following the spec's rendering rule.
import { Fragment } from 'react'
import { RecordLink, type RecordType } from '../links.tsx'

/** A protobuf Timestamp, as protobuf-es generates it. */
export interface Timestamp {
  seconds: bigint
  nanos: number
}

export type Field = { label: string } & (
  | {
      /** A plain value: strings, decimal strings and numbers are shown as returned. */
      kind: 'text'
      value: string | number | bigint | boolean | null | undefined
    }
  | {
      /** The ID of another record, linked if its type has a page. */
      kind: 'record'
      type: RecordType
      id: string | null | undefined
      /** The record's label, when it's already known. */
      text?: string | undefined
    }
  | {
      /** Several IDs of one record type, each linked if its type has a page. */
      kind: 'records'
      type: RecordType
      ids: readonly string[]
      /** Labels by ID, when they're already known. */
      labels?: Readonly<Record<string, string | undefined>>
    }
  | { kind: 'timestamp'; value: Timestamp | null | undefined }
  | {
      /** A JSON string, such as `properties`: pretty-printed in a <pre>. */
      kind: 'json'
      value: string | null | undefined
    }
  | { kind: 'url'; value: string | null | undefined }
)

const EMPTY = '—'

const isEmpty = (value: unknown) =>
  value === undefined || value === null || value === ''

/** ISO 8601, in UTC. */
export function formatTimestamp(timestamp: Timestamp): string {
  const millis = Number(timestamp.seconds) * 1000 + Math.floor(timestamp.nanos / 1e6)
  return new Date(millis).toISOString()
}

/** Only http and https URLs become links; anything else (javascript:) is text. */
export function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function prettyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function FieldValue({ field }: { field: Field }) {
  switch (field.kind) {
    case 'text':
      return isEmpty(field.value) ? EMPTY : String(field.value)
    case 'record':
      return isEmpty(field.id) || !field.id ? (
        EMPTY
      ) : (
        <RecordLink type={field.type} id={field.id} label={field.text} />
      )
    case 'records':
      if (field.ids.length === 0) return EMPTY
      return field.ids.map((id, index) => (
        <Fragment key={id}>
          {index > 0 && ', '}
          <RecordLink type={field.type} id={id} label={field.labels?.[id]} />
        </Fragment>
      ))
    case 'timestamp':
      return field.value ? formatTimestamp(field.value) : EMPTY
    case 'json':
      return isEmpty(field.value) || !field.value ? (
        EMPTY
      ) : (
        <pre>{prettyJson(field.value)}</pre>
      )
    case 'url':
      if (isEmpty(field.value) || !field.value) return EMPTY
      return isWebUrl(field.value) ? (
        <a href={field.value} rel="noreferrer noopener" target="_blank">
          {field.value}
        </a>
      ) : (
        field.value
      )
  }
}

export function Fields({ fields }: { fields: Field[] }) {
  return (
    <dl>
      {fields.map((field) => (
        <div key={field.label}>
          <dt>{field.label}</dt>
          <dd>
            <FieldValue field={field} />
          </dd>
        </div>
      ))}
    </dl>
  )
}
