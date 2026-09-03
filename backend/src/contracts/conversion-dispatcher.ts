export type ConversionCommand =
    | { type: 'job.convert'; jobId: string }
    | { type: 'batch.analyze'; batchId: string }
    | { type: 'batch.convert'; batchId: string }

export interface ConversionDispatcher {
    readonly provider: string
    initialize(): Promise<void>
    checkHealth(): Promise<void>
    dispatch(command: ConversionCommand): Promise<void>
}
