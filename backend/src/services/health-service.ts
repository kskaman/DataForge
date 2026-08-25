import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { batchResultDirectory, batchSourceDirectory } from '../repositories/batch-store.js'
import { resultDirectory, sourceDirectory, storageRoot } from '../repositories/job-store.js'

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
        await Promise.all(
            [
                storageRoot,
                sourceDirectory,
                resultDirectory,
                batchSourceDirectory,
                batchResultDirectory,
            ].map((directory) => access(directory, constants.R_OK | constants.W_OK)),
        )
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
