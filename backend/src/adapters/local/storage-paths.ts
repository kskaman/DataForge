import path from 'node:path'

export const storageRoot = path.resolve(import.meta.dirname, '..', '..', '..', 'storage')
export const jobsMetadataPath = path.join(storageRoot, 'jobs.json')
export const batchesMetadataPath = path.join(storageRoot, 'batches.json')

export function localPathToObjectKey(filePath: string) {
    if (!path.isAbsolute(filePath)) return filePath.replaceAll('\\', '/')

    const relativePath = path.relative(storageRoot, filePath)
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('Stored file path is outside the local object-storage root.')
    }

    return relativePath.replaceAll('\\', '/')
}
