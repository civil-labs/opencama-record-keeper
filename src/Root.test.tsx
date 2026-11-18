import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Root } from './Root.tsx'

test('renders the app name', () => {
  render(<Root />)
  expect(
    screen.getByRole('heading', { name: 'Record Keeper' }),
  ).toBeDefined()
})
