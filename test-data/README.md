# DataForge Test Data

This folder is a hands-on tour of DataForge. The fixtures are intentionally varied: reordered schemas, Unicode, quoted commas and newlines, sparse rows, Excel dates, formulas, rich text, multiple worksheets, invalid headers, corrupt files, and upload limits.

Run the generator once after installing backend dependencies:

```powershell
node .\test-data\generate-fixtures.mjs
```

It creates the binary XLSX fixtures, UTF-8 BOM and CRLF files, and 21 small file-count fixtures. These generated files are already present in this checkout; rerunning the command safely replaces them.

Verify the generated files with the same parser used by the backend:

```powershell
Push-Location .\backend
npx tsx ..\test-data\verify-fixtures.ts
Pop-Location
```

## Fastest Product Tour

Start the backend and frontend, open `http://localhost:5173`, and perform these tours in order.

### 1. One schema, reordered columns

Select these together:

- `valid/sales-north.csv`
- `valid/sales-south-reordered.csv`
- `valid/utf8-bom-sales.csv`

Analysis should report **3 datasets and 1 schema group**. The second file deliberately changes column order, casing, and whitespace. DataForge normalizes the headers and aligns each row to the first file's display order.

Try all output choices:

| Choice | Expected download |
| --- | --- |
| Converted ZIP + CSV/TSV/JSON | A ZIP with one converted file per source dataset |
| Merged table + CSV/TSV/JSON | One `dataforge-merged.*` file containing 9 data rows |
| SQLite + one table per source | Three data tables plus `_dataforge_sources` |
| SQLite + group compatible data | One `schema_1` table with 9 rows and source provenance columns |

This is the clearest scenario for seeing schema normalization and row alignment.

### 2. Complex multi-sheet workbook

Select only `valid/operations-multisheet.xlsx`. Analysis should show **4 worksheets and 4 schema groups**:

- `Orders 2026` contains booleans, numbers, and real Excel date cells.
- `Inventory Snapshot` contains Unicode locations, missing stock, and multiline notes.
- `Staff & Allocation` contains dates, decimals, booleans, and multilingual names.
- `Formula Results` contains cached formula results, rich text, and a hyperlink display value.

Use **Converted ZIP + JSON** to inspect each sheet independently. Use **Grouped tables + TSV** to see four schema files in one ZIP. Use both SQLite layouts and inspect `_dataforge_sources` to understand table lineage.

### 3. Complex mixed batch

Select every file in `valid/`. The expected aggregate is recorded in `expected-analysis.json`: **12 datasets, 7 schema groups, and 37 data rows**.

This tour exercises:

- CSV and XLSX in one batch;
- multiple worksheets;
- identical schemas with reordered/case-varied headers;
- multiple incompatible schemas;
- UTF-8 BOM and Windows CRLF input;
- Unicode and right-to-left text;
- quoted commas, quotes, and embedded newlines;
- short and long CSV rows (`relax_column_count`);
- a valid header-only dataset with zero rows.

Choose **Grouped tables** to produce a ZIP containing one file per detected schema. Choose **SQLite / Group compatible data** to produce one table per schema and add `_source_file` and `_source_sheet` to every data row.

### 4. Analysis failures and Retry

Upload each file in `errors/` separately first so each message is easy to understand:

| File | Expected behavior |
| --- | --- |
| `blank-header.csv` | `blank_header`: every column must have a name |
| `duplicate-header.csv` | `duplicate_header`: `Name` and ` name ` normalize to the same key |
| `malformed-quotes.csv` | `parse_error`: unclosed CSV quote |
| `empty.csv` | `empty_dataset`: no header row |
| `empty-workbook.xlsx` | `empty_dataset`: workbook has no worksheets |
| `empty-sheet.xlsx` | `empty_dataset`: worksheet has no header row |
| `corrupt-workbook.xlsx` | `parse_error`: file extension is XLSX but content is not a workbook |
| `unsupported.txt` | Frontend rejects the file before upload because only CSV/XLSX are accepted |

You can select several error files together to see faults collected across an entire batch. A failed batch appears in History with **Retry**. Retrying re-analyzes the retained source, so a deliberately invalid fixture fails again; this demonstrates retry/status behavior without hiding the original problem.

### 5. Upload limits

In `limits/file-count/`, selecting files `01` through `20` is accepted. Selecting all 21 is rejected with the 20-file limit message.

Large fixtures are generated only on demand because keeping more than 250 MB in the repository would be wasteful:

```powershell
node .\test-data\generate-fixtures.mjs --large
```

Then use:

| Input | Expected behavior |
| --- | --- |
| `limits/generated-large/over-50mb.csv` | Rejected because one file exceeds 50 MB |
| All five `aggregate-*.csv` files | Rejected because the combined size is 205 MB |

Delete `limits/generated-large/` after the check if disk space matters. The normal generator does not recreate it.

## Feature-to-File Map

| Feature | Best fixture or scenario |
| --- | --- |
| Drag/drop, multiple selection, remove file | Any files under `valid/` |
| CSV parsing | `quoted-and-sparse.csv` |
| XLSX and multi-sheet parsing | `operations-multisheet.xlsx` |
| Schema normalization/alignment | Three-file sales tour |
| Multiple schema groups | All of `valid/` |
| Converted ZIP | Workbook with Separate strategy |
| Merged single file | Three-file sales tour with Merge |
| Grouped ZIP | All of `valid/` with Merge |
| CSV, TSV, and JSON rendering | Repeat either successful tour with each format |
| SQLite per-source tables | Workbook or mixed batch with per-source layout |
| SQLite grouped tables and provenance | Mixed batch with grouped layout |
| Analysis faults | Files under `errors/` |
| Retry action | Retry any failed error fixture |
| History polling and statuses | Watch Analyze/Create Output, then open History |
| Signed download | Download any completed result from Recent Activity or History |
| Guest isolation | Create a result, then open an InPrivate browser; its history is empty |
| 24-hour retention message | Visible below output controls; actual cleanup is time based, not fixture based |
| File-count validation | `limits/file-count/` |
| File-size/aggregate validation | Generate with `--large` |

## Legacy Single-File API

The current screen uses the batch API even for one file. The compatibility API can still be exercised from PowerShell. Keep the same web session for creation, polling, and download because guest ownership is cookie based.

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$result = Invoke-RestMethod -WebSession $session -Method Post -Uri http://localhost:4000/api/jobs `
  -Form @{ file = Get-Item .\test-data\valid\operations-multisheet.xlsx; format = 'JSON'; splitSheets = 'true' }
$result.job
```

With `splitSheets=true`, the workbook produces a ZIP containing one JSON file per worksheet. Use `false` to export only the first worksheet. Replace `JSON` with `CSV` or `TSV` to exercise the other renderers. The created job also appears in the site's shared History when the browser has the same guest cookie; a separate PowerShell session intentionally has a separate anonymous history.

## Inspecting Downloads

- ZIP outputs: open them and compare source folders/sheet names with the selected files.
- JSON outputs: verify embedded newlines and missing fields in `quoted-and-sparse.csv`.
- Merged outputs: verify `sales-south-reordered.csv` values moved under the correct headers.
- SQLite outputs: use a SQLite viewer and inspect `_dataforge_sources`, table names, inferred `INTEGER`/`REAL`/`TEXT` columns, and grouped provenance columns.

`expected-analysis.json` is the compact machine-readable reference for the main scenarios. If parser or grouping rules change, update both that file and this guide.