import cors from 'cors'
import express from 'express'
import { config } from './config.js'
import { errorHandler } from './middleware/error-handler.js'
import { guestSession } from './middleware/guest-session.js'
import { requestContext } from './middleware/request-context.js'
import { apiRateLimiter, requireTrustedOrigin, securityHeaders } from './middleware/security.js'
import { activityRouter } from './routes/activity-routes.js'
import { batchRouter } from './routes/batch-routes.js'
import { jobRouter } from './routes/job-routes.js'
import { livenessReport, readinessReport } from './services/health-service.js'

export const app = express()

if (config.trustProxyHops > 0) app.set('trust proxy', config.trustProxyHops)
app.use(requestContext)
app.use(securityHeaders)
app.use(cors({ origin: config.frontendOrigin, credentials: true }))
app.use(express.json({ limit: config.jsonBodyLimit }))

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

app.use('/api', guestSession, requireTrustedOrigin, apiRateLimiter)
app.use('/api', activityRouter)
app.use('/api', jobRouter)
app.use('/api', batchRouter)

app.use(errorHandler)
