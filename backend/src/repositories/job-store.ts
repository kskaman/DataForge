import { mkdir, readFile, writeFile } from 'node:fs/promises'
import {
    jobResultDirectory,
    jobSourceDirectory,
    jobsMetadataPath,
} from '../adapters/local/storage-paths.js'
import type { JobRepository } from '../contracts/job-repository.js'
import type { ConversionJob } from '../types.js'
import { replaceFile } from '../adapters/local/atomic-file.js'

let jobs = new Map<string, ConversionJob>()
let writeQueue = Promise.resolve()

export async function initializeStore() {
    await Promise.all([
        mkdir(jobSourceDirectory, { recursive: true }),
        mkdir(jobResultDirectory, { recursive: true }),
    ])

    try {
        const savedJobs = JSON.parse(await readFile(jobsMetadataPath, 'utf8')) as ConversionJob[]
        jobs = new Map(savedJobs.map((job) => [job.id, job]))
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
