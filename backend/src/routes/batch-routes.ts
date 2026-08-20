import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import {
  batchDownloadHandler,
  configureBatchHandler,
  createBatchHandler,
  getBatchDownloadHandler,
  getBatchHandler,
  listBatchHandler,
  retryBatchHandler,
} from '../controllers/batch-controller.js'
import { batchSourceDirectory } from '../storage/batch-store.js'

const upload = multer({
  
    storage: multer.diskStorage({
        destination: batchSourceDirectory,
        filename: (_request, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
  
    limits: { fileSize: 50 * 1024 * 1024, files: 20 },
})

function uploadBatch(request: Request, response: Response, next: NextFunction) {
  upload.array('files', 20)(request, response, (error) => {
    if (!error) return next()
    const files = Array.isArray(request.files) ? request.files : []
    void Promise.all(files.map((file) => rm(file.path, { force: true }))).then(() => next(error), next)
  })
}

export const batchRouter = Router()

batchRouter.get('/batches', listBatchHandler)
batchRouter.get('/batches/:id', getBatchHandler)
batchRouter.post('/batches', uploadBatch, createBatchHandler)
batchRouter.post('/batches/:id/configure', configureBatchHandler)
batchRouter.post('/batches/:id/retry', retryBatchHandler)
batchRouter.get('/batches/:id/download', getBatchDownloadHandler)
batchRouter.get('/batch-downloads/:id', batchDownloadHandler)