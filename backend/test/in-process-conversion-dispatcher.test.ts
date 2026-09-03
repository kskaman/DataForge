import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConversionCommand } from '../src/contracts/conversion-dispatcher.js'
import { InProcessConversionDispatcher } from '../src/adapters/local/in-process-conversion-dispatcher.js'

test('in-process dispatch defers identifier-only conversion commands', async () => {
    const scheduled: Array<() => void> = []
    const handled: ConversionCommand[] = []
    const dispatcher = new InProcessConversionDispatcher(
        async (command) => {
            handled.push(command)
        },
        (task) => scheduled.push(task),
    )

    await dispatcher.initialize()
    await dispatcher.checkHealth()
    await dispatcher.dispatch({ type: 'job.convert', jobId: 'job-id' })
    await dispatcher.dispatch({ type: 'batch.analyze', batchId: 'batch-id' })
    await dispatcher.dispatch({ type: 'batch.convert', batchId: 'batch-id' })

    assert.equal(dispatcher.provider, 'in-process')
    assert.deepEqual(handled, [])
    assert.equal(scheduled.length, 3)

    scheduled.forEach((task) => task())
    await Promise.resolve()

    assert.deepEqual(handled, [
        { type: 'job.convert', jobId: 'job-id' },
        { type: 'batch.analyze', batchId: 'batch-id' },
        { type: 'batch.convert', batchId: 'batch-id' },
    ])
})

test('in-process dispatch contains asynchronous handler failures', async () => {
    let scheduledTask: (() => void) | undefined
    const dispatcher = new InProcessConversionDispatcher(
        async () => {
            throw new Error('handler failed')
        },
        (task) => {
            scheduledTask = task
        },
    )

    await dispatcher.dispatch({ type: 'job.convert', jobId: 'job-id' })
    assert(scheduledTask)
    scheduledTask()
    await Promise.resolve()
})
