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

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
})

export const jobRouter = Router()

jobRouter.get('/jobs', listJobHandler)
jobRouter.get('/jobs/:id', getJobHandler)
jobRouter.post('/jobs', upload.single('file'), createJobHandler)
jobRouter.post('/jobs/:id/retry', retryJobHandler)
jobRouter.get('/jobs/:id/download', getDownloadHandler)
jobRouter.get('/downloads/:id', downloadHandler)
