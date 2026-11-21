import * as stylex from '@stylexjs/stylex'
import { Link } from '@tanstack/react-router'
import { useSyncExternalStore } from 'react'
import { userDisplayName, type Auth } from '../auth.ts'
import type { RecentPicks } from '../search/recentPicks.ts'
import { sizes, spacing } from '../theme/tokens.stylex.ts'
import { AddressSearch } from './AddressSearch.tsx'

const styles = stylex.create({
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    height: sizes.navbarHeight,
    paddingInline: spacing.medium,
    whiteSpace: 'nowrap',
  },
  user: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.medium,
    minWidth: 0,
  },
  // Gives way first when the navbar is narrow.
  userName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // A button that looks like a link: it triggers an action, not a navigation.
  signOut: {
    appearance: 'none',
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
    font: 'inherit',
    color: 'LinkText',
    textDecoration: 'underline',
    cursor: 'pointer',
    outline: {
      default: null,
      ':focus-visible': '2px solid',
    },
    outlineOffset: '2px',
  },
})

export function Navbar({
  auth,
  recentPicks,
}: {
  auth: Pick<Auth, 'subscribe' | 'getUser' | 'signOut'>
  recentPicks: RecentPicks
}) {
  const user = useSyncExternalStore(auth.subscribe, auth.getUser)
  return (
    <nav {...stylex.props(styles.nav)}>
      <Link to="/parcels">Record Keeper</Link>
      <AddressSearch recentPicks={recentPicks} />
      <div {...stylex.props(styles.user)}>
        {user && <span {...stylex.props(styles.userName)}>{userDisplayName(user)}</span>}
        <button
          type="button"
          onClick={() => void auth.signOut()}
          {...stylex.props(styles.signOut)}
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
