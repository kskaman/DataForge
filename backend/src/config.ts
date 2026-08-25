import { config as loadEnvironmentFile } from 'dotenv'

loadEnvironmentFile({ path: new URL('../.env', import.meta.url), quiet: true })

export const ENV = {
    nodeEnvironment: 'NODE_ENV',
    port: 'PORT',
    frontendOrigin: 'FRONTEND_ORIGIN',
    downloadSecret: 'DOWNLOAD_SECRET',
    guestSessionSecret: 'GUEST_SESSION_SECRET',
    trustProxyHops: 'TRUST_PROXY_HOPS',
    apiRateLimit: 'API_RATE_LIMIT',
    writeRateLimit: 'WRITE_RATE_LIMIT',
} as const

export type EnvironmentVariable = (typeof ENV)[keyof typeof ENV]
type EnvironmentSource = Readonly<Record<string, string | undefined>>

const localGuestSessionSecret = 'local-guest-session-secret-change-me'
const localDownloadSecret = 'local-development-secret-change-me'

export function getOrThrow(environment: EnvironmentSource, name: EnvironmentVariable) {
    const value = environment[name]
    if (value === undefined || value.trim() === '') {
        throw new Error(`${name} is required.`)
    }
    return value
}

function getOptional(environment: EnvironmentSource, name: EnvironmentVariable) {
    const value = environment[name]
    return value === undefined || value.trim() === '' ? undefined : value
}

function positiveInteger(
    environment: EnvironmentSource,
    name: EnvironmentVariable,
    fallback: number,
) {
    const value = getOptional(environment, name)
    const parsed = value === undefined ? fallback : Number(value)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`${name} must be a positive integer.`)
    }
    return parsed
}

function nonNegativeInteger(
    environment: EnvironmentSource,
    name: EnvironmentVariable,
    fallback: number,
) {
    const value = getOptional(environment, name)
    const parsed = value === undefined ? fallback : Number(value)
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error(`${name} must be a non-negative integer.`)
    }
    return parsed
}

function productionSecret(
    environment: EnvironmentSource,
    name: 'DOWNLOAD_SECRET' | 'GUEST_SESSION_SECRET',
    fallback: string,
    production: boolean,
) {
    const value = production
        ? getOrThrow(environment, name)
        : (getOptional(environment, name) ?? fallback)
    const insecure =
        value.length < 32 || value.includes('change-me') || value.startsWith('replace-with-')
    if (production && insecure) {
        throw new Error(`${name} must be a unique secret of at least 32 characters in production.`)
    }
    return value
}

function frontendOrigin(environment: EnvironmentSource) {
    const value = getOptional(environment, ENV.frontendOrigin)
    const url = new URL(value ?? 'http://localhost:5173')
    if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
    ) {
        throw new Error('FRONTEND_ORIGIN must be an HTTP(S) origin without credentials.')
    }
    return url.origin
}

function nodeEnvironment(environment: EnvironmentSource) {
    const value = getOptional(environment, ENV.nodeEnvironment) ?? 'development'
    if (!['development', 'test', 'production'].includes(value)) {
        throw new Error('NODE_ENV must be development, test, or production.')
    }
    return value as 'development' | 'test' | 'production'
}

export function loadConfig(environment: EnvironmentSource = process.env) {
    const runtimeEnvironment = nodeEnvironment(environment)
    const production = runtimeEnvironment === 'production'
    const guestSessionSecret = productionSecret(
        environment,
        ENV.guestSessionSecret,
        localGuestSessionSecret,
        production,
    )
    const downloadSecret = productionSecret(
        environment,
        ENV.downloadSecret,
        localDownloadSecret,
        production,
    )

    if (production && guestSessionSecret === downloadSecret) {
        throw new Error('GUEST_SESSION_SECRET and DOWNLOAD_SECRET must be different in production.')
    }

    return {
        environment: runtimeEnvironment,
        port: positiveInteger(environment, ENV.port, 4000),
        frontendOrigin: frontendOrigin(environment),
        downloadSecret,
        guestSessionSecret,
        guestCookieName: 'dataforge_guest',
        production,
        trustProxyHops: nonNegativeInteger(environment, ENV.trustProxyHops, 0),
        apiRateLimit: positiveInteger(environment, ENV.apiRateLimit, 1200),
        writeRateLimit: positiveInteger(environment, ENV.writeRateLimit, 60),
        rateLimitWindowMilliseconds: 15 * 60 * 1000,
        jsonBodyLimit: '32kb',
        retentionMilliseconds: 24 * 60 * 60 * 1000,
    }
}

export const config = loadConfig()
