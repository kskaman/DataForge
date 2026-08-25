import type { Request, Response } from 'express'
import { listBatchesForOwner } from '../repositories/batch-store.js'
import { listJobsForOwner } from '../repositories/job-store.js'
import { toPublicBatchJob, toPublicJob } from '../types.js'

export function getActivityHandler(request: Request, response: Response) {
    return response.json({
        jobs: listJobsForOwner(request.guestOwnerId).map(toPublicJob),
        batches: listBatchesForOwner(request.guestOwnerId).map(toPublicBatchJob),
    })
}
