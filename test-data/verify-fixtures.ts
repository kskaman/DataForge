import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDatasets } from '../backend/src/services/dataset-service.js'

type ExpectedScenario = {
  files: string[]
  expectedDatasets?: number
  expectedSchemaGroups?: number
  expectedRows?: number
  expectedFaultCodes?: string[]
}

type Manifest = {
  scenarios: Record<string, ExpectedScenario>
}

const root = path.dirname(fileURLToPath(import.meta.url))

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase()
}

function schemaKey(headers: string[]) {
  return [...headers].sort().join('\u001f')
}

async function inspectScenario(scenario: ExpectedScenario) {
  let datasetCount = 0
  let rowCount = 0
  const schemas = new Set<string>()
  const faultCodes = new Set<string>()

  for (const relativePath of scenario.files) {
    try {
      const datasets = await readDatasets(path.join(root, relativePath), path.basename(relativePath))
      if (datasets.length === 0) faultCodes.add('empty_dataset')

      for (const dataset of datasets) {
        const [header = [], ...rows] = dataset.rows
        const normalizedHeaders = header.map(normalizeHeader)
        datasetCount += 1
        rowCount += rows.length

        if (dataset.rows.length === 0 || normalizedHeaders.length === 0) {
          faultCodes.add('empty_dataset')
          continue
        }
        if (normalizedHeaders.some((headerName) => !headerName)) faultCodes.add('blank_header')
        if (normalizedHeaders.some((headerName, index) => headerName && normalizedHeaders.indexOf(headerName) !== index)) {
          faultCodes.add('duplicate_header')
        }
        schemas.add(schemaKey(normalizedHeaders))
      }
    } catch {
      faultCodes.add('parse_error')
    }
  }

  return { datasetCount, rowCount, schemaGroupCount: schemas.size, faultCodes: [...faultCodes].sort() }
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(root, 'expected-analysis.json'), 'utf8')) as Manifest

  for (const [name, scenario] of Object.entries(manifest.scenarios)) {
    const actual = await inspectScenario(scenario)

    if (scenario.expectedDatasets !== undefined) assert.equal(actual.datasetCount, scenario.expectedDatasets, `${name}: dataset count`)
    if (scenario.expectedSchemaGroups !== undefined) assert.equal(actual.schemaGroupCount, scenario.expectedSchemaGroups, `${name}: schema group count`)
    if (scenario.expectedRows !== undefined) assert.equal(actual.rowCount, scenario.expectedRows, `${name}: row count`)
    if (scenario.expectedFaultCodes) assert.deepEqual(actual.faultCodes, [...scenario.expectedFaultCodes].sort(), `${name}: fault codes`)

    console.log(`${name}:`, actual)
  }

  console.log('All DataForge fixtures match expected parser behavior.')
}

void main()