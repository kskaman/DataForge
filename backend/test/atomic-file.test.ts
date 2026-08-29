import assert from 'node:assert/strict'
import test from 'node:test'
import { replaceFile } from '../src/adapters/local/atomic-file.js'

test('local atomic replacement retries temporary Windows file errors', async () => {
    let attempts = 0
    const delays: number[] = []

    await replaceFile(
        'source.tmp',
        'destination.json',
        async () => {
            attempts += 1
            if (attempts < 3) throw Object.assign(new Error('busy'), { code: 'EPERM' })
        },
        async (milliseconds) => {
            delays.push(milliseconds)
        },
    )

    assert.equal(attempts, 3)
    assert.deepEqual(delays, [10, 20])
})

test('local atomic replacement does not retry permanent errors', async () => {
    let attempts = 0

    await assert.rejects(
        replaceFile(
            'source.tmp',
            'destination.json',
            async () => {
                attempts += 1
                throw Object.assign(new Error('invalid'), { code: 'EINVAL' })
            },
            async () => undefined,
        ),
        /invalid/,
    )

    assert.equal(attempts, 1)
})
