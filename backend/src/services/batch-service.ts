import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { config } from '../config.js'
import { conversionDispatcher, objectStorage, repositories } from '../dependencies.js'

import type {
    BatchConfiguration,
    BatchFault,
    BatchJob,
    DatasetProfile,
    OutputFormat,
    SchemaGroup,
} from '../types.js'

import { errorDetails, log } from '../utils/logger.js'
import { ClientError } from '../utils/client-error.js'
import { publicErrorMessage } from '../utils/public-error.js'
import { createArchive, datasetContent, safeName } from './conversion-service.js'

import { readDatasets, type Dataset } from './dataset-service.js'

const aggregateSizeLimit = 200 * 1024 * 1024

function normalizeHeader(value: unknown) {
    return String(value ?? '')
        .trim()
        .toLocaleLowerCase()
}

function schemaKey(headers: string[]) {
    return [...headers].sort().join('\u001f')
}

function fault(
    sourceFileName: string,
    code: BatchFault['code'],
    message: string,
    sheetName?: string,
): BatchFault {
    return sheetName
        ? { sourceFileName, sheetName, code, message }
        : { sourceFileName, code, message }
}

export async function createBatch(
    files: Express.Multer.File[],
    ownerId: string,
    requestId: string,
) {
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)

    if (files.length === 0) throw new ClientError('Select at least one file.', 400)

    if (totalSize > aggregateSizeLimit) {
        throw new ClientError('Batch size must be 200 MB or less.', 400)
    }

    const now = Date.now()
    const id = randomUUID()
    const sources: BatchJob['sources'] = []

    try {
        for (const file of files) {
            const extension = path.extname(file.originalname).toLowerCase()
            const sourceKey = `batch-sources/${id}-${randomUUID()}${extension}`
            await objectStorage.putObject(sourceKey, createReadStream(file.path))
            sources.push({
                fileName: path.basename(file.originalname),
                fileSize: file.size,
                sourceKey,
            })
        }
    } catch (error) {
        await Promise.all(sources.map((source) => objectStorage.deleteObject(source.sourceKey)))
        throw error
    } finally {
        await Promise.all(files.map((file) => rm(file.path, { force: true })))
    }

    const batch: BatchJob = {
        id,
        ownerId,
        requestId,
        queuedAt: new Date(now).toISOString(),
        fileName: files.length === 1 ? files[0]!.originalname : `${files.length} files`,
        fileSize: totalSize,
        fileCount: files.length,
        status: 'analyzing',
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + config.retentionMilliseconds).toISOString(),
        sources,
        datasets: [],
        schemaGroups: [],
        faults: [],
        configuration: null,
        resultKey: null,
        resultFileName: null,
    }

    try {
        await repositories.batches.save(batch)
    } catch (error) {
        await Promise.all(sources.map((source) => objectStorage.deleteObject(source.sourceKey)))
        throw error
    }

    log('info', 'batch.analysis_queued', {
        requestId,
        batchId: batch.id,
        fileCount: batch.fileCount,
        inputBytes: batch.fileSize,
    })

    await conversionDispatcher.dispatch({ type: 'batch.analyze', batchId: batch.id })

    return batch
}

export async function analyzeBatch(id: string) {
    const batch = await repositories.batches.get(id)
    if (!batch) return
    const analysisStartedAt = Date.now()
    const queuedAt = batch.queuedAt ? new Date(batch.queuedAt).getTime() : undefined
    const queueWaitMs =
        queuedAt === undefined ? undefined : Math.max(0, analysisStartedAt - queuedAt)

    log('info', 'batch.analysis_started', {
        requestId: batch.requestId,
        batchId: id,
        fileCount: batch.fileCount,
        inputBytes: batch.fileSize,
        queueWaitMs,
    })

    const profiles: DatasetProfile[] = []
    const faults: BatchFault[] = []
    const groupMap = new Map<string, SchemaGroup>()

    for (const [sourceIndex, source] of batch.sources.entries()) {
        const extension = path.extname(source.fileName).toLowerCase()

        if (extension !== '.csv' && extension !== '.xlsx') {
            faults.push(
                fault(
                    source.fileName,
                    'unsupported_file',
                    'Only .xlsx and .csv files are supported.',
                ),
            )

            continue
        }

        try {
            const datasets = await readDatasets(source.sourceKey, source.fileName)

            if (datasets.length === 0) {
                faults.push(
                    fault(source.fileName, 'empty_dataset', 'The workbook contains no worksheets.'),
                )
            }

            datasets.forEach((dataset, datasetIndex) => {
                const [header = [], ...rows] = dataset.rows
                const headers = header.map((value) => String(value ?? '').trim())
                const normalizedHeaders = headers.map(normalizeHeader)
                const datasetId = `${sourceIndex}:${datasetIndex}`

                if (dataset.rows.length === 0 || headers.length === 0) {
                    faults.push(
                        fault(
                            source.fileName,
                            'empty_dataset',
                            'The dataset has no header row.',
                            dataset.sheetName,
                        ),
                    )

                    return
                }

                if (normalizedHeaders.some((headerName) => !headerName)) {
                    faults.push(
                        fault(
                            source.fileName,
                            'blank_header',
                            'Every column must have a header.',
                            dataset.sheetName,
                        ),
                    )
                }

                const duplicates = normalizedHeaders.filter(
                    (headerName, index) =>
                        headerName && normalizedHeaders.indexOf(headerName) !== index,
                )

                if (duplicates.length > 0) {
                    faults.push(
                        fault(
                            source.fileName,
                            'duplicate_header',
                            `Duplicate headers: ${[...new Set(duplicates)].join(', ')}.`,
                            dataset.sheetName,
                        ),
                    )
                }

                const key = schemaKey(normalizedHeaders)

                const group = groupMap.get(key) ?? {
                    id: `schema-${groupMap.size + 1}`,
                    headers,
                    datasetIds: [],
                }

                group.datasetIds.push(datasetId)
                groupMap.set(key, group)

                profiles.push({
                    id: datasetId,
                    sourceFileName: source.fileName,
                    sheetName: dataset.sheetName,
                    headers,
                    normalizedHeaders,
                    rowCount: rows.length,
                    schemaGroupId: group.id,
                })
            })
        } catch (error) {
            faults.push(
                fault(
                    source.fileName,
                    'parse_error',
                    publicErrorMessage(error, 'The file could not be read.', config.production),
                ),
            )
        }
    }

    const current = await repositories.batches.get(id)
    if (!current) return
    const canResume = faults.length === 0 && current.configuration !== null
    await repositories.batches.save({
        ...current,
        status: faults.length > 0 ? 'failed' : canResume ? 'queued' : 'awaiting_configuration',
        ...(canResume ? { queuedAt: new Date().toISOString() } : {}),
        datasets: profiles,
        schemaGroups: [...groupMap.values()],
        faults,
    })
    log(
        faults.length > 0 ? 'error' : 'info',
        faults.length > 0 ? 'batch.analysis_failed' : 'batch.analysis_completed',
        {
            requestId: batch.requestId,
            batchId: id,
            fileCount: batch.fileCount,
            inputBytes: batch.fileSize,
            queueWaitMs,
            analysisDurationMs: Date.now() - analysisStartedAt,
            datasets: profiles.length,
            schemaGroups: groupMap.size,
            faults: faults.length,
            successCount: faults.length > 0 ? 0 : 1,
            failureCount: faults.length > 0 ? 1 : 0,
        },
    )
    if (canResume) {
        await conversionDispatcher.dispatch({ type: 'batch.convert', batchId: id })
    }
}

export async function configureBatch(
    batch: BatchJob,
    configuration: BatchConfiguration,
    requestId: string,
) {
    if (batch.status !== 'awaiting_configuration')
        throw new ClientError('Batch analysis is not ready for configuration.', 409)
    if (configuration.strategy === 'sqlite') {
        if (
            configuration.sqliteLayout !== 'per_source' &&
            configuration.sqliteLayout !== 'grouped'
        ) {
            throw new ClientError('Choose a SQLite table layout.', 409)
        }
    }
    if (
        !configuration.format ||
        !(['CSV', 'TSV', 'JSON'] as OutputFormat[]).includes(configuration.format)
    ) {
        if (configuration.strategy !== 'sqlite')
            throw new ClientError('Output format must be CSV, TSV, or JSON.', 409)
    }
    const configured = await repositories.batches.save({
        ...batch,
        requestId,
        queuedAt: new Date().toISOString(),
        configuration,
        status: 'queued',
        faults: [],
    })
    log('info', 'batch.queued', {
        requestId,
        batchId: batch.id,
        strategy: configuration.strategy,
        outputFormat: configuration.strategy === 'sqlite' ? 'SQLITE' : configuration.format,
        fileCount: batch.fileCount,
        inputBytes: batch.fileSize,
    })
    await conversionDispatcher.dispatch({ type: 'batch.convert', batchId: batch.id })
    return configured
}

async function loadBatchDatasets(batch: BatchJob) {
    const datasets: Dataset[] = []
    for (const source of batch.sources)
        datasets.push(...(await readDatasets(source.sourceKey, source.fileName)))
    return datasets
}

function archiveName(dataset: Dataset, format: OutputFormat, index: number) {
    const sourceName = safeName(path.parse(dataset.sourceFileName).name)
    const sheetName = safeName(dataset.sheetName)
    return `${sourceName}/${String(index + 1).padStart(2, '0')}-${sheetName}.${format.toLowerCase()}`
}

function alignDataset(dataset: Dataset, targetHeaders: string[]) {
    const [header = [], ...rows] = dataset.rows
    const indexes = targetHeaders.map((target) =>
        header.findIndex((value) => normalizeHeader(value) === target),
    )
    return rows.map((row) => indexes.map((index) => row[index] ?? ''))
}

function sqliteName(value: string, fallback: string) {
    const normalized = value
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
    const safe = normalized || fallback
    return /^\d/.test(safe) ? `_${safe}` : safe
}

function uniqueNames(values: string[], fallback: string) {
    const used = new Map<string, number>()
    return values.map((value, index) => {
        const base = sqliteName(value, `${fallback}_${index + 1}`)
        const count = (used.get(base) ?? 0) + 1
        used.set(base, count)
        return count === 1 ? base : `${base}_${count}`
    })
}

function sqliteType(values: unknown[]) {
    const populated = values.filter(
        (value) => value !== '' && value !== null && value !== undefined,
    )
    if (populated.length === 0) return 'TEXT'
    if (populated.every((value) => /^[-+]?\d+$/.test(String(value)))) return 'INTEGER'
    if (populated.every((value) => Number.isFinite(Number(value)))) return 'REAL'
    return 'TEXT'
}

function sqliteValue(value: unknown, type: string) {
    if (value === '' || value === null || value === undefined) return null
    if (type === 'INTEGER') return Number.parseInt(String(value), 10)
    if (type === 'REAL') return Number(value)
    return String(value)
}

function quoteIdentifier(value: string) {
    return `"${value.replaceAll('"', '""')}"`
}

function insertDatasetTable(
    database: Database.Database,
    tableName: string,
    headers: string[],
    rows: unknown[][],
    provenance?: { sourceFile: string; sourceSheet: string }[],
) {
    const columnNames = uniqueNames(headers, 'column')
    const columnTypes = columnNames.map((_column, index) =>
        sqliteType(rows.map((row) => row[index])),
    )
    const provenanceColumns = provenance ? ['_source_file', '_source_sheet'] : []
    const definitions = [
        ...columnNames.map((column, index) => `${quoteIdentifier(column)} ${columnTypes[index]}`),
        ...provenanceColumns.map((column) => `${quoteIdentifier(column)} TEXT`),
    ]
    database.exec(`CREATE TABLE ${quoteIdentifier(tableName)} (${definitions.join(', ')})`)
    const allColumns = [...columnNames, ...provenanceColumns]
    const statement = database.prepare(
        `INSERT INTO ${quoteIdentifier(tableName)} (${allColumns.map(quoteIdentifier).join(', ')}) VALUES (${allColumns.map(() => '?').join(', ')})`,
    )
    rows.forEach((row, index) => {
        const values = columnTypes.map((type, columnIndex) => sqliteValue(row[columnIndex], type!))
        const source = provenance?.[index]
        statement.run(...values, ...(source ? [source.sourceFile, source.sourceSheet] : []))
    })
}

async function createSqliteResult(batch: BatchJob, datasets: Dataset[]) {
    const resultFileName = `dataforge-${batch.id.slice(0, 8)}.sqlite`
    const resultKey = `batch-results/${batch.id}-${resultFileName}`
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'dataforge-sqlite-'))
    const temporaryPath = path.join(temporaryDirectory, resultFileName)
    const database = new Database(temporaryPath)

    try {
        database.pragma('journal_mode = DELETE')
        database.exec(
            'CREATE TABLE _dataforge_sources (table_name TEXT, source_file TEXT, source_sheet TEXT, row_count INTEGER)',
        )
        const metadata = database.prepare('INSERT INTO _dataforge_sources VALUES (?, ?, ?, ?)')

        database.transaction(() => {
            if (batch.configuration?.sqliteLayout === 'per_source') {
                const tableNames = uniqueNames(
                    datasets.map(
                        (dataset) =>
                            `${path.parse(dataset.sourceFileName).name}_${dataset.sheetName}`,
                    ),
                    'dataset',
                )
                datasets.forEach((dataset, index) => {
                    const [header = [], ...rows] = dataset.rows
                    const tableName = tableNames[index]!
                    insertDatasetTable(database, tableName, header.map(String), rows)
                    metadata.run(tableName, dataset.sourceFileName, dataset.sheetName, rows.length)
                })
                return
            }

            const grouped = new Map<string, Dataset[]>()
            datasets.forEach((dataset) => {
                const headers = (dataset.rows[0] ?? []).map(normalizeHeader)
                const key = schemaKey(headers)
                grouped.set(key, [...(grouped.get(key) ?? []), dataset])
            })
            const tableNames = uniqueNames(
                [...grouped.keys()].map((_key, index) => `schema_${index + 1}`),
                'schema',
            )
            ;[...grouped.values()].forEach((group, groupIndex) => {
                const displayHeaders = (group[0]!.rows[0] ?? []).map((value) =>
                    String(value ?? '').trim(),
                )
                const normalizedHeaders = displayHeaders.map(normalizeHeader)
                const rows: unknown[][] = []
                const provenance: { sourceFile: string; sourceSheet: string }[] = []
                group.forEach((dataset) => {
                    const alignedRows = alignDataset(dataset, normalizedHeaders)
                    rows.push(...alignedRows)
                    provenance.push(
                        ...alignedRows.map(() => ({
                            sourceFile: dataset.sourceFileName,
                            sourceSheet: dataset.sheetName,
                        })),
                    )
                    metadata.run(
                        tableNames[groupIndex],
                        dataset.sourceFileName,
                        dataset.sheetName,
                        alignedRows.length,
                    )
                })
                insertDatasetTable(
                    database,
                    tableNames[groupIndex]!,
                    displayHeaders,
                    rows,
                    provenance,
                )
            })
        })()
    } catch (error) {
        database.close()
        throw error
    } finally {
        if (database.open) database.close()
    }

    try {
        await objectStorage.putObject(resultKey, createReadStream(temporaryPath))
    } finally {
        await rm(temporaryDirectory, { recursive: true, force: true })
    }
    return { resultKey, resultFileName }
}

async function createBatchResult(batch: BatchJob, datasets: Dataset[]) {
    const configuration = batch.configuration!
    if (configuration.strategy === 'sqlite') return createSqliteResult(batch, datasets)

    const format = configuration.format!
    const extension = format.toLowerCase()

    if (configuration.strategy === 'separate') {
        const resultFileName = `dataforge-${batch.id.slice(0, 8)}.zip`
        const resultKey = `batch-results/${batch.id}-${resultFileName}`
        await objectStorage.putObject(
            resultKey,
            createArchive(
                datasets.map((dataset, index) => ({
                    name: archiveName(dataset, format, index),
                    content: datasetContent(dataset, format),
                })),
            ),
        )
        return { resultKey, resultFileName }
    }

    const grouped = new Map<string, Dataset[]>()
    datasets.forEach((dataset) => {
        const headers = (dataset.rows[0] ?? []).map(normalizeHeader)
        const key = schemaKey(headers)
        grouped.set(key, [...(grouped.get(key) ?? []), dataset])
    })
    const files = [...grouped.values()].map((group, index) => {
        const displayHeaders = (group[0]!.rows[0] ?? []).map((value) => String(value ?? '').trim())
        const normalizedHeaders = displayHeaders.map(normalizeHeader)
        const rows = group.flatMap((dataset) => alignDataset(dataset, normalizedHeaders))
        return {
            name: `schema-${index + 1}.${extension}`,
            content: datasetContent(
                { sourceFileName: '', sheetName: '', rows: [displayHeaders, ...rows] },
                format,
            ),
        }
    })

    if (files.length === 1) {
        const resultFileName = `dataforge-merged.${extension}`
        const resultKey = `batch-results/${batch.id}-${resultFileName}`
        await objectStorage.putObject(resultKey, files[0]!.content)
        return { resultKey, resultFileName }
    }

    const resultFileName = `dataforge-grouped-${batch.id.slice(0, 8)}.zip`
    const resultKey = `batch-results/${batch.id}-${resultFileName}`
    await objectStorage.putObject(resultKey, createArchive(files))
    return { resultKey, resultFileName }
}

export async function processBatch(id: string) {
    const batch = await repositories.batches.get(id)
    if (!batch || batch.status !== 'queued' || !batch.configuration) return
    const processingStartedAt = Date.now()
    const queuedAt = batch.queuedAt ? new Date(batch.queuedAt).getTime() : undefined
    const queueWaitMs =
        queuedAt === undefined ? undefined : Math.max(0, processingStartedAt - queuedAt)
    const outputFormat =
        batch.configuration.strategy === 'sqlite' ? 'SQLITE' : batch.configuration.format
    await repositories.batches.save({
        ...batch,
        status: 'processing',
        faults: [],
        resultKey: null,
        resultFileName: null,
    })
    log('info', 'batch.processing', {
        requestId: batch.requestId,
        batchId: id,
        strategy: batch.configuration.strategy,
        outputFormat,
        fileCount: batch.fileCount,
        inputBytes: batch.fileSize,
        queueWaitMs,
    })

    try {
        const datasets = await loadBatchDatasets(batch)
        const result = await createBatchResult(batch, datasets)
        const outputBytes = await objectStorage.getObjectSize(result.resultKey)
        const current = await repositories.batches.get(id)
        if (!current) return
        await repositories.batches.save({ ...current, ...result, status: 'completed' })
        log('info', 'batch.completed', {
            requestId: batch.requestId,
            batchId: id,
            strategy: batch.configuration.strategy,
            outputFormat,
            fileCount: batch.fileCount,
            datasetCount: datasets.length,
            inputBytes: batch.fileSize,
            outputBytes,
            queueWaitMs,
            processingDurationMs: Date.now() - processingStartedAt,
            successCount: 1,
            failureCount: 0,
        })
        void Promise.all(
            batch.sources.map((source) => objectStorage.deleteObject(source.sourceKey)),
        ).catch((error) => {
            log('error', 'batch.source_cleanup_failed', {
                requestId: batch.requestId,
                batchId: id,
                ...errorDetails(error),
            })
        })
    } catch (error) {
        const current = await repositories.batches.get(id)
        if (!current) return
        if (current.resultKey) await objectStorage.deleteObject(current.resultKey)
        const message = publicErrorMessage(error, 'Batch conversion failed.', config.production)
        await repositories.batches.save({
            ...current,
            status: 'failed',
            resultKey: null,
            resultFileName: null,
            faults: [fault('Batch', 'conversion_error', message)],
        })
        log('error', 'batch.failed', {
            requestId: batch.requestId,
            batchId: id,
            strategy: batch.configuration.strategy,
            outputFormat,
            fileCount: batch.fileCount,
            inputBytes: batch.fileSize,
            queueWaitMs,
            processingDurationMs: Date.now() - processingStartedAt,
            successCount: 0,
            failureCount: 1,
            ...errorDetails(error),
        })
    }
}

export async function retryBatch(batch: BatchJob, requestId: string) {
    const retried = await repositories.batches.save({
        ...batch,
        requestId,
        queuedAt: new Date().toISOString(),
        status: 'analyzing',
        datasets: [],
        schemaGroups: [],
        faults: [],
        resultKey: null,
        resultFileName: null,
    })
    log('info', 'batch.analysis_queued', {
        requestId,
        batchId: batch.id,
        fileCount: batch.fileCount,
        inputBytes: batch.fileSize,
        retry: true,
    })
    await conversionDispatcher.dispatch({ type: 'batch.analyze', batchId: batch.id })
    return retried
}

export async function cleanupExpiredBatches() {
    const expired = (await repositories.batches.list()).filter(
        (batch) => new Date(batch.expiresAt).getTime() <= Date.now(),
    )
    for (const batch of expired) {
        await Promise.all([
            ...batch.sources.map((source) => objectStorage.deleteObject(source.sourceKey)),
            batch.resultKey ? objectStorage.deleteObject(batch.resultKey) : Promise.resolve(),
        ])
        await repositories.batches.remove(batch.id)
        log('info', 'batch.expired', { batchId: batch.id })
    }
}

export async function initializeBatches() {
    await repositories.batches.initialize()
    await cleanupExpiredBatches()
    for (const batch of await repositories.batches.list()) {
        if (batch.status === 'analyzing') {
            await conversionDispatcher.dispatch({ type: 'batch.analyze', batchId: batch.id })
        }
        if (batch.status === 'queued' || batch.status === 'processing') {
            await repositories.batches.save({ ...batch, status: 'queued' })
            await conversionDispatcher.dispatch({ type: 'batch.convert', batchId: batch.id })
        }
    }
    setInterval(() => void cleanupExpiredBatches(), 60 * 60 * 1000).unref()
}
