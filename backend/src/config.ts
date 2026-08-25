const localGuestSessionSecret = 'local-guest-session-secret-change-me'
const localDownloadSecret = 'local-development-secret-change-me'

function positiveInteger(value: string | undefined, fallback: number, name: string) {
    const parsed = value === undefined ? fallback : Number(value)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`${name} must be a positive integer.`)
    }
    return parsed
}

function nonNegativeInteger(value: string | undefined, fallback: number, name: string) {
    const parsed = value === undefined ? fallback : Number(value)
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error(`${name} must be a non-negative integer.`)
    }
    return parsed
}

function productionSecret(
    environment: NodeJS.ProcessEnv,
    name: 'DOWNLOAD_SECRET' | 'GUEST_SESSION_SECRET',
    fallback: string,
    production: boolean,
) {
    const value = environment[name] ?? fallback
    const insecure =
        value.length < 32 || value.includes('change-me') || value.startsWith('replace-with-')
    if (production && insecure) {
        throw new Error(`${name} must be a unique secret of at least 32 characters in production.`)
    }
    return value
}

function frontendOrigin(value: string | undefined) {
    const url = new URL(value ?? 'http://localhost:5173')
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('FRONTEND_ORIGIN must be an HTTP(S) origin without credentials.')
    }
    return url.origin
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env) {
    const production = environment.NODE_ENV === 'production'
    const guestSessionSecret = productionSecret(
        environment,
        'GUEST_SESSION_SECRET',
        localGuestSessionSecret,
        production,
    )
    const downloadSecret = productionSecret(
        environment,
        'DOWNLOAD_SECRET',
        localDownloadSecret,
        production,
    )

    if (production && guestSessionSecret === downloadSecret) {
        throw new Error('GUEST_SESSION_SECRET and DOWNLOAD_SECRET must be different in production.')
    }

    return {
        port: positiveInteger(environment.PORT, 4000, 'PORT'),
        frontendOrigin: frontendOrigin(environment.FRONTEND_ORIGIN),
        downloadSecret,
        guestSessionSecret,
        guestCookieName: 'dataforge_guest',
        production,
        trustProxyHops: nonNegativeInteger(environment.TRUST_PROXY_HOPS, 0, 'TRUST_PROXY_HOPS'),
        apiRateLimit: positiveInteger(environment.API_RATE_LIMIT, 1200, 'API_RATE_LIMIT'),
        writeRateLimit: positiveInteger(environment.WRITE_RATE_LIMIT, 60, 'WRITE_RATE_LIMIT'),
        rateLimitWindowMilliseconds: 15 * 60 * 1000,
        jsonBodyLimit: '32kb',
        retentionMilliseconds: 24 * 60 * 60 * 1000,
    }
}

export const config = loadConfig()
