import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ConversionJob } from '../types.js'

export const storageRoot = path.resolve(import.meta.dirname, '..', '..', 'storage')
export const sourceDirectory = path.join(storageRoot, 'sources')
export const resultDirectory = path.join(storageRoot, 'results')
const jobsPath = path.join(storageRoot, 'jobs.json')

let jobs = new Map<string, ConversionJob>()
let writeQueue = Promise.resolve()

export async function initializeStore() {
    await Promise.all([
        mkdir(sourceDirectory, { recursive: true }),
        mkdir(resultDirectory, { recursive: true }),
    ])

    try {
        const savedJobs = JSON.parse(await readFile(jobsPath, 'utf8')) as ConversionJob[]
        jobs = new Map(savedJobs.map((job) => [job.id, job]))
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
}

async function persist() {
  const temporaryPath = `${jobsPath}.tmp`
  await writeFile(temporaryPath, JSON.stringify([...jobs.values()], null, 2))
  await rename(temporaryPath, jobsPath)
}

function schedulePersist() {
  writeQueue = writeQueue.then(persist, persist)
  return writeQueue
}

export function listJobs() {
    return [...jobs.values()].sort(
        (left, right) => right.createdAt.localeCompare(left.createdAt)
    )
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