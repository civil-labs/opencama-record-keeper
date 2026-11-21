// When to call SearchParcelsAddresses (spec: Normalising and the minimum
// length). The client mirrors the server's normalisation only to decide
// whether a query is worth sending. It always sends the text as typed, and
// the server normalises it again.

/** The RPC's limit on the raw query, in characters. */
export const MAX_QUERY_LENGTH = 200

/** The fewest letters or digits a query needs once normalised. */
export const MIN_QUERY_ALNUM = 3

/**
 * Lower-cases the text, turns every run of characters that aren't letters
 * or digits into one space, and trims. `\p{L}\p{N}` stands in for
 * PostgreSQL's `[:alnum:]`, which the server uses.
 */
export function normalizeQuery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Whether the server would accept the query: at least 3 letters or digits
 * once normalised, and at most 200 characters as typed.
 */
export function isSearchable(raw: string): boolean {
  if ([...raw].length > MAX_QUERY_LENGTH) return false
  return [...normalizeQuery(raw).replaceAll(' ', '')].length >= MIN_QUERY_ALNUM
}
