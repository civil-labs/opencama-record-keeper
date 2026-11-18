import * as stylex from '@stylexjs/stylex'
import { Link } from '@tanstack/react-router'
import { useSyncExternalStore } from 'react'
import { userDisplayName, type Auth } from '../auth.ts'
import { sizes, spacing } from '../theme/tokens.stylex.ts'

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
}: {
  auth: Pick<Auth, 'subscribe' | 'getUser' | 'signOut'>
}) {
  const user = useSyncExternalStore(auth.subscribe, auth.getUser)
  return (
    <nav {...stylex.props(styles.nav)}>
      <Link to="/parcels">Record Keeper</Link>
      <div {...stylex.props(styles.user)}>
        {user && <span>{userDisplayName(user)}</span>}
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
