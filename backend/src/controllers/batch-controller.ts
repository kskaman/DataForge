import { rm } from 'node:fs/promises'
import type { Request, Response } from 'express'
import { repositories } from '../dependencies.js'
import { configureBatch, createBatch, retryBatch } from '../services/batch-service.js'
import { toPublicBatchJob, type BatchConfiguration } from '../types.js'
import { ClientError } from '../utils/client-error.js'
import { hasValidSignature, signDownload } from '../utils/download-token.js'
import { sendObject } from '../utils/send-object.js'

type BatchRequest = Request<{ id: string }>

export async function createBatchHandler(request: Request, response: Response) {
    const files = Array.isArray(request.files) ? request.files : []

    try {
        const batch = await createBatch(files, request.guestOwnerId, request.requestId)
        return response.status(202).json({ batch: toPublicBatchJob(batch) })
    } catch (error) {
        await Promise.all(files.map((file) => rm(file.path, { force: true })))
        if (error instanceof ClientError) {
            return response.status(error.statusCode).json({ error: error.message })
        }
        throw error
    }
}

export async function listBatchHandler(request: Request, response: Response) {
    response.json({
        batches: (await repositories.batches.listForOwner(request.guestOwnerId)).map(
            toPublicBatchJob,
        ),
    })
}

export async function getBatchHandler(request: BatchRequest, response: Response) {
    const batch = await repositories.batches.getForOwner(request.params.id, request.guestOwnerId)
    if (!batch) return response.status(404).json({ error: 'Batch not found.' })
    return response.json({ batch: toPublicBatchJob(batch) })
}

export async function configureBatchHandler(request: BatchRequest, response: Response) {
    const batch = await repositories.batches.getForOwner(request.params.id, request.guestOwnerId)
    if (!batch) return response.status(404).json({ error: 'Batch not found.' })
    try {
        const configured = await configureBatch(
            batch,
            request.body as BatchConfiguration,
            request.requestId,
        )
        return response.status(202).json({ batch: toPublicBatchJob(configured) })
    } catch (error) {
        if (error instanceof ClientError) {
            return response.status(error.statusCode).json({ error: error.message })
        }
        throw error
    }
}

export async function retryBatchHandler(request: BatchRequest, response: Response) {
    const batch = await repositories.batches.getForOwner(request.params.id, request.guestOwnerId)
    if (!batch) return response.status(404).json({ error: 'Batch not found.' })
    if (batch.status !== 'failed')
        return response.status(409).json({ error: 'Only failed batches can be retried.' })
    return response
        .status(202)
        .json({ batch: toPublicBatchJob(await retryBatch(batch, request.requestId)) })
}

export async function getBatchDownloadHandler(request: BatchRequest, response: Response) {
    const batch = await repositories.batches.getForOwner(request.params.id, request.guestOwnerId)
    if (!batch) return response.status(404).json({ error: 'Batch not found.' })
    if (batch.status !== 'completed' || !batch.resultKey)
        return response.status(409).json({ error: 'Batch result is not ready.' })
    const expires = Date.now() + 5 * 60 * 1000
    const token = signDownload(batch.id, expires)
    return response.json({
        url: `/api/batch-downloads/${batch.id}?expires=${expires}&token=${token}`,
        expiresAt: new Date(expires).toISOString(),
    })
}

export async function batchDownloadHandler(request: BatchRequest, response: Response) {
    const batch = await repositories.batches.getForOwner(request.params.id, request.guestOwnerId)
    const expires = Number(request.query.expires)
    const token = typeof request.query.token === 'string' ? request.query.token : ''
    if (!batch || !batch.resultKey || !batch.resultFileName)
        return response.status(404).json({ error: 'Batch result not found.' })
    if (!hasValidSignature(batch.id, expires, token))
        return response.status(403).json({ error: 'Download link is invalid or expired.' })
    await sendObject(response, batch.resultKey, batch.resultFileName)
}
