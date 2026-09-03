export const outputFormats = ['CSV', 'TSV', 'JSON'] as const

export type OutputFormat = (typeof outputFormats)[number]
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export type ConversionJob = {
    id: string
    ownerId: string
    requestId?: string
    queuedAt?: string
    fileName: string
    fileSize: number
    format: OutputFormat
    splitSheets: boolean
    status: JobStatus
    createdAt: string
    expiresAt: string
    error: string | null
    sourceKey: string
    resultKey: string | null
    resultFileName: string | null
}

export type PublicJob = Omit<
    ConversionJob,
    'ownerId' | 'requestId' | 'queuedAt' | 'sourceKey' | 'resultKey' | 'resultFileName'
> & {
    resultFileName?: string
}

export type BatchStatus =
    'analyzing' | 'awaiting_configuration' | 'queued' | 'processing' | 'completed' | 'failed'
export type BatchStrategy = 'separate' | 'merge' | 'sqlite'
export type SqliteLayout = 'per_source' | 'grouped'

export type BatchSource = {
    fileName: string
    fileSize: number
    sourceKey: string
}

export type DatasetProfile = {
    id: string
    sourceFileName: string
    sheetName: string
    headers: string[]
    normalizedHeaders: string[]
    rowCount: number
    schemaGroupId: string
}

export type SchemaGroup = {
    id: string
    headers: string[]
    datasetIds: string[]
}

export type BatchFault = {
    sourceFileName: string
    sheetName?: string
    code:
        | 'unsupported_file'
        | 'parse_error'
        | 'empty_dataset'
        | 'blank_header'
        | 'duplicate_header'
        | 'invalid_configuration'
        | 'conversion_error'
    message: string
}

export type BatchConfiguration = {
    strategy: BatchStrategy
    format?: OutputFormat
    sqliteLayout?: SqliteLayout
}

export type BatchJob = {
    id: string
    ownerId: string
    requestId?: string
    queuedAt?: string
    fileName: string
    fileSize: number
    fileCount: number
    status: BatchStatus
    createdAt: string
    expiresAt: string
    sources: BatchSource[]
    datasets: DatasetProfile[]
    schemaGroups: SchemaGroup[]
    faults: BatchFault[]
    configuration: BatchConfiguration | null
    resultKey: string | null
    resultFileName: string | null
}

export type PublicBatchJob = Omit<
    BatchJob,
    'ownerId' | 'requestId' | 'queuedAt' | 'sources' | 'resultKey' | 'resultFileName'
> & {
    sources: Array<Omit<BatchSource, 'sourceKey'>>
    resultFileName?: string
}

export function toPublicJob(job: ConversionJob): PublicJob {
    const {
        ownerId: _ownerId,
        requestId: _requestId,
        queuedAt: _queuedAt,
        sourceKey: _sourceKey,
        resultKey: _resultKey,
        resultFileName,
        ...publicJob
    } = job

    return resultFileName ? { ...publicJob, resultFileName } : publicJob
}

export function toPublicBatchJob(batch: BatchJob): PublicBatchJob {
    const {
        ownerId: _ownerId,
        requestId: _requestId,
        queuedAt: _queuedAt,
        resultKey: _resultKey,
        resultFileName,
        sources,
        ...publicBatch
    } = batch

    const publicSources = sources.map(({ sourceKey: _sourceKey, ...source }) => source)

    return resultFileName
        ? {
              ...publicBatch,
              sources: publicSources,
              resultFileName,
          }
        : {
              ...publicBatch,
              sources: publicSources,
          }
}
