import type { Request, Response } from 'express'
import { repositories } from '../dependencies.js'
import { createJob, retryJob } from '../services/job-service.js'
import { outputFormats, toPublicJob, type OutputFormat } from '../types.js'
import { hasValidSignature, signDownload } from '../utils/download-token.js'
import { sendObject } from '../utils/send-object.js'

type JobRequest = Request<{ id: string }>

export async function listJobHandler(request: Request, response: Response) {
    response.json({
        jobs: (await repositories.jobs.listForOwner(request.guestOwnerId)).map(toPublicJob),
    })
}

export async function getJobHandler(request: JobRequest, response: Response) {
    const job = await repositories.jobs.getForOwner(request.params.id, request.guestOwnerId)

    if (!job) {
        return response.status(404).json({
            error: 'Job not found.',
        })
    }

    return response.json({
        job: toPublicJob(job),
    })
}

export async function createJobHandler(request: Request, response: Response) {
    const file = request.file
    const format = request.body.format as OutputFormat
    const extension = file?.originalname.split('.').pop()?.toLowerCase()

    if (!file) {
        return response.status(400).json({
            error: 'A file is required.',
        })
    }

    if (extension !== 'xlsx' && extension !== 'csv') {
        return response.status(415).json({
            error: 'Only .xlsx and .csv files are supported.',
        })
    }

    if (!outputFormats.includes(format)) {
        return response.status(400).json({
            error: 'Output format must be CSV, TSV, or JSON.',
        })
    }

    const job = await createJob(
        file,
        format,
        request.body.splitSheets === 'true',
        request.guestOwnerId,
        request.requestId,
    )

    return response.status(202).json({
        job: toPublicJob(job),
    })
}

export async function retryJobHandler(request: JobRequest, response: Response) {
    const job = await repositories.jobs.getForOwner(request.params.id, request.guestOwnerId)

    if (!job) {
        return response.status(404).json({
            error: 'Job not found.',
        })
    }

    if (job.status !== 'failed') {
        return response.status(409).json({
            error: 'Only failed jobs can be retried.',
        })
    }

    const retriedJob = await retryJob(job, request.requestId)

    return response.status(202).json({
        job: toPublicJob(retriedJob),
    })
}

export async function getDownloadHandler(request: JobRequest, response: Response) {
    const job = await repositories.jobs.getForOwner(request.params.id, request.guestOwnerId)

    if (!job) {
        return response.status(404).json({
            error: 'Job not found.',
        })
    }

    if (job.status !== 'completed' || !job.resultKey) {
        return response.status(409).json({
            error: 'Result is not ready.',
        })
    }

    const expires = Date.now() + 5 * 60 * 1000
    const token = signDownload(job.id, expires)

    return response.json({
        url: `/api/downloads/${job.id}?expires=${expires}&token=${token}`,
        expiresAt: new Date(expires).toISOString(),
    })
}

export async function downloadHandler(request: JobRequest, response: Response) {
    const job = await repositories.jobs.getForOwner(request.params.id, request.guestOwnerId)
    const expires = Number(request.query.expires)
    const token = typeof request.query.token === 'string' ? request.query.token : ''

    if (!job || !job.resultKey || !job.resultFileName) {
        return response.status(404).json({
            error: 'Result not found.',
        })
    }

    if (!hasValidSignature(job.id, expires, token)) {
        return response.status(403).json({
            error: 'Download link is invalid or expired.',
        })
    }

    await sendObject(response, job.resultKey, job.resultFileName)
}
