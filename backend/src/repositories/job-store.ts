import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { jobsMetadataPath, localPathToObjectKey } from '../adapters/local/storage-paths.js'
import type { JobRepository } from '../contracts/job-repository.js'
import type { ConversionJob } from '../types.js'
import { replaceFile } from '../adapters/local/atomic-file.js'

let jobs = new Map<string, ConversionJob>()
let writeQueue = Promise.resolve()

type LegacyConversionJob = Omit<ConversionJob, 'sourceKey' | 'resultKey'> & {
    sourcePath?: string
    resultPath?: string | null
    sourceKey?: string
    resultKey?: string | null
}

function normalizeJob(job: LegacyConversionJob): ConversionJob {
    const sourceKey = job.sourceKey ?? localPathToObjectKey(job.sourcePath ?? '')
    const resultKey =
        job.resultKey ?? (job.resultPath ? localPathToObjectKey(job.resultPath) : null)
    const { sourcePath: _sourcePath, resultPath: _resultPath, ...currentJob } = job
    return { ...currentJob, sourceKey, resultKey }
}

export async function initializeStore() {
    await mkdir(path.dirname(jobsMetadataPath), { recursive: true })

    try {
        const savedJobs = JSON.parse(
            await readFile(jobsMetadataPath, 'utf8'),
        ) as LegacyConversionJob[]
        jobs = new Map(savedJobs.map(normalizeJob).map((job) => [job.id, job]))
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
}

async function persist() {
    const temporaryPath = `${jobsMetadataPath}.tmp`
    await writeFile(temporaryPath, JSON.stringify([...jobs.values()], null, 2))
    await replaceFile(temporaryPath, jobsMetadataPath)
}

function schedulePersist() {
    writeQueue = writeQueue.then(persist, persist)
    return writeQueue
}

export function listJobs() {
    return [...jobs.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function getJob(id: string) {
    return jobs.get(id)
}

export function listJobsForOwner(ownerId: string) {
    return listJobs().filter((job) => job.ownerId === ownerId)
}

export function getJobForOwner(id: string, ownerId: string) {
    const job = getJob(id)
    return job?.ownerId === ownerId ? job : undefined
}

export async function saveJob(job: ConversionJob) {
    jobs.set(job.id, job)
    await schedulePersist()
    return job
}

export async function removeJob(id: string) {
    jobs.delete(id)
    await schedulePersist()
}

export const localJobRepository: JobRepository = {
    initialize: initializeStore,
    list: async () => listJobs(),
    get: async (id) => getJob(id),
    listForOwner: async (ownerId) => listJobsForOwner(ownerId),
    getForOwner: async (id, ownerId) => getJobForOwner(id, ownerId),
    save: saveJob,
    remove: removeJob,
}
