export type LogLevel = 'info' | 'warn' | 'error'

export function errorDetails(error: unknown) {
    return error instanceof Error
        ? { errorName: error.name, errorMessage: error.message }
        : { errorName: 'UnknownError', errorMessage: String(error) }
}

export function log(level: LogLevel, event: string, details: Record<string, unknown> = {}) {
    const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        service: 'dataforge-api',
        environment: process.env.NODE_ENV ?? 'development',
        event,
        ...details,
    })

    if (level === 'error') console.error(entry)
    else if (level === 'warn') console.warn(entry)
    else console.log(entry)
}
