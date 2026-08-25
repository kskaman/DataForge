import cors from 'cors'
import express from 'express'
import multer from 'multer'
import { config } from './config.js'
import { guestSession } from './middleware/guest-session.js'
import { requestContext } from './middleware/request-context.js'
import { activityRouter } from './routes/activity-routes.js'
import { batchRouter } from './routes/batch-routes.js'
import { jobRouter } from './routes/job-routes.js'
import { livenessReport, readinessReport } from './services/health-service.js'
import { errorDetails, log } from './utils/logger.js'

export const app = express()

app.use(requestContext)
app.use(cors({ origin: config.frontendOrigin, credentials: true }))
app.use(express.json())

function disableCaching(
    _request: express.Request,
    response: express.Response,
    next: express.NextFunction,
) {
    response.setHeader('Cache-Control', 'no-store, max-age=0')
    response.setHeader('Pragma', 'no-cache')
    next()
}

app.use('/health', disableCaching)
app.get('/health/live', (_request, response) => response.json(livenessReport()))

async function readinessHandler(_request: express.Request, response: express.Response) {
    const report = await readinessReport()
    return response.status(report.status === 'ok' ? 200 : 503).json(report)
}

app.get('/health', readinessHandler)
app.get('/health/ready', readinessHandler)

app.use('/api', guestSession)
app.use('/api', activityRouter)
app.use('/api', jobRouter)
app.use('/api', batchRouter)

app.use(
    (
        error: unknown,
        request: express.Request,
        response: express.Response,
        _next: express.NextFunction,
    ) => {
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
            return response.status(413).json({
                error: 'File size must be 50 MB or less.',
            })
        }

        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_COUNT') {
            return response.status(413).json({
                error: 'Choose no more than 20 files.',
            })
        }

        const message = error instanceof Error ? error.message : 'Unexpected server error.'

        log('error', 'request.failed', {
            requestId: request.requestId,
            method: request.method,
            path: request.path,
            ...errorDetails(error),
        })

        return response.status(500).json({ error: message })
    },
)
