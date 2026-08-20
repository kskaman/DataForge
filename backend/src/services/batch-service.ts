import { randomUUID } from 'node:crypto'
import { rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import Database from 'better-sqlite3'
import { config } from '../config.js'
import {
  batchResultDirectory,
  getBatch,
  initializeBatchStore,
  listBatches,
  removeBatch,
  saveBatch,
} from '../storage/batch-store.js'
import type {
  BatchConfiguration,
  BatchFault,
  BatchJob,
  DatasetProfile,
  OutputFormat,
  SchemaGroup,
} from '../types.js'
import { log } from '../utils/logger.js'
import { createArchive, datasetContent, safeName } from './conversion-service.js'
import { readDatasets, type Dataset } from './dataset-service.js'

const aggregateSizeLimit = 200 * 1024 * 1024

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

function schemaKey(headers: string[]) {
  return [...headers].sort().join('\u001f')
}

function fault(sourceFileName: string, code: BatchFault['code'], message: string, sheetName?: string): BatchFault {
  return sheetName ? { sourceFileName, sheetName, code, message } : { sourceFileName, code, message }
}

export async function createBatch(files: Express.Multer.File[], ownerId: string) {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  if (files.length === 0) throw new Error('Select at least one file.')
  if (totalSize > aggregateSizeLimit) throw new Error('Batch size must be 200 MB or less.')

  const now = Date.now()
  const batch: BatchJob = {
    id: randomUUID(),
    ownerId,
    fileName: files.length === 1 ? files[0]!.originalname : `${files.length} files`,
    fileSize: totalSize,
    fileCount: files.length,
    status: 'analyzing',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + config.retentionMilliseconds).toISOString(),
    sources: files.map((file) => ({ fileName: path.basename(file.originalname), fileSize: file.size, sourcePath: file.path })),
    datasets: [],
    schemaGroups: [],
    faults: [],
    configuration: null,
    resultPath: null,
    resultFileName: null,
  }
  await saveBatch(batch)
  queueAnalysis(batch.id)
  return batch
}

export function queueAnalysis(id: string) {
  setImmediate(() => void analyzeBatch(id))
}

export async function analyzeBatch(id: string) {
  const batch = getBatch(id)
  if (!batch) return

  const profiles: DatasetProfile[] = []
  const faults: BatchFault[] = []
  const groupMap = new Map<string, SchemaGroup>()

  for (const [sourceIndex, source] of batch.sources.entries()) {
    const extension = path.extname(source.fileName).toLowerCase()
    if (extension !== '.csv' && extension !== '.xlsx') {
      faults.push(fault(source.fileName, 'unsupported_file', 'Only .xlsx and .csv files are supported.'))
      continue
    }

    try {
      const datasets = await readDatasets(source.sourcePath, source.fileName)
      if (datasets.length === 0) faults.push(fault(source.fileName, 'empty_dataset', 'The workbook contains no worksheets.'))

      datasets.forEach((dataset, datasetIndex) => {
        const [header = [], ...rows] = dataset.rows
        const headers = header.map((value) => String(value ?? '').trim())
        const normalizedHeaders = headers.map(normalizeHeader)
        const datasetId = `${sourceIndex}:${datasetIndex}`

        if (dataset.rows.length === 0 || headers.length === 0) {
          faults.push(fault(source.fileName, 'empty_dataset', 'The dataset has no header row.', dataset.sheetName))
          return
        }
        if (normalizedHeaders.some((headerName) => !headerName)) {
          faults.push(fault(source.fileName, 'blank_header', 'Every column must have a header.', dataset.sheetName))
        }
        const duplicates = normalizedHeaders.filter((headerName, index) => headerName && normalizedHeaders.indexOf(headerName) !== index)
        if (duplicates.length > 0) {
          faults.push(fault(source.fileName, 'duplicate_header', `Duplicate headers: ${[...new Set(duplicates)].join(', ')}.`, dataset.sheetName))
        }

        const key = schemaKey(normalizedHeaders)
        const group = groupMap.get(key) ?? { id: `schema-${groupMap.size + 1}`, headers, datasetIds: [] }
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
      faults.push(fault(source.fileName, 'parse_error', error instanceof Error ? error.message : 'The file could not be read.'))
    }
  }

  const current = getBatch(id)
  if (!current) return
  const canResume = faults.length === 0 && current.configuration !== null
  await saveBatch({
    ...current,
    status: faults.length > 0 ? 'failed' : canResume ? 'queued' : 'awaiting_configuration',
    datasets: profiles,
    schemaGroups: [...groupMap.values()],
    faults,
  })
  log(faults.length > 0 ? 'error' : 'info', 'batch.analyzed', { batchId: id, datasets: profiles.length, faults: faults.length })
  if (canResume) queueBatch(id)
}

export async function configureBatch(batch: BatchJob, configuration: BatchConfiguration) {
  if (batch.status !== 'awaiting_configuration') throw new Error('Batch analysis is not ready for configuration.')
  if (configuration.strategy === 'sqlite') {
    if (configuration.sqliteLayout !== 'per_source' && configuration.sqliteLayout !== 'grouped') {
      throw new Error('Choose a SQLite table layout.')
    }
  }
  if (!configuration.format || !(['CSV', 'TSV', 'JSON'] as OutputFormat[]).includes(configuration.format)) {
    if (configuration.strategy !== 'sqlite') throw new Error('Output format must be CSV, TSV, or JSON.')
  }
  const configured = await saveBatch({ ...batch, configuration, status: 'queued', faults: [] })
  queueBatch(batch.id)
  return configured
}

export function queueBatch(id: string) {
  setImmediate(() => void processBatch(id))
}

async function loadBatchDatasets(batch: BatchJob) {
  const datasets: Dataset[] = []
  for (const source of batch.sources) datasets.push(...await readDatasets(source.sourcePath, source.fileName))
  return datasets
}

function archiveName(dataset: Dataset, format: OutputFormat, index: number) {
  const sourceName = safeName(path.parse(dataset.sourceFileName).name)
  const sheetName = safeName(dataset.sheetName)
  return `${sourceName}/${String(index + 1).padStart(2, '0')}-${sheetName}.${format.toLowerCase()}`
}

function alignDataset(dataset: Dataset, targetHeaders: string[]) {
  const [header = [], ...rows] = dataset.rows
  const indexes = targetHeaders.map((target) => header.findIndex((value) => normalizeHeader(value) === target))
  return rows.map((row) => indexes.map((index) => row[index] ?? ''))
}

function sqliteName(value: string, fallback: string) {
  const normalized = value.normalize('NFKD').replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()
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
  const populated = values.filter((value) => value !== '' && value !== null && value !== undefined)
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
  const columnTypes = columnNames.map((_column, index) => sqliteType(rows.map((row) => row[index])))
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
  const resultPath = path.join(batchResultDirectory, `${batch.id}-${resultFileName}`)
  const temporaryPath = `${resultPath}.tmp`
  await rm(temporaryPath, { force: true })
  await rm(resultPath, { force: true })
  const database = new Database(temporaryPath)

  try {
    database.pragma('journal_mode = DELETE')
    database.exec('CREATE TABLE _dataforge_sources (table_name TEXT, source_file TEXT, source_sheet TEXT, row_count INTEGER)')
    const metadata = database.prepare('INSERT INTO _dataforge_sources VALUES (?, ?, ?, ?)')

    database.transaction(() => {
      if (batch.configuration?.sqliteLayout === 'per_source') {
        const tableNames = uniqueNames(datasets.map((dataset) => `${path.parse(dataset.sourceFileName).name}_${dataset.sheetName}`), 'dataset')
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
      const tableNames = uniqueNames([...grouped.keys()].map((_key, index) => `schema_${index + 1}`), 'schema')
      ;[...grouped.values()].forEach((group, groupIndex) => {
        const displayHeaders = (group[0]!.rows[0] ?? []).map((value) => String(value ?? '').trim())
        const normalizedHeaders = displayHeaders.map(normalizeHeader)
        const rows: unknown[][] = []
        const provenance: { sourceFile: string; sourceSheet: string }[] = []
        group.forEach((dataset) => {
          const alignedRows = alignDataset(dataset, normalizedHeaders)
          rows.push(...alignedRows)
          provenance.push(...alignedRows.map(() => ({ sourceFile: dataset.sourceFileName, sourceSheet: dataset.sheetName })))
          metadata.run(tableNames[groupIndex], dataset.sourceFileName, dataset.sheetName, alignedRows.length)
        })
        insertDatasetTable(database, tableNames[groupIndex]!, displayHeaders, rows, provenance)
      })
    })()
  } catch (error) {
    database.close()
    await rm(temporaryPath, { force: true })
    throw error
  } finally {
    if (database.open) database.close()
  }

  await rename(temporaryPath, resultPath)
  return { resultPath, resultFileName }
}

async function createBatchResult(batch: BatchJob, datasets: Dataset[]) {
  const configuration = batch.configuration!
  if (configuration.strategy === 'sqlite') return createSqliteResult(batch, datasets)

  const format = configuration.format!
  const extension = format.toLowerCase()

  if (configuration.strategy === 'separate') {
    const resultFileName = `dataforge-${batch.id.slice(0, 8)}.zip`
    const resultPath = path.join(batchResultDirectory, `${batch.id}-${resultFileName}`)
    const temporaryPath = `${resultPath}.tmp`
    await rm(temporaryPath, { force: true })
    await rm(resultPath, { force: true })
    try {
      await createArchive(temporaryPath, datasets.map((dataset, index) => ({
        name: archiveName(dataset, format, index),
        content: datasetContent(dataset, format),
      })))
      await rename(temporaryPath, resultPath)
    } catch (error) {
      await rm(temporaryPath, { force: true })
      throw error
    }
    return { resultPath, resultFileName }
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
      content: datasetContent({ sourceFileName: '', sheetName: '', rows: [displayHeaders, ...rows] }, format),
    }
  })

  if (files.length === 1) {
    const resultFileName = `dataforge-merged.${extension}`
    const resultPath = path.join(batchResultDirectory, `${batch.id}-${resultFileName}`)
    const temporaryPath = `${resultPath}.tmp`
    await rm(temporaryPath, { force: true })
    await writeFile(temporaryPath, files[0]!.content, 'utf8')
    await rename(temporaryPath, resultPath)
    return { resultPath, resultFileName }
  }

  const resultFileName = `dataforge-grouped-${batch.id.slice(0, 8)}.zip`
  const resultPath = path.join(batchResultDirectory, `${batch.id}-${resultFileName}`)
  const temporaryPath = `${resultPath}.tmp`
  await rm(temporaryPath, { force: true })
  await rm(resultPath, { force: true })
  try {
    await createArchive(temporaryPath, files)
    await rename(temporaryPath, resultPath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
  return { resultPath, resultFileName }
}

export async function processBatch(id: string) {
  const batch = getBatch(id)
  if (!batch || batch.status !== 'queued' || !batch.configuration) return
  await saveBatch({ ...batch, status: 'processing', faults: [], resultPath: null, resultFileName: null })

  try {
    const datasets = await loadBatchDatasets(batch)
    const result = await createBatchResult(batch, datasets)
    const current = getBatch(id)
    if (!current) return
    await saveBatch({ ...current, ...result, status: 'completed' })
    log('info', 'batch.completed', { batchId: id })
    void Promise.all(batch.sources.map((source) => rm(source.sourcePath, { force: true }))).catch((error) => {
      log('error', 'batch.source_cleanup_failed', { batchId: id, error: error instanceof Error ? error.message : String(error) })
    })
  } catch (error) {
    const current = getBatch(id)
    if (!current) return
    if (current.resultPath) await rm(current.resultPath, { force: true })
    const message = error instanceof Error ? error.message : 'Batch conversion failed.'
    await saveBatch({
      ...current,
      status: 'failed',
      resultPath: null,
      resultFileName: null,
      faults: [fault('Batch', 'conversion_error', message)],
    })
    log('error', 'batch.failed', { batchId: id, error: message })
  }
}

export async function retryBatch(batch: BatchJob) {
  const retried = await saveBatch({ ...batch, status: 'analyzing', datasets: [], schemaGroups: [], faults: [], resultPath: null, resultFileName: null })
  queueAnalysis(batch.id)
  return retried
}

export async function cleanupExpiredBatches() {
  const expired = listBatches().filter((batch) => new Date(batch.expiresAt).getTime() <= Date.now())
  for (const batch of expired) {
    await Promise.all([
      ...batch.sources.map((source) => rm(source.sourcePath, { force: true })),
      batch.resultPath ? rm(batch.resultPath, { force: true }) : Promise.resolve(),
    ])
    await removeBatch(batch.id)
    log('info', 'batch.expired', { batchId: batch.id })
  }
}

export async function initializeBatches() {
  await initializeBatchStore()
  await cleanupExpiredBatches()
  for (const batch of listBatches()) {
    if (batch.status === 'analyzing') queueAnalysis(batch.id)
    if (batch.status === 'queued' || batch.status === 'processing') {
      await saveBatch({ ...batch, status: 'queued' })
      queueBatch(batch.id)
    }
  }
  setInterval(() => void cleanupExpiredBatches(), 60 * 60 * 1000).unref()
}