import { localBatchRepository } from './repositories/batch-store.js'
import { localJobRepository } from './repositories/job-store.js'

export const repositories = {
    batches: localBatchRepository,
    jobs: localJobRepository,
}
