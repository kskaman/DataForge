import { rm } from 'node:fs/promises'
import type { Request, Response } from 'express'
import { configureBatch, createBatch, retryBatch } from '../services/batch-service.js'
import { getBatch, listBatches } from '../storage/batch-store.js'
import { toPublicBatchJob, type BatchConfiguration } from '../types.js'
import { hasValidSignature, signDownload } from '../utils/download-token.js'

type BatchRequest = Request<{ id: string }>

export async function createBatchHandler(request: Request, response: Response) {
  const files = Array.isArray(request.files) ? request.files : []
  try {
    const batch = await createBatch(files)
    return response.status(202).json({ batch: toPublicBatchJob(batch) })
  } catch (error) {
    await Promise.all(files.map((file) => rm(file.path, { force: true })))
    const message = error instanceof Error ? error.message : 'Batch upload failed.'
    return response.status(400).json({ error: message })
  }
}

export function listBatchHandler(_request: Request, response: Response) {
  response.json({ batches: listBatches().map(toPublicBatchJob) })
}

export function getBatchHandler(request: BatchRequest, response: Response) {
  const batch = getBatch(request.params.id)
  if (!batch) return response.status(404).json({ error: 'Batch not found.' })
  return response.json({ batch: toPublicBatchJob(batch) })
}

export async function configureBatchHandler(request: BatchRequest, response: Response) {
  const batch = getBatch(request.params.id)
  if (!batch) return response.status(404).json({ error: 'Batch not found.' })
  try {
    const configured = await configureBatch(batch, request.body as BatchConfiguration)
    return response.status(202).json({ batch: toPublicBatchJob(configured) })
  } catch (error) {
    return response.status(409).json({ error: error instanceof Error ? error.message : 'Batch configuration failed.' })
  }
}

export async function retryBatchHandler(request: BatchRequest, response: Response) {
  const batch = getBatch(request.params.id)
  if (!batch) return response.status(404).json({ error: 'Batch not found.' })
  if (batch.status !== 'failed') return response.status(409).json({ error: 'Only failed batches can be retried.' })
  return response.status(202).json({ batch: toPublicBatchJob(await retryBatch(batch)) })
}

export function getBatchDownloadHandler(request: BatchRequest, response: Response) {
  const batch = getBatch(request.params.id)
  if (!batch) return response.status(404).json({ error: 'Batch not found.' })
  if (batch.status !== 'completed' || !batch.resultPath) return response.status(409).json({ error: 'Batch result is not ready.' })
  const expires = Date.now() + 5 * 60 * 1000
  const token = signDownload(batch.id, expires)
  return response.json({ url: `/api/batch-downloads/${batch.id}?expires=${expires}&token=${token}`, expiresAt: new Date(expires).toISOString() })
}

export function batchDownloadHandler(request: BatchRequest, response: Response) {
  const batch = getBatch(request.params.id)
  const expires = Number(request.query.expires)
  const token = typeof request.query.token === 'string' ? request.query.token : ''
  if (!batch || !batch.resultPath || !batch.resultFileName) return response.status(404).json({ error: 'Batch result not found.' })
  if (!hasValidSignature(batch.id, expires, token)) return response.status(403).json({ error: 'Download link is invalid or expired.' })
  return response.download(batch.resultPath, batch.resultFileName)
}