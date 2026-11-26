// Query options for improvements (spec: Improvement page).
import { ImprovementsService } from '@civil-labs/civil-os-api'
import type { Transport } from '@connectrpc/connect'
import { createQueryOptions } from '@connectrpc/connect-query'

/**
 * One improvement, from the `improvements` map keyed by ID. No valuation and
 * no legal time: the current record, with no values.
 */
export const improvementQuery = (transport: Transport, improvementId: string) =>
  createQueryOptions(
    ImprovementsService.method.getImprovementsById,
    { improvementIds: [improvementId] },
    { transport },
  )
