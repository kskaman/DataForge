import type { Request, Response } from 'express'
import { repositories } from '../dependencies.js'
import { toPublicBatchJob, toPublicJob } from '../types.js'

export async function getActivityHandler(request: Request, response: Response) {
    const [jobs, batches] = await Promise.all([
        repositories.jobs.listForOwner(request.guestOwnerId),
        repositories.batches.listForOwner(request.guestOwnerId),
    ])

    return response.json({
        jobs: jobs.map(toPublicJob),
        batches: batches.map(toPublicBatchJob),
    })
}
