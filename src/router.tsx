// Every route, in one place (spec: Routes, Router setup).
import type { Transport } from '@connectrpc/connect'
import * as stylex from '@stylexjs/stylex'
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  notFound,
  Outlet,
  redirect,
  useMatches,
  useRouteContext,
  type RouterHistory,
} from '@tanstack/react-router'
import type { InstanceMetadata } from './api/instance.ts'
import { landUsesQuery, neighborhoodsQuery, zoningQuery } from './api/lookups.ts'
import { parcelExtentQuery, parcelQuery } from './api/parcels.ts'
import type { Auth } from './auth.ts'
import type { Config } from './config.ts'
import { Navbar } from './components/Navbar.tsx'
import { RouteError } from './components/RouteError.tsx'
import { Callback, CallbackError } from './routes/Callback.tsx'
import { LandUsePage, NeighborhoodPage, ZoningPage } from './routes/LookupPage.tsx'
import { NotBuiltYet } from './routes/NotBuiltYet.tsx'
import { NotFound } from './routes/NotFound.tsx'
import { ParcelPane } from './routes/ParcelPane.tsx'
import { ParcelsLayout } from './routes/ParcelsLayout.tsx'
import { spacing } from './theme/tokens.stylex.ts'

export interface RouterContext {
  config: Config
  instance: InstanceMetadata
  auth: Auth
  /** The authenticated Connect transport, for loaders. */
  transport: Transport
  /** The one query cache, shared by loaders and pages. */
  queryClient: QueryClient
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
  // A page that lays out the whole area itself, such as the parcels grid.
  fullBleed: {
    flexGrow: 1,
    minHeight: 0,
    overflow: 'hidden',
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
    const fullBleed = useMatches({
      select: (matches) => matches.some((match) => match.staticData.fullBleed),
    })
    return (
      <>
        <Navbar auth={auth} />
        <main {...stylex.props(fullBleed ? styles.fullBleed : styles.page)}>
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Record IDs in paths are public UUIDs. Anything else is "Not found", without
 * calling the API. IDs are lowercased, the form the API returns.
 */
export function parseUuid(value: string): string {
  if (!UUID.test(value)) throw notFound()
  return value.toLowerCase()
}

/**
 * The parcels page: the map in the left pane, and the selected parcel (or
 * nothing) in the right. Because the map belongs to this layout, it stays
 * mounted when the selection changes.
 */
const parcelsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'parcels',
  staticData: { fullBleed: true },
  component: ParcelsLayout,
})

/** No parcel selected: the pane is blank. */
const parcelsIndexRoute = createRoute({
  getParentRoute: () => parcelsRoute,
  path: '/',
  component: () => null,
})

const parcelRoute = createRoute({
  getParentRoute: () => parcelsRoute,
  path: '$parcelId',
  params: {
    parse: ({ parcelId }) => ({ parcelId: parseUuid(parcelId) }),
    stringify: ({ parcelId }) => ({ parcelId }),
  },
  /**
   * Prefetches the parcel and the lookups its labels use, and starts its
   * extent for the map, in parallel. Transfers load on their own.
   */
  loader: async ({ context: { queryClient, transport }, params: { parcelId } }) => {
    void queryClient.prefetchQuery(parcelExtentQuery(transport, parcelId))
    const [parcel] = await Promise.all([
      queryClient.ensureQueryData(parcelQuery(transport, parcelId)),
      queryClient.ensureQueryData(landUsesQuery(transport)),
      queryClient.ensureQueryData(zoningQuery(transport)),
      queryClient.ensureQueryData(neighborhoodsQuery(transport)),
    ])
    if (!(parcelId in parcel.parcels)) throw notFound()
  },
  component: ParcelPane,
  // Rendered in the pane, so the map stays usable.
  notFoundComponent: () => <p>No parcel with this ID.</p>,
})

const addressRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'addresses/$addressId',
  params: {
    parse: ({ addressId }) => ({ addressId: parseUuid(addressId) }),
    stringify: ({ addressId }) => ({ addressId }),
  },
  component: () => <NotBuiltYet page="Address" />,
})

const partyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'parties/$partyId',
  params: {
    parse: ({ partyId }) => ({ partyId: parseUuid(partyId) }),
    stringify: ({ partyId }) => ({ partyId }),
  },
  component: () => <NotBuiltYet page="Party" />,
})

const transferRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'transfers/$transferId',
  params: {
    parse: ({ transferId }) => ({ transferId: parseUuid(transferId) }),
    stringify: ({ transferId }) => ({ transferId }),
  },
  component: () => <NotBuiltYet page="Transfer" />,
})

const landUseRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'land-uses/$landUseId',
  params: {
    parse: ({ landUseId }) => ({ landUseId: parseUuid(landUseId) }),
    stringify: ({ landUseId }) => ({ landUseId }),
  },
  loader: async ({ context: { queryClient, transport }, params }) => {
    const data = await queryClient.ensureQueryData(landUsesQuery(transport))
    if (!(params.landUseId in data.landUses)) throw notFound()
  },
  component: LandUsePage,
})

const zoningRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'zoning/$zoningId',
  params: {
    parse: ({ zoningId }) => ({ zoningId: parseUuid(zoningId) }),
    stringify: ({ zoningId }) => ({ zoningId }),
  },
  loader: async ({ context: { queryClient, transport }, params }) => {
    const data = await queryClient.ensureQueryData(zoningQuery(transport))
    if (!(params.zoningId in data.zoning)) throw notFound()
  },
  component: ZoningPage,
})

const neighborhoodRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'neighborhoods/$neighborhoodId',
  params: {
    parse: ({ neighborhoodId }) => ({
      neighborhoodId: parseUuid(neighborhoodId),
    }),
    stringify: ({ neighborhoodId }) => ({ neighborhoodId }),
  },
  loader: async ({ context: { queryClient, transport }, params }) => {
    const data = await queryClient.ensureQueryData(neighborhoodsQuery(transport))
    if (!(params.neighborhoodId in data.neighborhoods)) throw notFound()
  },
  component: NeighborhoodPage,
})

/**
 * Any other path, signed in, under the navbar. Without it an unknown path
 * would match only the root route, outside the auth check and the navbar.
 */
const notFoundRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '$',
  component: NotFound,
})

const routeTree = rootRoute.addChildren([
  callbackRoute,
  appRoute.addChildren([
    indexRoute,
    parcelsRoute.addChildren([parcelsIndexRoute, parcelRoute]),
    addressRoute,
    partyRoute,
    transferRoute,
    landUseRoute,
    zoningRoute,
    neighborhoodRoute,
    notFoundRoute,
  ]),
])

export function createAppRouter(context: RouterContext, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context,
    history,
    // Hovering a link starts loading that record.
    defaultPreload: 'intent',
    // TanStack Query alone decides whether data is fresh.
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: () => <p>Loading…</p>,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: NotFound,
  })
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** The page lays out the whole area below the navbar, with no padding. */
    fullBleed?: boolean
  }
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
