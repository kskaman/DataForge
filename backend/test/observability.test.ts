import assert from 'node:assert/strict'
import test from 'node:test'
import { app } from '../src/app.js'
import { resolveRequestId, shouldLogCompletedRequest } from '../src/middleware/request-context.js'
import { readinessReport } from '../src/services/health-service.js'

test('request IDs accept safe correlation values and replace invalid values', () => {
    assert.equal(resolveRequestId('client-request_123'), 'client-request_123')
    assert.match(resolveRequestId('not allowed'), /^[0-9a-f-]{36}$/)
    assert.match(resolveRequestId(undefined), /^[0-9a-f-]{36}$/)
})

test('successful routine reads are suppressed while errors and mutations are logged', () => {
    assert.equal(shouldLogCompletedRequest('GET', '/api/activity', 200), false)
    assert.equal(shouldLogCompletedRequest('GET', '/health/ready', 200), false)
    assert.equal(shouldLogCompletedRequest('GET', '/api/activity', 500), true)
    assert.equal(shouldLogCompletedRequest('POST', '/api/batches', 202), true)
})

test('responses echo an accepted request ID', async (context) => {
    const server = app.listen(0)
    context.after(() => {
        server.close()
        server.closeAllConnections()
    })
    const address = server.address()
    assert(address && typeof address === 'object')

    const response = await fetch(`http://127.0.0.1:${address.port}/health/live`, {
        headers: { Connection: 'close', 'X-Request-ID': 'test-correlation-id' },
    })

    await response.json()
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-request-id'), 'test-correlation-id')
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0')
})

test('readiness reports initialization, storage, and queue checks', async () => {
    const report = await readinessReport()

    assert.equal(report.status, 'not_ready')
    assert.equal(report.checks.initialization, 'not_ready')
    assert.equal(report.checks.queue.provider, 'in-process')
    assert.match(report.checks.storage, /^(ok|not_ready)$/)
})

test('activity returns jobs and batches in one guest-scoped response', async (context) => {
    const server = app.listen(0)
    context.after(() => {
        server.close()
        server.closeAllConnections()
    })
    const address = server.address()
    assert(address && typeof address === 'object')

    const response = await fetch(`http://127.0.0.1:${address.port}/api/activity`, {
        headers: { Connection: 'close' },
    })
    const body = (await response.json()) as { jobs: unknown[]; batches: unknown[] }

    assert.equal(response.status, 200)
    assert(Array.isArray(body.jobs))
    assert(Array.isArray(body.batches))
    assert.match(response.headers.get('set-cookie') ?? '', /dataforge_guest=/)
})
