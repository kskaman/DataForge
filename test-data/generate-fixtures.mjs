import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const requireFromBackend = createRequire(new URL('../backend/package.json', import.meta.url))
const ExcelJS = requireFromBackend('exceljs')

const root = path.dirname(fileURLToPath(import.meta.url))
const validDirectory = path.join(root, 'valid')
const errorDirectory = path.join(root, 'errors')
const countDirectory = path.join(root, 'limits', 'file-count')
const largeDirectory = path.join(root, 'limits', 'generated-large')

await Promise.all([
    mkdir(validDirectory, { recursive: true }),
    mkdir(errorDirectory, { recursive: true }),
    mkdir(countDirectory, { recursive: true }),
])

function styleHeader(row) {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF24513D' } }
}

const workbook = new ExcelJS.Workbook()
workbook.creator = 'DataForge test-data generator'
workbook.created = new Date('2026-08-20T00:00:00.000Z')

const orders = workbook.addWorksheet('Orders 2026')
orders.addRow(['Order ID', 'Product', 'Units', 'Unit Price', 'Region', 'Ordered At', 'Fulfilled'])
orders.addRow([
    'ORD-3001',
    'Precision sensor',
    12,
    149.95,
    'North',
    new Date('2026-06-01T09:30:00.000Z'),
    true,
])
orders.addRow([
    'ORD-3002',
    'Valve, stainless',
    4,
    87.5,
    'South',
    new Date('2026-06-02T14:15:00.000Z'),
    false,
])
orders.addRow([
    'ORD-3003',
    'Calibration kit',
    1,
    1200,
    'West',
    new Date('2026-06-03T08:00:00.000Z'),
    true,
])
styleHeader(orders.getRow(1))
orders.columns.forEach((column) => {
    column.width = 20
})

const inventory = workbook.addWorksheet('Inventory Snapshot')
inventory.addRow([
    'SKU',
    'Warehouse',
    'On Hand',
    'Reorder Point',
    'Unit Cost',
    'Last Counted',
    'Notes',
])
inventory.addRow([
    'SNS-001',
    'Montréal',
    84,
    20,
    72.4,
    new Date('2026-08-17T00:00:00.000Z'),
    'Temperature controlled',
])
inventory.addRow([
    'VLV-204',
    'São Paulo',
    7,
    15,
    31.25,
    new Date('2026-08-18T00:00:00.000Z'),
    'Reorder immediately',
])
inventory.addRow([
    'KIT-900',
    '東京',
    0,
    5,
    640,
    new Date('2026-08-19T00:00:00.000Z'),
    'Awaiting customs\nPriority shipment',
])
styleHeader(inventory.getRow(1))
inventory.columns.forEach((column) => {
    column.width = 22
})

const staff = workbook.addWorksheet('Staff & Allocation')
staff.addRow(['Employee ID', 'Name', 'Team', 'Start Date', 'Allocation', 'Active'])
staff.addRow(['E-101', 'Amara Okafor', 'Operations', new Date('2021-04-12T00:00:00.000Z'), 1, true])
staff.addRow([
    'E-102',
    'Léa Dubois',
    'Data Quality',
    new Date('2023-09-01T00:00:00.000Z'),
    0.8,
    true,
])
staff.addRow(['E-103', 'يوسف حمد', 'Logistics', new Date('2020-01-20T00:00:00.000Z'), 0.5, false])
styleHeader(staff.getRow(1))
staff.columns.forEach((column) => {
    column.width = 20
})

const formulas = workbook.addWorksheet('Formula Results')
formulas.addRow(['Metric', 'Expression', 'Value', 'Notes'])
formulas.addRow([
    'Gross value',
    'Units * Unit Price',
    { formula: "'Orders 2026'!C2*'Orders 2026'!D2", result: 1799.4 },
    'Formula result is exported',
])
formulas.addRow([
    'Open orders',
    'COUNTIF(Fulfilled, false)',
    { formula: "COUNTIF('Orders 2026'!G2:G4,FALSE)", result: 1 },
    'ExcelJS reads the cached result',
])
formulas.addRow([
    'Data label',
    'Rich text',
    {
        richText: [
            { text: 'High ', font: { bold: true } },
            { text: 'priority', font: { color: { argb: 'FFB42318' } } },
        ],
    },
    'Rich-text runs become one string',
])
formulas.addRow([
    'Reference',
    'Hyperlink',
    { text: 'DataForge docs', hyperlink: 'https://example.invalid/dataforge' },
    'Hyperlinks export their display text',
])
styleHeader(formulas.getRow(1))
formulas.columns.forEach((column) => {
    column.width = 28
})

await workbook.xlsx.writeFile(path.join(validDirectory, 'operations-multisheet.xlsx'))

const emptyWorkbook = new ExcelJS.Workbook()
await emptyWorkbook.xlsx.writeFile(path.join(errorDirectory, 'empty-workbook.xlsx'))

const emptySheetWorkbook = new ExcelJS.Workbook()
emptySheetWorkbook.addWorksheet('Empty Sheet')
await emptySheetWorkbook.xlsx.writeFile(path.join(errorDirectory, 'empty-sheet.xlsx'))

await writeFile(
    path.join(errorDirectory, 'corrupt-workbook.xlsx'),
    'This is deliberately not an XLSX ZIP container.\n',
    'utf8',
)
await writeFile(path.join(errorDirectory, 'empty.csv'), '', 'utf8')

await writeFile(
    path.join(validDirectory, 'utf8-bom-sales.csv'),
    '\ufeffOrder ID,Product,Units,Unit Price,Region,Ordered At,Fulfilled\nORD-4001,"Gauge, digital",2,45.75,East,2026-07-01T10:00:00Z,true\n',
    'utf8',
)

await writeFile(
    path.join(validDirectory, 'windows-crlf-customers.csv'),
    'Customer ID,Name,Email,Locale,Lifetime Value,Joined At,Notes\r\nC-900,"Jordan Lee",jordan@example.test,en-CA,875.25,2025-11-04,"CRLF source"\r\n',
    'utf8',
)

await Promise.all(
    Array.from({ length: 21 }, (_unused, index) => {
        const number = String(index + 1).padStart(2, '0')
        return writeFile(
            path.join(countDirectory, `${number}-count-limit.csv`),
            `Record ID,Sequence,Label\nCOUNT-${number},${index + 1},File ${number}\n`,
            'utf8',
        )
    }),
)

if (process.argv.includes('--large')) {
    await mkdir(largeDirectory, { recursive: true })
    const megabyte = 1024 * 1024

    async function writeSizedCsv(name, sizeInBytes, marker) {
        const header = 'Record ID,Payload\n'
        const prefix = `${marker},"`
        const suffix = '"\n'
        const payloadLength = sizeInBytes - Buffer.byteLength(header + prefix + suffix)
        await writeFile(
            path.join(largeDirectory, name),
            header + prefix + 'x'.repeat(payloadLength) + suffix,
            'utf8',
        )
    }

    await writeSizedCsv('over-50mb.csv', 50 * megabyte + 1, 'TOO-LARGE')
    await Promise.all(
        Array.from({ length: 5 }, (_unused, index) =>
            writeSizedCsv(`aggregate-${index + 1}.csv`, 41 * megabyte, `AGG-${index + 1}`),
        ),
    )
}

console.log(
    `Generated DataForge fixtures${process.argv.includes('--large') ? ' including large limit files' : ''}.`,
)
