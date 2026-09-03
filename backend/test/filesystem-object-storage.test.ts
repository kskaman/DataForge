import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import { FilesystemObjectStorage } from '../src/adapters/local/filesystem-object-storage.js'

test('local object storage supports buffer and streamed object lifecycles', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dataforge-storage-'))
    const storage = new FilesystemObjectStorage(root)

    try {
        await storage.initialize()
        await storage.checkHealth()
        await storage.putObject('job-sources/job.csv', Buffer.from('name\nAda'))
        assert.equal((await storage.readObject('job-sources/job.csv')).toString(), 'name\nAda')
        assert.equal(await storage.getObjectSize('job-sources/job.csv'), 8)

        await storage.putObject('job-sources/job.csv', Readable.from(['name\n', 'Grace']))
        assert.equal((await storage.readObject('job-sources/job.csv')).toString(), 'name\nGrace')

        const stream = await storage.openReadStream('job-sources/job.csv')
        const chunks: Buffer[] = []
        for await (const chunk of stream) chunks.push(Buffer.from(chunk))
        assert.equal(Buffer.concat(chunks).toString(), 'name\nGrace')

        await storage.deleteObject('job-sources/job.csv')
        await assert.rejects(readFile(path.join(root, 'job-sources', 'job.csv')), {
            code: 'ENOENT',
        })
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('local object storage rejects keys outside its root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dataforge-storage-'))
    const storage = new FilesystemObjectStorage(root)

    try {
        await storage.initialize()
        await assert.rejects(storage.putObject('../escape.txt', 'blocked'), /storage root/)
        await assert.rejects(storage.putObject('C:\\escape.txt', 'blocked'), /forward slashes/)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})
