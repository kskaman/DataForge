import { conversionDispatcher, objectStorage } from '../dependencies.js'

let applicationInitialized = false

export function markApplicationReady() {
    applicationInitialized = true
}

export function livenessReport() {
    return {
        status: 'ok' as const,
        service: 'dataforge-api',
        uptimeSeconds: Math.floor(process.uptime()),
    }
}

export async function readinessReport() {
    let storageReady = true
    let dispatcherReady = true

    await Promise.all([
        objectStorage.checkHealth().catch(() => {
            storageReady = false
        }),
        conversionDispatcher.checkHealth().catch(() => {
            dispatcherReady = false
        }),
    ])

    const ready = applicationInitialized && storageReady && dispatcherReady

    return {
        status: ready ? ('ok' as const) : ('not_ready' as const),
        service: 'dataforge-api',
        checks: {
            initialization: applicationInitialized ? ('ok' as const) : ('not_ready' as const),
            storage: storageReady ? ('ok' as const) : ('not_ready' as const),
            queue: {
                status:
                    applicationInitialized && dispatcherReady
                        ? ('ok' as const)
                        : ('not_ready' as const),
                provider: conversionDispatcher.provider,
            },
        },
    }
}
