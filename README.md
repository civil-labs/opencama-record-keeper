# Record Keeper

Record Keeper is the OpenCAMA app for viewing, and later editing, the records in a
[Civil OS](https://github.com/civil-labs/civil-os) instance. The MVP is read-only:
pick a parcel on a map, see its details, and follow every reference it holds to
another record.

It's a static single-page app (Vite, React, TypeScript, StyleX) that talks only to
the Civil OS public API, through the
[`@civil-labs/civil-os-api`](https://www.npmjs.com/package/@civil-labs/civil-os-api)
SDK. There's no backend.

## Develop

You need [mise](https://mise.jdx.dev) and a running Civil OS local stack.

```sh
# In a civil-os checkout: start the stack on synthetic data (needs Docker).
mise run up

# Here:
mise install      # Node, as pinned in mise.toml
npm ci
npm run dev       # http://localhost:3000
```

The dev server must run on port 3000, the redirect URI registered for the local
stack's `civil-os-dev` client.

| Script | What |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Type-check, then build static files into `dist/` |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | ESLint, including the StyleX and styling rules |
| `npm test` | Vitest |

## Styling

Every style is [StyleX](https://stylexjs.com), declared next to the component that
uses it. There are no `style` or `className` props, and lint enforces that. The
only stylesheets are MapLibre's and `src/stylex.css`, which is empty on purpose: its
comment explains why it exists.

## Design docs

- [`docs/mvp/intent.md`](docs/mvp/intent.md): what the MVP is for.
- [`docs/mvp/spec.md`](docs/mvp/spec.md): how it works.
- [`docs/mvp/plan.md`](docs/mvp/plan.md): the order it's built in.
