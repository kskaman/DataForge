import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'
import { getJob, initializeStore, listJobs, removeJob, saveJob, sourceDirectory } from '../repositories/job-store.js'
import type { ConversionJob, OutputFormat } from '../types.js'
import { log } from '../utils/logger.js'
import { convertJob } from './conversion-service.js'

export function queueJob(id: string) {
  setImmediate(async () => {
    const job = getJob(id)
    if (!job || job.status !== 'queued') return

    try {
      await saveJob({ ...job, status: 'processing', error: null })
      log('info', 'job.processing', { jobId: id })
      const result = await convertJob(job)
      const currentJob = getJob(id)
      if (!currentJob) return
      await saveJob({ ...currentJob, ...result, status: 'completed', error: null })
      log('info', 'job.completed', { jobId: id })
      void rm(job.sourcePath, { force: true }).catch((error) => {
        log('error', 'job.source_cleanup_failed', { jobId: id, error: error instanceof Error ? error.message : String(error) })
      })
    } catch (error) {
      const currentJob = getJob(id)
      if (!currentJob) return
      const message = error instanceof Error ? error.message : 'Conversion failed.'
      await saveJob({ ...currentJob, status: 'failed', error: message, resultPath: null, resultFileName: null })
      log('error', 'job.failed', { jobId: id, error: message })
    }
  })
}

export async function createJob(file: Express.Multer.File, format: OutputFormat, splitSheets: boolean, ownerId: string) {
  const id = randomUUID()
  const extension = path.extname(file.originalname).slice(1).toLowerCase()
  const sourcePath = path.join(sourceDirectory, `${id}.${extension}`)
  await writeFile(sourcePath, file.buffer)
  const now = Date.now()
  const job: ConversionJob = {
    id,
    ownerId,
    fileName: path.basename(file.originalname),
    fileSize: file.size,
    format,
    splitSheets: extension === 'xlsx' && splitSheets,
    status: 'queued',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + config.retentionMilliseconds).toISOString(),
    error: null,
    sourcePath,
    resultPath: null,
    resultFileName: null,
  }
  await saveJob(job)
  log('info', 'job.queued', { jobId: id, fileName: job.fileName, format })
  queueJob(id)
  return job
}

export async function retryJob(job: ConversionJob) {
  const retriedJob: ConversionJob = {
    ...job,
    status: 'queued',
    error: null,
    resultPath: null,
    resultFileName: null,
  }
  await saveJob(retriedJob)
  log('info', 'job.retried', { jobId: job.id })
  queueJob(job.id)
  return retriedJob
}

export async function cleanupExpiredJobs() {
  const expiredJobs = listJobs().filter((job) => new Date(job.expiresAt).getTime() <= Date.now())
  for (const job of expiredJobs) {
    await Promise.all([
      rm(job.sourcePath, { force: true }),
      job.resultPath ? rm(job.resultPath, { force: true }) : Promise.resolve(),
    ])
    await removeJob(job.id)
    log('info', 'job.expired', { jobId: job.id })
  }
}

export async function initializeJobs() {
  await initializeStore()
  await cleanupExpiredJobs()
  listJobs().filter((job) => job.status === 'queued' || job.status === 'processing').forEach((job) => {
    void saveJob({ ...job, status: 'queued' }).then(() => queueJob(job.id))
  })
  setInterval(() => void cleanupExpiredJobs(), 60 * 60 * 1000).unref()
}