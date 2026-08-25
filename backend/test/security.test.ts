import assert from 'node:assert/strict'
import test from 'node:test'
import express, { type Express } from 'express'
import { app } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { createRateLimiter } from '../src/middleware/security.js'
import { publicErrorMessage } from '../src/utils/public-error.js'

async function withServer<T>(application: Express, run: (origin: string) => Promise<T>) {
    const server = application.listen(0)
    const address = server.address()
    assert(address && typeof address === 'object')

    try {
        return await run(`http://127.0.0.1:${address.port}`)
    } finally {
        server.close()
        server.closeAllConnections()
    }
}

test('production requires strong distinct signing secrets', () => {
    const production = {
        NODE_ENV: 'production',
        GUEST_SESSION_SECRET: 'g'.repeat(32),
        DOWNLOAD_SECRET: 'd'.repeat(32),
    }

    assert.equal(loadConfig(production).production, true)
    assert.throws(
        () => loadConfig({ ...production, DOWNLOAD_SECRET: undefined }),
        /DOWNLOAD_SECRET/,
    )
    assert.throws(
        () => loadConfig({ ...production, DOWNLOAD_SECRET: production.GUEST_SESSION_SECRET }),
        /must be different/,
    )
    assert.throws(
        () => loadConfig({ ...production, DOWNLOAD_SECRET: 'replace-with-a-long-random-value' }),
        /DOWNLOAD_SECRET/,
    )
})

test('unexpected production errors do not expose internal messages', () => {
    const error = new Error('sensitive filesystem detail')
    assert.equal(
        publicErrorMessage(error, 'Unexpected server error.', true),
        'Unexpected server error.',
    )
    assert.equal(
        publicErrorMessage(error, 'Unexpected server error.', false),
        'sensitive filesystem detail',
    )
})

test('responses include security headers without advertising Express', async () => {
    await withServer(app, async (origin) => {
        const response = await fetch(`${origin}/health/live`, {
            headers: { Connection: 'close' },
        })
        await response.json()

        assert.equal(response.status, 200)
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
        assert(response.headers.get('content-security-policy'))
        assert.equal(response.headers.get('x-powered-by'), null)
        assert.equal(response.headers.get('strict-transport-security'), null)
    })
})

test('invalid route and JSON inputs are rejected before controllers', async () => {
    await withServer(app, async (origin) => {
        const validId = '00000000-0000-4000-8000-000000000000'
        const invalidId = await fetch(`${origin}/api/jobs/not-a-uuid`, {
            headers: { Connection: 'close' },
        })
        assert.equal(invalidId.status, 400)

        const validRoute = await fetch(`${origin}/api/jobs/${validId}`, {
            headers: { Connection: 'close' },
        })
        assert.equal(validRoute.status, 404)

        const invalidConfiguration = await fetch(`${origin}/api/batches/${validId}/configure`, {
            method: 'POST',
            headers: { Connection: 'close', 'Content-Type': 'application/json' },
            body: JSON.stringify({ strategy: 'merge', unexpected: true }),
        })
        assert.equal(invalidConfiguration.status, 400)

        const validConfiguration = await fetch(`${origin}/api/batches/${validId}/configure`, {
            method: 'POST',
            headers: { Connection: 'close', 'Content-Type': 'application/json' },
            body: JSON.stringify({ strategy: 'merge', format: 'CSV' }),
        })
        assert.equal(validConfiguration.status, 404)

        const invalidJson = await fetch(`${origin}/api/batches/${validId}/configure`, {
            method: 'POST',
            headers: { Connection: 'close', 'Content-Type': 'application/json' },
            body: '{',
        })
        assert.equal(invalidJson.status, 400)
        assert.deepEqual(await invalidJson.json(), {
            error: 'Request body contains invalid JSON.',
        })

        const oversizedBody = await fetch(`${origin}/api/batches/${validId}/configure`, {
            method: 'POST',
            headers: { Connection: 'close', 'Content-Type': 'application/json' },
            body: JSON.stringify({ strategy: 'merge', format: 'CSV', padding: 'x'.repeat(33_000) }),
        })
        assert.equal(oversizedBody.status, 413)
        assert.deepEqual(await oversizedBody.json(), { error: 'Request body is too large.' })
    })
})

test('unsafe cross-origin browser requests are rejected', async () => {
    await withServer(app, async (origin) => {
        const target = `${origin}/api/batches/00000000-0000-4000-8000-000000000000/configure`
        const body = JSON.stringify({ strategy: 'merge', format: 'CSV' })
        const hostile = await fetch(target, {
            method: 'POST',
            headers: {
                Connection: 'close',
                'Content-Type': 'application/json',
                Origin: 'https://attacker.example',
                'Sec-Fetch-Site': 'cross-site',
            },
            body,
        })
        assert.equal(hostile.status, 403)
        assert.deepEqual(await hostile.json(), { error: 'Cross-origin request denied.' })

        const trusted = await fetch(target, {
            method: 'POST',
            headers: {
                Connection: 'close',
                'Content-Type': 'application/json',
                Origin: 'http://localhost:5173',
                'Sec-Fetch-Site': 'same-origin',
            },
            body,
        })
        assert.equal(trusted.status, 404)
    })
})

test('rate limiting returns a structured 429 response', async () => {
    const limitedApp = express()
    limitedApp.use(createRateLimiter(1, 'Test limit reached.', () => 'test-client'))
    limitedApp.get('/', (_request, response) => response.json({ ok: true }))

    await withServer(limitedApp, async (origin) => {
        const first = await fetch(origin, { headers: { Connection: 'close' } })
        const second = await fetch(origin, { headers: { Connection: 'close' } })

        assert.equal(first.status, 200)
        assert.equal(second.status, 429)
        assert.deepEqual(await second.json(), { error: 'Test limit reached.' })
        assert(second.headers.get('ratelimit'))
    })
})
