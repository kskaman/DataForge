export const ENV = {
    apiBaseUrl: 'VITE_API_URL',
} as const

export type EnvironmentVariable = (typeof ENV)[keyof typeof ENV]
type EnvironmentSource = Readonly<Record<string, unknown>>

export function getOrThrow(environment: EnvironmentSource, name: EnvironmentVariable) {
    const value = environment[name]
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${name} is required.`)
    }
    return value
}

function getOptional(environment: EnvironmentSource, name: EnvironmentVariable) {
    const value = environment[name]
    if (value === undefined || value === '') return undefined
    if (typeof value !== 'string') throw new Error(`${name} must be a string.`)
    return value
}

function apiBaseUrl(environment: EnvironmentSource) {
    const value = getOptional(environment, ENV.apiBaseUrl)
    if (!value) return ''
    if (value.startsWith('/')) return value.replace(/\/+$/, '')

    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('VITE_API_URL must be an HTTP(S) URL without credentials.')
    }
    return value.replace(/\/+$/, '')
}

export function loadConfig(environment: EnvironmentSource = import.meta.env) {
    return {
        apiBaseUrl: apiBaseUrl(environment),
    }
}

export const config = loadConfig()
