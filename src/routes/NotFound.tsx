import { Link } from '@tanstack/react-router'

export function NotFound() {
  return (
    <>
      <h1>Not found</h1>
      <p>
        <Link to="/parcels">Go to parcels</Link>
      </p>
    </>
  )
}
