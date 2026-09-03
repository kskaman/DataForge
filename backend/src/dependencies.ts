import { localObjectStorage } from './adapters/local/filesystem-object-storage.js'
import { InProcessConversionDispatcher } from './adapters/local/in-process-conversion-dispatcher.js'
import type { ConversionCommand } from './contracts/conversion-dispatcher.js'
import { localBatchRepository } from './repositories/batch-store.js'
import { localJobRepository } from './repositories/job-store.js'

export const objectStorage = localObjectStorage

async function handleConversionCommand(command: ConversionCommand) {
    if (command.type === 'job.convert') {
        const { processJob } = await import('./services/job-service.js')
        await processJob(command.jobId)
        return
    }

    const { analyzeBatch, processBatch } = await import('./services/batch-service.js')
    if (command.type === 'batch.analyze') {
        await analyzeBatch(command.batchId)
        return
    }

    await processBatch(command.batchId)
}

export const conversionDispatcher = new InProcessConversionDispatcher(handleConversionCommand)

export const repositories = {
    batches: localBatchRepository,
    jobs: localJobRepository,
}
