// The neighborhood definition dropdown at the top of the parcels pane (spec:
// Neighborhood definition selector). A parcel's neighborhood depends on which
// definition it's read under.
import * as stylex from '@stylexjs/stylex'
import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { useSyncExternalStore } from 'react'
import { neighborhoodDefinitionsQuery } from '../api/lookups.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'
import { selectDefinition, sortedDefinitions } from '../neighborhoodDefinition.ts'
import { spacing } from '../theme/tokens.stylex.ts'

const styles = stylex.create({
  // Separates the selector from the details below it.
  selector: {
    marginBottom: spacing.medium,
  },
})

/**
 * The definitions, and the one parcels are read under: the stored choice if
 * it still exists, else the first by name. `definitionId` is undefined while
 * they load, if they failed, or if there are none.
 */
export function useNeighborhoodDefinition() {
  const { definitionChoice, transport } = useRouteContext({ from: '/app' })
  const stored = useSyncExternalStore(definitionChoice.subscribe, definitionChoice.get)
  const definitions = useQuery(neighborhoodDefinitionsQuery(transport))
  return {
    definitions,
    definitionId: selectDefinition(stored, definitions.data?.neighborhoodDefinitions),
    choose: (id: string) => definitionChoice.set(id),
  }
}

export function NeighborhoodDefinitionSelect() {
  const { definitions, definitionId, choose } = useNeighborhoodDefinition()
  return (
    <div {...stylex.props(styles.selector)}>
      <SelectorBody
        definitions={definitions}
        definitionId={definitionId}
        choose={choose}
      />
    </div>
  )
}

function SelectorBody({
  definitions,
  definitionId,
  choose,
}: ReturnType<typeof useNeighborhoodDefinition>) {
  if (definitions.isPending) {
    return (
      <label>
        Neighborhood definition{' '}
        <select disabled>
          <option>Loading…</option>
        </select>
      </label>
    )
  }
  if (definitions.isError) return <ErrorAlert error={definitions.error} />
  const options = sortedDefinitions(definitions.data.neighborhoodDefinitions)
  if (options.length === 0) return <p>No neighborhood definitions</p>
  return (
    <label>
      Neighborhood definition{' '}
      <select value={definitionId} onChange={(event) => choose(event.target.value)}>
        {options.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}
