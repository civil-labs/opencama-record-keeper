// The navbar's address search (spec: The search box): a typeahead over
// SearchParcelsAddresses, built on Downshift's useCombobox, which follows the
// ARIA 1.2 combobox pattern. Picking a hit goes to its parcel. With the box
// empty, it lists the user's recent picks.
import { Code } from '@connectrpc/connect'
import * as stylex from '@stylexjs/stylex'
import { useNavigate } from '@tanstack/react-router'
import { useCombobox, type UseComboboxState, type UseComboboxStateChangeOptions } from 'downshift'
import { useId, useState, useSyncExternalStore } from 'react'
import { useAddressSearch, type AddressSearchState } from '../api/search.ts'
import type { RecentPick, RecentPicks } from '../search/recentPicks.ts'
import { MAX_QUERY_LENGTH } from '../search/query.ts'
import { layers, spacing } from '../theme/tokens.stylex.ts'

const styles = stylex.create({
  root: {
    position: 'relative',
    flexGrow: 1,
    // Takes nearly all the shrinking, so the user's name only truncates once
    // the box is down to its minimum width.
    flexShrink: 1000,
    flexBasis: '32rem',
    minWidth: '12rem',
    maxWidth: '32rem',
    marginInline: spacing.medium,
  },
  input: {
    boxSizing: 'border-box',
    width: '100%',
    font: 'inherit',
  },
  popup: {
    position: 'absolute',
    top: '100%',
    insetInline: 0,
    zIndex: layers.popup,
    marginTop: '2px',
    backgroundColor: 'Canvas',
    color: 'CanvasText',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'GrayText',
    whiteSpace: 'normal',
  },
  hidden: {
    display: 'none',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  heading: {
    paddingBlock: '0.25rem',
    paddingInline: spacing.small,
    fontWeight: 'bold',
  },
  option: {
    paddingBlock: '0.25rem',
    paddingInline: spacing.small,
    cursor: 'pointer',
  },
  active: {
    backgroundColor: 'Highlight',
    color: 'HighlightText',
  },
  stale: {
    opacity: 0.5,
  },
  line: {
    margin: 0,
    paddingBlock: '0.25rem',
    paddingInline: spacing.small,
  },
  // Read by screen readers, not drawn.
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
})

export const HINT = 'Type at least 3 letters or numbers.'
export const MORE_MATCHES = 'More matches. Keep typing to narrow down.'
export const NO_MATCHES = 'No parcels match.'
export const SEARCHING = 'Searching…'

type Item = Pick<RecentPick, 'parcelId' | 'formattedAddress'>

/** The options in the listbox: recent picks when empty, otherwise hits. */
function itemsFor(state: AddressSearchState, recent: readonly RecentPick[]): readonly Item[] {
  if (state.status === 'empty') return recent
  if (state.status === 'results') return state.hits
  return []
}

/** Whether the popup has anything to show. */
function hasContent(state: AddressSearchState, recent: readonly RecentPick[]): boolean {
  return state.status !== 'empty' || recent.length > 0
}

/** The live region's text. */
export function statusMessage(state: AddressSearchState): string {
  if (state.status === 'searching') return SEARCHING
  if (state.status !== 'results') return ''
  if (state.stale) return SEARCHING
  const n = state.hits.length
  if (n === 0) return 'No parcels match'
  return `${n} ${n === 1 ? 'result' : 'results'}${state.hasNextPage ? ', more available' : ''}`
}

/**
 * Where Downshift's defaults differ from the spec:
 * - a pick clears the input and closes, instead of filling in the address;
 * - Enter with no active option does nothing, instead of closing;
 * - a click on the input opens the popup, instead of toggling it;
 * - blur (Tab, or a click elsewhere) never picks the highlighted option.
 */
function stateReducer(
  state: UseComboboxState<Item>,
  { type, changes }: UseComboboxStateChangeOptions<Item>,
): Partial<UseComboboxState<Item>> {
  switch (type) {
    case useCombobox.stateChangeTypes.InputKeyDownEnter:
      // Enter with no active option does nothing.
      if (state.highlightedIndex < 0) return state
      return { ...changes, inputValue: '', isOpen: false, highlightedIndex: -1 }
    case useCombobox.stateChangeTypes.ItemClick:
      return { ...changes, inputValue: '', isOpen: false, highlightedIndex: -1 }
    case useCombobox.stateChangeTypes.InputClick:
      // Downshift toggles here. A click on an unfocused box fires focus
      // (which opens) then click, so toggling would close it again at once.
      return { ...changes, isOpen: true, highlightedIndex: state.isOpen ? state.highlightedIndex : -1 }
    case useCombobox.stateChangeTypes.InputBlur:
      return {
        ...changes,
        selectedItem: state.selectedItem,
        inputValue: state.inputValue,
      }
    default:
      return changes
  }
}

export function AddressSearch({ recentPicks }: { recentPicks: RecentPicks }) {
  const navigate = useNavigate()
  // Downshift owns the input's ref; the pick finds the input by ID to blur it.
  const inputId = useId()
  const [raw, setRaw] = useState('')
  const recent = useSyncExternalStore(recentPicks.subscribe, recentPicks.get)
  const search = useAddressSearch(raw)
  const items = itemsFor(search, recent)
  const showRecent = search.status === 'empty'

  const { isOpen, highlightedIndex, getInputProps, getMenuProps, getItemProps, getLabelProps, openMenu } =
    useCombobox<Item>({
      items: items as Item[],
      inputId,
      inputValue: raw,
      // Controlled and always null, so picking the same parcel twice still
      // counts as a pick.
      selectedItem: null,
      itemToString: (item) => item?.formattedAddress ?? '',
      itemToKey: (item) => item?.parcelId,
      stateReducer,
      onInputValueChange: ({ inputValue }) => setRaw(inputValue),
      onSelectedItemChange: ({ selectedItem }) => {
        if (!selectedItem) return
        recentPicks.push(selectedItem)
        document.getElementById(inputId)?.blur()
        void navigate({ to: '/parcels/$parcelId', params: { parcelId: selectedItem.parcelId } })
      },
    })

  const open = isOpen && hasContent(search, recent)
  const stale = search.status === 'results' && search.stale

  return (
    <div {...stylex.props(styles.root)}>
      <label {...getLabelProps()} {...stylex.props(styles.visuallyHidden)}>
        Search addresses
      </label>
      <input
        {...getInputProps({
          type: 'search',
          placeholder: 'Search addresses',
          maxLength: MAX_QUERY_LENGTH,
          'aria-expanded': open,
          onFocus: () => {
            if (!isOpen && hasContent(search, recent)) openMenu()
          },
        })}
        {...stylex.props(styles.input)}
      />
      <div {...stylex.props(styles.popup, !open && styles.hidden)}>
        <ul {...getMenuProps()} {...stylex.props(styles.list, stale && styles.stale)}>
          {open && showRecent && items.length > 0 && (
            <li role="presentation" {...stylex.props(styles.heading)}>
              Recent
            </li>
          )}
          {open &&
            items.map((item, index) => (
              <li
                key={item.parcelId}
                {...getItemProps({ item, index })}
                {...stylex.props(styles.option, highlightedIndex === index && styles.active)}
              >
                {item.formattedAddress}
              </li>
            ))}
        </ul>
        {open && <PopupLines search={search} />}
      </div>
      <div role="status" {...stylex.props(styles.visuallyHidden)}>
        {statusMessage(search)}
      </div>
    </div>
  )
}

/** The lines outside the listbox: hint, no matches, footer, searching, error. */
function PopupLines({ search }: { search: AddressSearchState }) {
  switch (search.status) {
    case 'empty':
      return null
    case 'tooShort':
      return <p {...stylex.props(styles.line)}>{HINT}</p>
    case 'searching':
      return <p {...stylex.props(styles.line)}>{SEARCHING}</p>
    case 'error':
      return (
        <p role="alert" {...stylex.props(styles.line)}>
          Search failed: {Code[search.error.code]}. {search.error.rawMessage}
        </p>
      )
    case 'results':
      return (
        <>
          {search.hits.length === 0 && !search.stale && (
            <p {...stylex.props(styles.line)}>{NO_MATCHES}</p>
          )}
          {search.hasNextPage && <p {...stylex.props(styles.line)}>{MORE_MATCHES}</p>}
          {search.stale && <p {...stylex.props(styles.line)}>{SEARCHING}</p>}
        </>
      )
  }
}
