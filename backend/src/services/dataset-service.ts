import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import { parse } from 'csv-parse/sync'

export type Dataset = {
  sourceFileName: string
  sheetName: string
  rows: unknown[][]
}

function normalizeValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return value
  if ('result' in value) return normalizeValue(value.result as ExcelJS.CellValue)
  if ('text' in value) return value.text
  if ('richText' in value) return value.richText.map((part) => part.text).join('')
  return String(value)
}

export async function readDatasets(sourcePath: string, sourceFileName: string): Promise<Dataset[]> {
  if (sourceFileName.toLowerCase().endsWith('.csv')) {
    const source = await readFile(sourcePath, 'utf8')
    return [{
      sourceFileName,
      sheetName: 'data',
      rows: parse(source, { bom: true, relax_column_count: true, skip_empty_lines: true }) as string[][],
    }]
  }

  const workbook = new ExcelJS.Workbook()
  const source = await readFile(sourcePath)
  await workbook.xlsx.load(source as unknown as Parameters<typeof workbook.xlsx.load>[0])
  return workbook.worksheets.map((worksheet) => ({
    sourceFileName,
    sheetName: worksheet.name,
    rows: Array.from({ length: worksheet.actualRowCount }, (_, index) => {
      const row = worksheet.getRow(index + 1)
      return Array.from({ length: worksheet.actualColumnCount }, (_unused, columnIndex) =>
        normalizeValue(row.getCell(columnIndex + 1).value),
      )
    }),
  }))
}