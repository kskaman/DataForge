export const outputFormats = ['CSV', 'TSV', 'JSON'] as const

export type OutputFormat = (typeof outputFormats)[number]
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export type ConversionJob = {
  id: string
  fileName: string
  fileSize: number
  format: OutputFormat
  splitSheets: boolean
  status: JobStatus
  createdAt: string
  expiresAt: string
  error: string | null
  sourcePath: string
  resultPath: string | null
  resultFileName: string | null
}

export type PublicJob = Omit<ConversionJob, 'sourcePath' | 'resultPath' | 'resultFileName'> & {
  resultFileName?: string
}

export type BatchStatus = 'analyzing' | 'awaiting_configuration' | 'queued' | 'processing' | 'completed' | 'failed'
export type BatchStrategy = 'separate' | 'merge' | 'sqlite'
export type SqliteLayout = 'per_source' | 'grouped'

export type BatchSource = {
  fileName: string
  fileSize: number
  sourcePath: string
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
  code: 'unsupported_file' | 'parse_error' | 'empty_dataset' | 'blank_header' | 'duplicate_header' | 'invalid_configuration' | 'conversion_error'
  message: string
}

export type BatchConfiguration = {
  strategy: BatchStrategy
  format?: OutputFormat
  sqliteLayout?: SqliteLayout
}

export type BatchJob = {
  id: string
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
  resultPath: string | null
  resultFileName: string | null
}

export type PublicBatchJob = Omit<BatchJob, 'sources' | 'resultPath' | 'resultFileName'> & {
  sources: Array<Omit<BatchSource, 'sourcePath'>>
  resultFileName?: string
}

export function toPublicJob(job: ConversionJob): PublicJob {
  const { sourcePath: _sourcePath, resultPath: _resultPath, resultFileName, ...publicJob } = job
  return resultFileName ? { ...publicJob, resultFileName } : publicJob
}

export function toPublicBatchJob(batch: BatchJob): PublicBatchJob {
  const { resultPath: _resultPath, resultFileName, sources, ...publicBatch } = batch
  const publicSources = sources.map(({ sourcePath: _sourcePath, ...source }) => source)
  return resultFileName ? { ...publicBatch, sources: publicSources, resultFileName } : { ...publicBatch, sources: publicSources }
}