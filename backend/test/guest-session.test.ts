import assert from 'node:assert/strict'
import test from 'node:test'
import { toPublicBatchJob, toPublicJob, type BatchJob, type ConversionJob } from '../src/types.js'
import {
    createGuestToken,
    guestCookie,
    isValidGuestToken,
    ownerIdFromToken,
    readGuestToken,
} from '../src/utils/guest-session.js'

test('guest tokens are valid, random 256-bit values', () => {
    const first = createGuestToken()
    const second = createGuestToken()
    assert.equal(isValidGuestToken(first), true)
    assert.equal(isValidGuestToken(second), true)
    assert.notEqual(first, second)
    assert.equal(Buffer.from(first, 'base64url').length, 32)
})

test('owner IDs are stable and do not expose the guest token', () => {
    const token = createGuestToken()
    const ownerId = ownerIdFromToken(token)
    assert.equal(ownerId, ownerIdFromToken(token))
    assert.notEqual(ownerId, ownerIdFromToken(createGuestToken()))
    assert.equal(ownerId.includes(token), false)
})

test('guest cookies are parsed and carry browser-only retention attributes', () => {
    const token = createGuestToken()
    const serialized = guestCookie(token)
    assert.equal(readGuestToken(`theme=light; ${serialized.split(';')[0]}; other=value`), token)
    assert.equal(readGuestToken('dataforge_guest=invalid'), undefined)
    assert.match(serialized, /HttpOnly/)
    assert.match(serialized, /SameSite=Lax/)
    assert.match(serialized, /Path=\//)
    assert.match(serialized, /Max-Age=86400/)
})

test('public records redact owner and server paths', () => {
    const job: ConversionJob = {
        id: 'job-id',
        ownerId: 'private-owner',
        requestId: 'private-request',
        queuedAt: new Date(0).toISOString(),
        fileName: 'source.csv',
        fileSize: 10,
        format: 'JSON',
        splitSheets: false,
        status: 'completed',
        createdAt: new Date(0).toISOString(),
        expiresAt: new Date(1).toISOString(),
        error: null,
        sourceKey: 'private-source',
        resultKey: 'private-result',
        resultFileName: 'result.json',
    }
    const batch: BatchJob = {
        id: 'batch-id',
        ownerId: 'private-owner',
        requestId: 'private-request',
        queuedAt: new Date(0).toISOString(),
        fileName: '1 file',
        fileSize: 10,
        fileCount: 1,
        status: 'completed',
        createdAt: new Date(0).toISOString(),
        expiresAt: new Date(1).toISOString(),
        sources: [{ fileName: 'source.csv', fileSize: 10, sourceKey: 'private-source' }],
        datasets: [],
        schemaGroups: [],
        faults: [],
        configuration: { strategy: 'merge', format: 'JSON' },
        resultKey: 'private-result',
        resultFileName: 'result.json',
    }

    assert.deepEqual(Object.keys(toPublicJob(job)).sort(), [
        'createdAt',
        'error',
        'expiresAt',
        'fileName',
        'fileSize',
        'format',
        'id',
        'resultFileName',
        'splitSheets',
        'status',
    ])
    assert.deepEqual(toPublicBatchJob(batch).sources, [{ fileName: 'source.csv', fileSize: 10 }])
    assert.equal('ownerId' in toPublicBatchJob(batch), false)
    assert.equal('requestId' in toPublicJob(job), false)
    assert.equal('queuedAt' in toPublicJob(job), false)
    assert.equal('requestId' in toPublicBatchJob(batch), false)
    assert.equal('queuedAt' in toPublicBatchJob(batch), false)
})
