import { mkdir, readFile, writeFile } from 'node:fs/promises'
import {
    batchResultDirectory,
    batchesMetadataPath,
    batchSourceDirectory,
} from '../adapters/local/storage-paths.js'
import type { BatchRepository } from '../contracts/batch-repository.js'
import type { BatchJob } from '../types.js'
import { replaceFile } from '../adapters/local/atomic-file.js'

let batches = new Map<string, BatchJob>()
let writeQueue = Promise.resolve()

export async function initializeBatchStore() {
    await Promise.all([
        mkdir(batchSourceDirectory, { recursive: true }),
        mkdir(batchResultDirectory, { recursive: true }),
    ])

    try {
        const savedBatches = JSON.parse(await readFile(batchesMetadataPath, 'utf8')) as BatchJob[]
        batches = new Map(savedBatches.map((batch) => [batch.id, batch]))
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
}

async function persist() {
    const temporaryPath = `${batchesMetadataPath}.tmp`
    await writeFile(temporaryPath, JSON.stringify([...batches.values()], null, 2))
    await replaceFile(temporaryPath, batchesMetadataPath)
}

function schedulePersist() {
    writeQueue = writeQueue.then(persist, persist)
    return writeQueue
}

export function listBatches() {
    return [...batches.values()].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
    )
}

export function getBatch(id: string) {
    return batches.get(id)
}

export function listBatchesForOwner(ownerId: string) {
    return listBatches().filter((batch) => batch.ownerId === ownerId)
}

export function getBatchForOwner(id: string, ownerId: string) {
    const batch = getBatch(id)
    return batch?.ownerId === ownerId ? batch : undefined
}

export async function saveBatch(batch: BatchJob) {
    batches.set(batch.id, batch)
    await schedulePersist()
    return batch
}

export async function removeBatch(id: string) {
    batches.delete(id)
    await schedulePersist()
}

export const localBatchRepository: BatchRepository = {
    initialize: initializeBatchStore,
    list: async () => listBatches(),
    get: async (id) => getBatch(id),
    listForOwner: async (ownerId) => listBatchesForOwner(ownerId),
    getForOwner: async (id, ownerId) => getBatchForOwner(id, ownerId),
    save: saveBatch,
    remove: removeBatch,
}
