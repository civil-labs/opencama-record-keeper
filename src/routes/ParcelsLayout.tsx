// The parcels page (spec: Parcels): the map on the left, and the selected
// parcel's details in a pane on the right. The map belongs to this layout, so
// it stays mounted while the selection, a child route, changes.
import * as stylex from '@stylexjs/stylex'
import { Outlet, useParams } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { ParcelMap } from '../map/ParcelMap.tsx'
import { sizes, spacing } from '../theme/tokens.stylex.ts'
import { NeighborhoodDefinitionSelect } from './NeighborhoodDefinitionSelect.tsx'

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: `1fr minmax(${sizes.detailPaneMinWidth}, ${sizes.detailPaneMaxWidth})`,
    height: '100%',
  },
  map: {
    position: 'relative',
    minWidth: 0,
    minHeight: 0,
  },
  pane: {
    minHeight: 0,
    overflowY: 'auto',
    padding: spacing.medium,
  },
})

export function ParcelsLayout() {
  const { parcelId } = useParams({ strict: false })
  // A message from the map, such as a clicked feature with no parcel record.
  // It belongs to the selection it was raised under, and goes away with it.
  const [note, setNote] = useState<{ parcelId: string | undefined; message: string }>()
  const onNote = useCallback(
    (message: string) => setNote({ parcelId, message }),
    [parcelId],
  )
  return (
    <div {...stylex.props(styles.grid)}>
      <div {...stylex.props(styles.map)}>
        <ParcelMap onNote={onNote} />
      </div>
      <section aria-label="Parcel details" {...stylex.props(styles.pane)}>
        {/* Part of the layout, so it stays put while the selection changes. */}
        <NeighborhoodDefinitionSelect />
        {note && note.parcelId === parcelId && <p role="status">{note.message}</p>}
        <Outlet />
      </section>
    </div>
  )
}
