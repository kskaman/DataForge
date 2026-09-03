import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { config } from '../config.js'
import { conversionDispatcher, objectStorage, repositories } from '../dependencies.js'
import type { ConversionJob, OutputFormat } from '../types.js'
import { errorDetails, log } from '../utils/logger.js'
import { publicErrorMessage } from '../utils/public-error.js'
import { convertJob } from './conversion-service.js'

export async function processJob(id: string) {
    const job = await repositories.jobs.get(id)
    if (!job || job.status !== 'queued') return
    const processingStartedAt = Date.now()
    const queuedAt = job.queuedAt ? new Date(job.queuedAt).getTime() : undefined
    const queueWaitMs =
        queuedAt === undefined ? undefined : Math.max(0, processingStartedAt - queuedAt)

    try {
        await repositories.jobs.save({ ...job, status: 'processing', error: null })
        log('info', 'job.processing', {
            requestId: job.requestId,
            jobId: id,
            outputFormat: job.format,
            inputBytes: job.fileSize,
            queueWaitMs,
        })
        const result = await convertJob(job)
        const outputBytes = await objectStorage.getObjectSize(result.resultKey)
        const currentJob = await repositories.jobs.get(id)
        if (!currentJob) return
        await repositories.jobs.save({
            ...currentJob,
            ...result,
            status: 'completed',
            error: null,
        })
        log('info', 'job.completed', {
            requestId: job.requestId,
            jobId: id,
            outputFormat: job.format,
            inputBytes: job.fileSize,
            outputBytes,
            queueWaitMs,
            processingDurationMs: Date.now() - processingStartedAt,
            successCount: 1,
            failureCount: 0,
        })
        void objectStorage.deleteObject(job.sourceKey).catch((error) => {
            log('error', 'job.source_cleanup_failed', {
                requestId: job.requestId,
                jobId: id,
                ...errorDetails(error),
            })
        })
    } catch (error) {
        const currentJob = await repositories.jobs.get(id)
        if (!currentJob) return
        const message = publicErrorMessage(error, 'Conversion failed.', config.production)
        await repositories.jobs.save({
            ...currentJob,
            status: 'failed',
            error: message,
            resultKey: null,
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
    const sourceKey = `sources/${id}.${extension}`

    await objectStorage.putObject(sourceKey, file.buffer)

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
        sourceKey,
        resultKey: null,
        resultFileName: null,
    }

    try {
        await repositories.jobs.save(job)
    } catch (error) {
        await objectStorage.deleteObject(sourceKey)
        throw error
    }

    log('info', 'job.queued', {
        requestId,
        jobId: id,
        outputFormat: format,
        inputBytes: job.fileSize,
    })

    await conversionDispatcher.dispatch({ type: 'job.convert', jobId: id })
    return job
}

export async function retryJob(job: ConversionJob, requestId: string) {
    const retriedJob: ConversionJob = {
        ...job,
        requestId,
        queuedAt: new Date().toISOString(),
        status: 'queued',
        error: null,
        resultKey: null,
        resultFileName: null,
    }

    await repositories.jobs.save(retriedJob)

    log('info', 'job.retried', {
        requestId,
        jobId: job.id,
        outputFormat: job.format,
        inputBytes: job.fileSize,
    })

    await conversionDispatcher.dispatch({ type: 'job.convert', jobId: job.id })
    return retriedJob
}

export async function cleanupExpiredJobs() {
    const expiredJobs = (await repositories.jobs.list()).filter(
        (job) => new Date(job.expiresAt).getTime() <= Date.now(),
    )

    for (const job of expiredJobs) {
        await Promise.all([
            objectStorage.deleteObject(job.sourceKey),
            job.resultKey ? objectStorage.deleteObject(job.resultKey) : Promise.resolve(),
        ])

        await repositories.jobs.remove(job.id)

        log('info', 'job.expired', { jobId: job.id })
    }
}

export async function initializeJobs() {
    await repositories.jobs.initialize()
    await cleanupExpiredJobs()

    const unfinishedJobs = (await repositories.jobs.list()).filter(
        (job) => job.status === 'queued' || job.status === 'processing',
    )

    for (const job of unfinishedJobs) {
        await repositories.jobs.save({
            ...job,
            status: 'queued',
        })
        await conversionDispatcher.dispatch({ type: 'job.convert', jobId: job.id })
    }

    setInterval(() => void cleanupExpiredJobs(), 60 * 60 * 1000).unref()
}
