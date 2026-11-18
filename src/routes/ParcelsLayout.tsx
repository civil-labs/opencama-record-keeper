// The parcels page (spec: Parcels): the map on the left, and the selected
// parcel's details in a pane on the right. The map belongs to this layout, so
// it stays mounted while the selection, a child route, changes.
import * as stylex from '@stylexjs/stylex'
import { Outlet } from '@tanstack/react-router'
import { ParcelMap } from '../map/ParcelMap.tsx'
import { sizes, spacing } from '../theme/tokens.stylex.ts'

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
  return (
    <div {...stylex.props(styles.grid)}>
      <div {...stylex.props(styles.map)}>
        <ParcelMap />
      </div>
      <section aria-label="Parcel details" {...stylex.props(styles.pane)}>
        <Outlet />
      </section>
    </div>
  )
}
