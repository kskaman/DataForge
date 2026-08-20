import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { config } from './config.js'
import { guestSession } from './middleware/guest-session.js'
import { batchRouter } from './routes/batch-routes.js'
import { jobRouter } from './routes/job-routes.js'
import { log } from './utils/logger.js'

export const app = express()

app.use(cors({ origin: config.frontendOrigin, credentials: true }))
app.use(express.json())

app.get('/health', (_request, response) => {
  response.json({ status: 'ok', service: 'dataforge-api' })
})

app.use('/api', guestSession)
app.use('/api', jobRouter)
app.use('/api', batchRouter)

app.use((
  error: unknown, _request: express.Request, 
  response: express.Response, 
  _next: express.NextFunction) => {
    
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return response.status(413).json({ 
            error: 'File size must be 50 MB or less.' 
        })
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_COUNT') {
      return response.status(413).json({
        error: 'Choose no more than 20 files.'
      })
    }
  
    const message = error instanceof Error ? error.message : 'Unexpected server error.'
  
    log('error', 'request.failed', { error: message })
  
    return response.status(500).json({ error: message })
})