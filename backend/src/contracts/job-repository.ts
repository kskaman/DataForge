import type { ConversionJob } from '../types.js'

export interface JobRepository {
    initialize(): Promise<void>
    list(): Promise<ConversionJob[]>
    get(id: string): Promise<ConversionJob | undefined>
    listForOwner(ownerId: string): Promise<ConversionJob[]>
    getForOwner(id: string, ownerId: string): Promise<ConversionJob | undefined>
    save(job: ConversionJob): Promise<ConversionJob>
    remove(id: string): Promise<void>
}
