import { app } from './app.js'
import { config } from './config.js'
import { conversionDispatcher, objectStorage } from './dependencies.js'
import { initializeBatches } from './services/batch-service.js'
import { markApplicationReady } from './services/health-service.js'
import { initializeJobs } from './services/job-service.js'
import { log } from './utils/logger.js'

await conversionDispatcher.initialize()
await objectStorage.initialize()
await initializeJobs()
await initializeBatches()
markApplicationReady()

app.listen(config.port, () => log('info', 'server.started', { port: config.port }))
