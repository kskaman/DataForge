import { Router } from 'express'
import multer from 'multer'
import {
    createJobHandler,
    downloadHandler,
    getDownloadHandler,
    getJobHandler,
    listJobHandler,
    retryJobHandler,
} from '../controllers/job-controller.js'
import { writeRateLimiter } from '../middleware/security.js'
import {
    downloadQuerySchema,
    idParamsSchema,
    jobUploadFieldsSchema,
    validateRequest,
} from '../middleware/validation.js'

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
})

export const jobRouter = Router()

jobRouter.get('/jobs', listJobHandler)
jobRouter.get('/jobs/:id', validateRequest(idParamsSchema, 'params'), getJobHandler)
jobRouter.post(
    '/jobs',
    writeRateLimiter,
    upload.single('file'),
    validateRequest(jobUploadFieldsSchema, 'body'),
    createJobHandler,
)
jobRouter.post(
    '/jobs/:id/retry',
    writeRateLimiter,
    validateRequest(idParamsSchema, 'params'),
    retryJobHandler,
)
jobRouter.get('/jobs/:id/download', validateRequest(idParamsSchema, 'params'), getDownloadHandler)
jobRouter.get(
    '/downloads/:id',
    validateRequest(idParamsSchema, 'params'),
    validateRequest(downloadQuerySchema, 'query'),
    downloadHandler,
)
