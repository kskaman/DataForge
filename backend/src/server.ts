import { app } from './app.js'
import { config } from './config.js'
import { initializeBatches } from './services/batch-service.js'
import { initializeJobs } from './services/job-service.js'
import { log } from './utils/logger.js'

await initializeJobs()
await initializeBatches()
app.listen(config.port, () => log('info', 'server.started', { port: config.port }))