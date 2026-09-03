import { localObjectStorage } from './adapters/local/filesystem-object-storage.js'
import { localBatchRepository } from './repositories/batch-store.js'
import { localJobRepository } from './repositories/job-store.js'

export const objectStorage = localObjectStorage

export const repositories = {
    batches: localBatchRepository,
    jobs: localJobRepository,
}
