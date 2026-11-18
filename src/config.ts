// The deployment's config, fetched once at startup from /config.json. It's the
// only thing that differs between deployments, so one build serves any instance.

export interface Config {
  /** Civil OS gateway base URL, with no trailing slash. */
  gatewayUrl: string
  /** OIDC client ID. The gateway must allow it (CIVIL_OS_GATEWAY_ALLOWED_CLIENT_IDS). */
  clientId: string
  /** MapLibre style JSON URL for the basemap. */
  basemapStyleUrl: string
}

export class ConfigError extends Error {
  override name = 'ConfigError'
}

function requireUrl(raw: Record<string, unknown>, key: keyof Config): string {
  const value = raw[key]
  if (typeof value !== 'string' || value === '') {
    throw new ConfigError(`config.json: "${key}" must be a non-empty string`)
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConfigError(`config.json: "${key}" is not a valid URL: ${value}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`config.json: "${key}" must be an http or https URL`)
  }
  return value.replace(/\/+$/, '')
}

/** Validates the parsed contents of config.json. Throws ConfigError if malformed. */
export function parseConfig(raw: unknown): Config {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigError('config.json must be a JSON object')
  }
  const record = raw as Record<string, unknown>
  const clientId = record.clientId
  if (typeof clientId !== 'string' || clientId === '') {
    throw new ConfigError('config.json: "clientId" must be a non-empty string')
  }
  return {
    gatewayUrl: requireUrl(record, 'gatewayUrl'),
    clientId,
    basemapStyleUrl: requireUrl(record, 'basemapStyleUrl'),
  }
}

export async function loadConfig(): Promise<Config> {
  const response = await fetch('/config.json', { cache: 'no-cache' })
  if (!response.ok) {
    throw new ConfigError(
      `config.json: ${String(response.status)} ${response.statusText}`,
    )
  }
  let raw: unknown
  try {
    raw = await response.json()
  } catch {
    throw new ConfigError('config.json is not valid JSON')
  }
  return parseConfig(raw)
}
