import * as stylex from '@stylexjs/stylex'

export const sizes = stylex.defineVars({
  navbarHeight: '2.5rem',
  detailPaneMinWidth: '360px',
  detailPaneMaxWidth: '40%',
})

export const spacing = stylex.defineVars({
  small: '0.5rem',
  medium: '1rem',
})

export const layers = stylex.defineVars({
  // Above the map and its controls (MapLibre's go up to 2).
  popup: '10',
})
