// TanStack Query and Router devtools. Loaded only in dev builds (main.tsx);
// both packages are dev dependencies and never reach a production bundle.
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import type { AnyRouter } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export default function Devtools({ router }: { router: AnyRouter }) {
  return (
    <>
      <ReactQueryDevtools buttonPosition="bottom-left" />
      <TanStackRouterDevtools router={router} position="bottom-right" />
    </>
  )
}
