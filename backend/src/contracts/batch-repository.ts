import type { BatchJob } from '../types.js'

export interface BatchRepository {
    initialize(): Promise<void>
    list(): Promise<BatchJob[]>
    get(id: string): Promise<BatchJob | undefined>
    listForOwner(ownerId: string): Promise<BatchJob[]>
    getForOwner(id: string, ownerId: string): Promise<BatchJob | undefined>
    save(batch: BatchJob): Promise<BatchJob>
    remove(id: string): Promise<void>
}
