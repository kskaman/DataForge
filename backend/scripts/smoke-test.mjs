import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'

const apiBase = process.env.API_URL ?? 'http://localhost:4000'
const fixture = new URL('../test-fixtures/sample.csv', import.meta.url)

async function waitForBatch(batch, expectedStatuses) {
  for (let attempt = 0; attempt < 40 && !expectedStatuses.includes(batch.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    const response = await fetch(`${apiBase}/api/batches/${batch.id}`)
    batch = (await response.json()).batch
  }
  return batch
}

const form = new FormData()
form.append('file', new Blob([await readFile(fixture)], { type: 'text/csv' }), 'sample.csv')
form.append('format', 'JSON')
form.append('splitSheets', 'false')

let response = await fetch(`${apiBase}/api/jobs`, { method: 'POST', body: form })
let body = await response.json()
if (!response.ok) throw new Error(JSON.stringify(body))

let job = body.job
for (let attempt = 0; attempt < 20 && !['completed', 'failed'].includes(job.status); attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 150))
  response = await fetch(`${apiBase}/api/jobs/${job.id}`)
  job = (await response.json()).job
}

if (job.status !== 'completed') throw new Error(`Job ended as ${job.status}: ${job.error}`)

response = await fetch(`${apiBase}/api/jobs/${job.id}/download`)
const link = await response.json()
response = await fetch(`${apiBase}${link.url}`)
const result = await response.json()

if (result.length !== 2 || result[0].name !== 'Alpha' || result[1].amount !== '85') {
  throw new Error(`Unexpected conversion result: ${JSON.stringify(result)}`)
}

const csvResult = {
  jobId: job.id,
  status: job.status,
  resultFileName: job.resultFileName,
  downloadStatus: response.status,
  records: result.length,
}

const workbook = new ExcelJS.Workbook()
workbook.addWorksheet('North').addRows([['name', 'amount'], ['Alpha', 120]])
workbook.addWorksheet('South').addRows([['name', 'amount'], ['Beta', 85]])

const workbookForm = new FormData()
workbookForm.append('file', new Blob([await workbook.xlsx.writeBuffer()]), 'regions.xlsx')
workbookForm.append('format', 'CSV')
workbookForm.append('splitSheets', 'true')

response = await fetch(`${apiBase}/api/jobs`, { method: 'POST', body: workbookForm })
body = await response.json()
if (!response.ok) throw new Error(JSON.stringify(body))

job = body.job
for (let attempt = 0; attempt < 20 && !['completed', 'failed'].includes(job.status); attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 150))
  response = await fetch(`${apiBase}/api/jobs/${job.id}`)
  job = (await response.json()).job
}

if (job.status !== 'completed' || job.resultFileName !== 'regions.zip') {
  throw new Error(`Workbook job ended as ${job.status}: ${job.error}`)
}

response = await fetch(`${apiBase}/api/jobs/${job.id}/download`)
const workbookLink = await response.json()
response = await fetch(`${apiBase}${workbookLink.url}`)
const workbookDownloadStatus = response.status
const archive = new Uint8Array(await response.arrayBuffer())
if (archive[0] !== 0x50 || archive[1] !== 0x4b) throw new Error('Workbook result is not a ZIP archive.')

const batchForm = new FormData()
batchForm.append('files', new Blob([await readFile(fixture)], { type: 'text/csv' }), 'north.csv')
batchForm.append('files', new Blob(['region,amount,name\nWest,42,Gamma\n'], { type: 'text/csv' }), 'west.csv')
response = await fetch(`${apiBase}/api/batches`, { method: 'POST', body: batchForm })
body = await response.json()
if (!response.ok) throw new Error(JSON.stringify(body))

let batch = await waitForBatch(body.batch, ['awaiting_configuration', 'failed'])
if (batch.status !== 'awaiting_configuration' || batch.schemaGroups.length !== 1) {
  throw new Error(`Unexpected batch analysis: ${JSON.stringify(batch)}`)
}

response = await fetch(`${apiBase}/api/batches/${batch.id}/configure`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ strategy: 'merge', format: 'JSON' }),
})
batch = (await response.json()).batch
batch = await waitForBatch(batch, ['completed', 'failed'])
if (batch.status !== 'completed') throw new Error(`Merged batch ended as ${batch.status}: ${JSON.stringify(batch.faults)}`)

response = await fetch(`${apiBase}/api/batches/${batch.id}/download`)
const batchLink = await response.json()
response = await fetch(`${apiBase}${batchLink.url}`)
const merged = await response.json()
if (merged.length !== 3 || merged[2].name !== 'Gamma' || merged[2].amount !== '42') {
  throw new Error(`Unexpected merged batch: ${JSON.stringify(merged)}`)
}

const sqliteForm = new FormData()
sqliteForm.append('files', new Blob([await readFile(fixture)], { type: 'text/csv' }), 'source.csv')
response = await fetch(`${apiBase}/api/batches`, { method: 'POST', body: sqliteForm })
body = await response.json()
batch = await waitForBatch(body.batch, ['awaiting_configuration', 'failed'])
response = await fetch(`${apiBase}/api/batches/${batch.id}/configure`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ strategy: 'sqlite', sqliteLayout: 'grouped' }),
})
batch = (await response.json()).batch
batch = await waitForBatch(batch, ['completed', 'failed'])
if (batch.status !== 'completed') throw new Error(`SQLite batch ended as ${batch.status}: ${JSON.stringify(batch.faults)}`)
response = await fetch(`${apiBase}/api/batches/${batch.id}/download`)
const sqliteLink = await response.json()
response = await fetch(`${apiBase}${sqliteLink.url}`)
const sqlite = new Uint8Array(await response.arrayBuffer())
const sqliteHeader = new TextDecoder().decode(sqlite.slice(0, 16))
if (sqliteHeader !== 'SQLite format 3\u0000') throw new Error('Batch result is not a SQLite database.')

const invalidForm = new FormData()
invalidForm.append('files', new Blob(['not an xlsx']), 'broken-one.xlsx')
invalidForm.append('files', new Blob(['also not an xlsx']), 'broken-two.xlsx')
invalidForm.append('files', new Blob(['unsupported']), 'notes.txt')
response = await fetch(`${apiBase}/api/batches`, { method: 'POST', body: invalidForm })
body = await response.json()
batch = await waitForBatch(body.batch, ['awaiting_configuration', 'failed'])
if (batch.status !== 'failed' || batch.faults.length !== 3 || !batch.faults.some((fault) => fault.code === 'unsupported_file')) {
  throw new Error(`Expected all invalid-file faults: ${JSON.stringify(batch)}`)
}

const oversizedCountForm = new FormData()
for (let index = 0; index < 21; index += 1) {
  oversizedCountForm.append('files', new Blob(['name\nvalue\n'], { type: 'text/csv' }), `file-${index + 1}.csv`)
}
response = await fetch(`${apiBase}/api/batches`, { method: 'POST', body: oversizedCountForm })
body = await response.json()
if (response.status !== 413 || body.error !== 'Choose no more than 20 files.') {
  throw new Error(`Expected batch file-count rejection: ${response.status} ${JSON.stringify(body)}`)
}

console.log(JSON.stringify({
  csv: csvResult,
  workbook: {
    jobId: job.id,
    status: job.status,
    resultFileName: job.resultFileName,
    downloadStatus: workbookDownloadStatus,
    zipBytes: archive.length,
  },
  batch: {
    mergedRecords: merged.length,
    schemaGroups: 1,
    sqliteBytes: sqlite.length,
    collectedFaults: batch.faults.length,
  },
}, null, 2))