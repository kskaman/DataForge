import archiver from 'archiver'
import { createWriteStream } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { resultDirectory } from '../repositories/job-store.js'
import type { ConversionJob, OutputFormat } from '../types.js'
import { readDatasets, type Dataset } from './dataset-service.js'

export function delimited(rows: unknown[][], delimiter: ',' | '\t') {
  
  return rows.map((row) => row.map((value) => {
      const text = String(value ?? '')
      return text.includes(delimiter) || 
          /["\r\n]/.test(text) ? 
          `"${text.replaceAll('"', '""')}"` : text
      }).join(delimiter)).join('\n')
}

export function json(rows: unknown[][]) {
    
    const [header = [], ...dataRows] = rows
  
    const keys = header.map((value, index) => 
      String(value || `column_${index + 1}`))
  
    return JSON.stringify(dataRows.map((row) => 
      Object.fromEntries(keys.map((key, index) => 
        [key, row[index] ?? '']
      )
    )), null, 2)
}

export function datasetContent(sheet: Dataset, format: OutputFormat) {
  if (format === 'JSON') return json(sheet.rows)
  return delimited(sheet.rows, format === 'TSV' ? '\t' : ',')
}

export function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'sheet'
}

export async function createArchive(outputPath: string, files: Array<{ name: string; content: string }>) {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    files.forEach((file) => archive.append(file.content, { name: file.name }))
    void archive.finalize()
  })
}

export async function convertJob(job: ConversionJob) {
  const sheets = await readDatasets(job.sourcePath, job.fileName)
  if (sheets.length === 0) throw new Error('The workbook does not contain any worksheets.')

  const baseName = safeName(path.parse(job.fileName).name)
  const extension = job.format.toLowerCase()
  const shouldArchive = job.splitSheets && job.fileName.toLowerCase().endsWith('.xlsx')
  const resultFileName = shouldArchive ? `${baseName}.zip` : `${baseName}.${extension}`
  const resultPath = path.join(resultDirectory, `${job.id}-${resultFileName}`)

  await rm(resultPath, { force: true })
  if (shouldArchive) {
    await createArchive(resultPath, sheets.map((sheet) => ({
      name: `${safeName(sheet.sheetName)}.${extension}`,
      content: datasetContent(sheet, job.format),
    })))
  } else {
    await writeFile(resultPath, datasetContent(sheets[0]!, job.format), 'utf8')
  }

  return { resultPath, resultFileName }
}