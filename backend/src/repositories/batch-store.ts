import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { batchesMetadataPath, localPathToObjectKey } from '../adapters/local/storage-paths.js'
import type { BatchRepository } from '../contracts/batch-repository.js'
import type { BatchJob } from '../types.js'
import { replaceFile } from '../adapters/local/atomic-file.js'

let batches = new Map<string, BatchJob>()
let writeQueue = Promise.resolve()

type LegacyBatchJob = Omit<BatchJob, 'sources' | 'resultKey'> & {
    sources: Array<
        Omit<BatchJob['sources'][number], 'sourceKey'> & {
            sourcePath?: string
            sourceKey?: string
        }
    >
    resultPath?: string | null
    resultKey?: string | null
}

function normalizeBatch(batch: LegacyBatchJob): BatchJob {
    const sources = batch.sources.map(({ sourcePath, sourceKey, ...source }) => ({
        ...source,
        sourceKey: sourceKey ?? localPathToObjectKey(sourcePath ?? ''),
    }))
    const resultKey =
        batch.resultKey ?? (batch.resultPath ? localPathToObjectKey(batch.resultPath) : null)
    const { resultPath: _resultPath, ...currentBatch } = batch
    return { ...currentBatch, sources, resultKey }
}

export async function initializeBatchStore() {
    await mkdir(path.dirname(batchesMetadataPath), { recursive: true })

    try {
        const savedBatches = JSON.parse(
            await readFile(batchesMetadataPath, 'utf8'),
        ) as LegacyBatchJob[]
        batches = new Map(savedBatches.map(normalizeBatch).map((batch) => [batch.id, batch]))
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
