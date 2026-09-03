import { randomUUID } from 'node:crypto'
import { constants, createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ObjectContent, ObjectStorage } from '../../contracts/object-storage.js'
import { replaceFile } from './atomic-file.js'
import { storageRoot } from './storage-paths.js'

async function writeTemporaryObject(temporaryPath: string, content: ObjectContent) {
    if (content instanceof Readable) {
        await pipeline(content, createWriteStream(temporaryPath))
        return
    }

    await writeFile(temporaryPath, content)
}

export class FilesystemObjectStorage implements ObjectStorage {
    constructor(private readonly root = storageRoot) {}

    private resolve(key: string) {
        if (!key || path.isAbsolute(key) || key.includes('\\')) {
            throw new Error('Object keys must be non-empty relative paths using forward slashes.')
        }

        const normalizedKey = path.posix.normalize(key)
        const resolvedPath = path.resolve(this.root, ...normalizedKey.split('/'))
        const relativePath = path.relative(this.root, resolvedPath)
        if (
            normalizedKey === '..' ||
            normalizedKey.startsWith('../') ||
            relativePath.startsWith('..') ||
            path.isAbsolute(relativePath)
        ) {
            throw new Error('Object key must remain inside the storage root.')
        }

        return resolvedPath
    }

    async initialize() {
        await mkdir(this.root, { recursive: true })
    }

    async checkHealth() {
        await access(this.root, constants.R_OK | constants.W_OK)
    }

    async putObject(key: string, content: ObjectContent) {
        const destinationPath = this.resolve(key)
        const temporaryPath = `${destinationPath}.${randomUUID()}.tmp`
        await mkdir(path.dirname(destinationPath), { recursive: true })

        try {
            await writeTemporaryObject(temporaryPath, content)
            await replaceFile(temporaryPath, destinationPath)
        } catch (error) {
            await rm(temporaryPath, { force: true })
            throw error
        }
    }

    async readObject(key: string) {
        return readFile(this.resolve(key))
    }

    async openReadStream(key: string) {
        return createReadStream(this.resolve(key))
    }

    async getObjectSize(key: string) {
        return (await stat(this.resolve(key))).size
    }

    async deleteObject(key: string) {
        await rm(this.resolve(key), { force: true })
    }
}

export const localObjectStorage = new FilesystemObjectStorage()
