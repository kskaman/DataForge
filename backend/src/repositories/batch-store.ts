import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BatchJob } from '../types.js'
import { storageRoot } from './job-store.js'

export const batchSourceDirectory = path.join(storageRoot, 'batch-sources')
export const batchResultDirectory = path.join(storageRoot, 'batch-results')
const batchesPath = path.join(storageRoot, 'batches.json')

let batches = new Map<string, BatchJob>()
let writeQueue = Promise.resolve()

export async function initializeBatchStore() {
  await Promise.all([
    mkdir(batchSourceDirectory, { recursive: true }),
    mkdir(batchResultDirectory, { recursive: true }),
  ])

  try {
    const savedBatches = JSON.parse(await readFile(batchesPath, 'utf8')) as BatchJob[]
    batches = new Map(savedBatches.map((batch) => [batch.id, batch]))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function persist() {
  const temporaryPath = `${batchesPath}.tmp`
  await writeFile(temporaryPath, JSON.stringify([...batches.values()], null, 2))
  await rename(temporaryPath, batchesPath)
}

function schedulePersist() {
  writeQueue = writeQueue.then(persist, persist)
  return writeQueue
}

export function listBatches() {
  return [...batches.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
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