import { randomUUID } from 'node:crypto'
import { rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'
import {
    getJob,
    initializeStore,
    listJobs,
    removeJob,
    saveJob,
    sourceDirectory,
} from '../repositories/job-store.js'
import type { ConversionJob, OutputFormat } from '../types.js'
import { errorDetails, log } from '../utils/logger.js'
import { publicErrorMessage } from '../utils/public-error.js'
import { convertJob } from './conversion-service.js'

export function queueJob(id: string) {
    setImmediate(async () => {
        const job = getJob(id)
        if (!job || job.status !== 'queued') return
        const processingStartedAt = Date.now()
        const queuedAt = job.queuedAt ? new Date(job.queuedAt).getTime() : undefined
        const queueWaitMs =
            queuedAt === undefined ? undefined : Math.max(0, processingStartedAt - queuedAt)

        try {
            await saveJob({ ...job, status: 'processing', error: null })
            log('info', 'job.processing', {
                requestId: job.requestId,
                jobId: id,
                outputFormat: job.format,
                inputBytes: job.fileSize,
                queueWaitMs,
            })
            const result = await convertJob(job)
            const resultStats = await stat(result.resultPath)
            const currentJob = getJob(id)
            if (!currentJob) return
            await saveJob({ ...currentJob, ...result, status: 'completed', error: null })
            log('info', 'job.completed', {
                requestId: job.requestId,
                jobId: id,
                outputFormat: job.format,
                inputBytes: job.fileSize,
                outputBytes: resultStats.size,
                queueWaitMs,
                processingDurationMs: Date.now() - processingStartedAt,
                successCount: 1,
                failureCount: 0,
            })
            void rm(job.sourcePath, { force: true }).catch((error) => {
                log('error', 'job.source_cleanup_failed', {
                    requestId: job.requestId,
                    jobId: id,
                    ...errorDetails(error),
                })
            })
        } catch (error) {
            const currentJob = getJob(id)
            if (!currentJob) return
            const message = publicErrorMessage(error, 'Conversion failed.', config.production)
            await saveJob({
                ...currentJob,
                status: 'failed',
                error: message,
                resultPath: null,
                resultFileName: null,
            })
            log('error', 'job.failed', {
                requestId: job.requestId,
                jobId: id,
                outputFormat: job.format,
                inputBytes: job.fileSize,
                queueWaitMs,
                processingDurationMs: Date.now() - processingStartedAt,
                successCount: 0,
                failureCount: 1,
                ...errorDetails(error),
            })
        }
    })
}

export async function createJob(
    file: Express.Multer.File,
    format: OutputFormat,
    splitSheets: boolean,
    ownerId: string,
    requestId: string,
) {
    const id = randomUUID()
    const extension = path.extname(file.originalname).slice(1).toLowerCase()
    const sourcePath = path.join(sourceDirectory, `${id}.${extension}`)

    await writeFile(sourcePath, file.buffer)

    const now = Date.now()

    const job: ConversionJob = {
        id,
        ownerId,
        requestId,
        queuedAt: new Date(now).toISOString(),
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

    log('info', 'job.queued', {
        requestId,
        jobId: id,
        outputFormat: format,
        inputBytes: job.fileSize,
    })

    queueJob(id)
    return job
}

export async function retryJob(job: ConversionJob, requestId: string) {
    const retriedJob: ConversionJob = {
        ...job,
        requestId,
        queuedAt: new Date().toISOString(),
        status: 'queued',
        error: null,
        resultPath: null,
        resultFileName: null,
    }

    await saveJob(retriedJob)

    log('info', 'job.retried', {
        requestId,
        jobId: job.id,
        outputFormat: job.format,
        inputBytes: job.fileSize,
    })

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

    listJobs()
        .filter((job) => job.status === 'queued' || job.status === 'processing')
        .forEach((job) => {
            void saveJob({
                ...job,
                status: 'queued',
            }).then(() => queueJob(job.id))
        })

    setInterval(() => void cleanupExpiredJobs(), 60 * 60 * 1000).unref()
}
