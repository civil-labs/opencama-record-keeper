// Every route, in one place (spec: Routes, Router setup).
import type { Transport } from '@connectrpc/connect'
import * as stylex from '@stylexjs/stylex'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useRouteContext,
} from '@tanstack/react-router'
import type { Auth } from './auth.ts'
import { Navbar } from './components/Navbar.tsx'
import { Callback, CallbackError } from './routes/Callback.tsx'
import { spacing } from './theme/tokens.stylex.ts'

export interface RouterContext {
  auth: Auth
  /** The authenticated Connect transport, for loaders. */
  transport: Transport
}

const styles = stylex.create({
  // No global CSS styles html, body or #root, so the root container fills the
  // viewport itself, whatever the browser's default body margin.
  root: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  page: {
    flexGrow: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: spacing.medium,
  },
})

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: function RootLayout() {
    return (
      <div {...stylex.props(styles.root)}>
        <Outlet />
      </div>
    )
  },
})

/** OIDC redirect target. Outside the auth check: nobody is signed in yet. */
const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'callback',
  loader: async ({ context }) => {
    const returnTo = await context.auth.completeSignIn()
    throw redirect({ href: returnTo, replace: true })
  },
  component: Callback,
  errorComponent: CallbackError,
})

/** Everything signed in. Its beforeLoad sends anyone without a session to sign-in. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context, location }) => {
    const token = await context.auth.getIdToken()
    if (token === null) await context.auth.signIn(location.href)
  },
  component: function AppLayout() {
    const { auth } = useRouteContext({ from: '/app' })
    return (
      <>
        <Navbar auth={auth} />
        <main {...stylex.props(styles.page)}>
          <Outlet />
        </main>
      </>
    )
  },
})

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/parcels', replace: true })
  },
})

const parcelsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'parcels',
  component: function ParcelsPlaceholder() {
    return <h1>Parcels</h1>
  },
})

const routeTree = rootRoute.addChildren([
  callbackRoute,
  appRoute.addChildren([indexRoute, parcelsRoute]),
])

export function createAppRouter(context: RouterContext) {
  return createRouter({ routeTree, context })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
