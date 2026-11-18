// Query options for transfers (spec: Transfer).
import { RealPropertyTransfersService } from '@civil-labs/civil-os-api'
import type { Transport } from '@connectrpc/connect'
import { createQueryOptions } from '@connectrpc/connect-query'

/** One transfer. The response is a list; find the transfer by ID in it. */
export const transferQuery = (transport: Transport, transferId: string) =>
  createQueryOptions(
    RealPropertyTransfersService.method.getTransfersById,
    { transferIds: [transferId] },
    { transport },
  )
