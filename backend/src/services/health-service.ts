import { objectStorage } from '../dependencies.js'

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

    try {
        await objectStorage.checkHealth()
    } catch {
        storageReady = false
    }

    const ready = applicationInitialized && storageReady

    return {
        status: ready ? ('ok' as const) : ('not_ready' as const),
        service: 'dataforge-api',
        checks: {
            initialization: applicationInitialized ? ('ok' as const) : ('not_ready' as const),
            storage: storageReady ? ('ok' as const) : ('not_ready' as const),
            queue: {
                status: applicationInitialized ? ('ok' as const) : ('not_ready' as const),
                provider: 'in-process',
            },
        },
    }
}
