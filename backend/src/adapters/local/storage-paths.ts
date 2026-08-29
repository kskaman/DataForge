import path from 'node:path'

export const storageRoot = path.resolve(import.meta.dirname, '..', '..', '..', 'storage')
export const jobSourceDirectory = path.join(storageRoot, 'sources')
export const jobResultDirectory = path.join(storageRoot, 'results')
export const batchSourceDirectory = path.join(storageRoot, 'batch-sources')
export const batchResultDirectory = path.join(storageRoot, 'batch-results')
export const jobsMetadataPath = path.join(storageRoot, 'jobs.json')
export const batchesMetadataPath = path.join(storageRoot, 'batches.json')
