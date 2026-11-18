// The one RPC made before sign-in: GetInstanceMetadata needs no token, and it
// tells the app which issuer to sign in with.
import {
  InstanceService,
  type GetInstanceMetadataResponse,
} from '@civil-labs/civil-os-api'
import { createClient } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'

export interface InstanceMetadata {
  authIssuerUrl: string
  /** Free-form instance metadata (bounds, center, default_zoom by convention). */
  metadata: NonNullable<GetInstanceMetadataResponse['metadata']>
}

export async function fetchInstanceMetadata(
  gatewayUrl: string,
): Promise<InstanceMetadata> {
  const client = createClient(
    InstanceService,
    createConnectTransport({ baseUrl: gatewayUrl }),
  )
  const response = await client.getInstanceMetadata({})
  if (response.authIssuerUrl === '') {
    throw new Error('GetInstanceMetadata returned no authIssuerUrl')
  }
  return {
    authIssuerUrl: response.authIssuerUrl,
    metadata: response.metadata ?? {},
  }
}
