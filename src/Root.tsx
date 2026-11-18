import * as stylex from '@stylexjs/stylex'
import { spacing } from './theme/tokens.stylex.ts'

const styles = stylex.create({
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

export function Root() {
  return (
    <div {...stylex.props(styles.root)}>
      <main {...stylex.props(styles.page)}>
        <h1>Record Keeper</h1>
      </main>
    </div>
  )
}
