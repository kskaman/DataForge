import { config } from './config'

export type OutputFormat = 'CSV' | 'TSV' | 'JSON'
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type BatchStatus =
    'analyzing' | 'awaiting_configuration' | 'queued' | 'processing' | 'completed' | 'failed'
export type BatchStrategy = 'separate' | 'merge' | 'sqlite'

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
    resultFileName?: string
}

export type BatchFault = {
    sourceFileName: string
    sheetName?: string
    code: string
    message: string
}

export type BatchJob = {
    id: string
    fileName: string
    fileSize: number
    fileCount: number
    status: BatchStatus
    createdAt: string
    expiresAt: string
    sources: Array<{ fileName: string; fileSize: number }>
    datasets: Array<{
        id: string
        sourceFileName: string
        sheetName: string
        headers: string[]
        rowCount: number
        schemaGroupId: string
    }>
    schemaGroups: Array<{ id: string; headers: string[]; datasetIds: string[] }>
    faults: BatchFault[]
    configuration: {
        strategy: BatchStrategy
        format?: OutputFormat
        sqliteLayout?: 'per_source' | 'grouped'
    } | null
    resultFileName?: string
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
        ...options,
        credentials: 'include',
    })
    const body = (await response.json()) as T & { error?: string }
    if (!response.ok) throw new Error(body.error ?? 'The request could not be completed.')
    return body
}

export async function createJob(file: File, format: OutputFormat, splitSheets: boolean) {
    const body = new FormData()
    body.append('file', file)
    body.append('format', format)
    body.append('splitSheets', String(splitSheets))
    return (await request<{ job: ConversionJob }>('/api/jobs', { method: 'POST', body })).job
}

export async function getActivity() {
    return await request<{ jobs: ConversionJob[]; batches: BatchJob[] }>('/api/activity')
}

export async function createBatch(files: File[]) {
    const body = new FormData()
    files.forEach((file) => body.append('files', file))
    return (await request<{ batch: BatchJob }>('/api/batches', { method: 'POST', body })).batch
}

export async function configureBatch(
    id: string,
    configuration: {
        strategy: BatchStrategy
        format?: OutputFormat
        sqliteLayout?: 'per_source' | 'grouped'
    },
) {
    return (
        await request<{ batch: BatchJob }>(`/api/batches/${id}/configure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configuration),
        })
    ).batch
}

export async function retryBatch(id: string) {
    return (await request<{ batch: BatchJob }>(`/api/batches/${id}/retry`, { method: 'POST' }))
        .batch
}

export async function getBatchDownloadUrl(id: string) {
    const result = await request<{ url: string }>(`/api/batches/${id}/download`)
    return `${config.apiBaseUrl}${result.url}`
}

export async function retryConversion(id: string) {
    return (await request<{ job: ConversionJob }>(`/api/jobs/${id}/retry`, { method: 'POST' })).job
}

export async function getDownloadUrl(id: string) {
    const result = await request<{ url: string }>(`/api/jobs/${id}/download`)
    return `${config.apiBaseUrl}${result.url}`
}
