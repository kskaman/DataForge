import { useEffect, useRef, useState } from 'react'
import './App.css'
import {
  checkHealth,
  configureBatch,
  createBatch,
  getBatchDownloadUrl,
  getBatches,
  getDownloadUrl,
  getJobs,
  retryBatch,
  retryConversion,
  type BatchJob,
  type BatchStrategy,
  type ConversionJob,
  type OutputFormat,
} from './api'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const MAX_BATCH_SIZE = 200 * 1024 * 1024
const MAX_BATCH_FILES = 20

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function relativeTime(date: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

function App() {
  const [jobs, setJobs] = useState<ConversionJob[]>([])
  const [batches, setBatches] = useState<BatchJob[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [draftBatch, setDraftBatch] = useState<BatchJob | null>(null)
  const [format, setFormat] = useState<OutputFormat>('CSV')
  const [strategy, setStrategy] = useState<BatchStrategy>('separate')
  const [sqliteLayout, setSqliteLayout] = useState<'per_source' | 'grouped'>('per_source')
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serviceOnline, setServiceOnline] = useState(false)
  const [activeView, setActiveView] = useState<'convert' | 'history'>('convert')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const [nextJobs, nextBatches] = await Promise.all([getJobs(), getBatches(), checkHealth()])
        if (active) {
          setJobs(nextJobs)
          setBatches(nextBatches)
          setDraftBatch((current) => current ? nextBatches.find((batch) => batch.id === current.id) ?? current : current)
          setServiceOnline(true)
        }
      } catch {
        if (active) setServiceOnline(false)
      }
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), 2000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  const validateFile = (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (extension !== 'xlsx' && extension !== 'csv') return 'Choose an .xlsx or .csv file.'
    if (file.size > MAX_FILE_SIZE) return 'File size must be 50 MB or less.'
    return ''
  }

  const chooseFiles = (incoming: FileList | File[]) => {
    const files = Array.from(incoming)
    const validationErrors = files.map(validateFile).filter(Boolean)
    const combined = [...selectedFiles, ...files]
    const totalSize = combined.reduce((sum, file) => sum + file.size, 0)
    if (validationErrors.length > 0) return setError(validationErrors[0]!)
    if (combined.length > MAX_BATCH_FILES) return setError(`Choose no more than ${MAX_BATCH_FILES} files.`)
    if (totalSize > MAX_BATCH_SIZE) return setError('Batch size must be 200 MB or less.')
    setSelectedFiles(combined)
    setDraftBatch(null)
    setError('')
  }

  const analyzeFiles = async () => {
    if (selectedFiles.length === 0) {
      setError('Select one or more spreadsheets before analysis.')
      return
    }

    setIsSubmitting(true)
    try {
      const batch = await createBatch(selectedFiles)
      setDraftBatch(batch)
      setBatches((current) => [batch, ...current.filter((item) => item.id !== batch.id)])
      setError('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Upload failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const startBatch = async () => {
    if (!draftBatch || draftBatch.status !== 'awaiting_configuration') return
    setIsSubmitting(true)
    try {
      const configuration = strategy === 'sqlite'
        ? { strategy, sqliteLayout }
        : { strategy, format }
      const batch = await configureBatch(draftBatch.id, configuration)
      setBatches((current) => current.map((item) => item.id === batch.id ? batch : item))
      setDraftBatch(null)
      setSelectedFiles([])
      if (inputRef.current) inputRef.current.value = ''
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Batch configuration failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const retryJob = async (jobId: string) => {
    try {
      const retriedJob = await retryConversion(jobId)
      setJobs((current) => current.map((job) => job.id === jobId ? retriedJob : job))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Retry failed.')
    }
  }

  const downloadJob = async (job: ConversionJob) => {
    try {
      window.location.assign(await getDownloadUrl(job.id))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Download failed.')
    }
  }

  const retryBatchJob = async (batchId: string) => {
    try {
      const batch = await retryBatch(batchId)
      setBatches((current) => current.map((item) => item.id === batchId ? batch : item))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Batch retry failed.')
    }
  }

  const downloadBatch = async (batch: BatchJob) => {
    try {
      window.location.assign(await getBatchDownloadUrl(batch.id))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Download failed.')
    }
  }

  const totalSelectedSize = selectedFiles.reduce((sum, file) => sum + file.size, 0)
  const analysisReady = draftBatch?.status === 'awaiting_configuration'
  const processingCount = jobs.filter((job) => ['queued', 'processing'].includes(job.status)).length
    + batches.filter((batch) => ['analyzing', 'queued', 'processing'].includes(batch.status)).length

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setActiveView('convert')}>
          <span className="brand-mark" aria-hidden="true">DF</span><span>DataForge</span>
        </button>
        <nav aria-label="Primary navigation">
          <button className={activeView === 'convert' ? 'nav-button active' : 'nav-button'} type="button" onClick={() => setActiveView('convert')}>Convert</button>
          <button className={activeView === 'history' ? 'nav-button active' : 'nav-button'} type="button" onClick={() => setActiveView('history')}>History <span className="nav-count">{jobs.length}</span></button>
        </nav>
        <div className={`service-state${serviceOnline ? '' : ' offline'}`}><span /> {serviceOnline ? 'Service operational' : 'Service unavailable'}</div>
      </header>

      <main>
        <section className="page-heading">
          <div>
            <p className="eyebrow">Spreadsheet utility</p>
            <h1>{activeView === 'convert' ? 'Convert files' : 'Conversion history'}</h1>
            <p className="heading-copy">{activeView === 'convert' ? 'Transform Excel and CSV data into clean, portable formats.' : 'Track recent files, retrieve results, and retry failed jobs.'}</p>
          </div>
          {processingCount > 0 && <div className="activity-pill">{processingCount} active</div>}
        </section>
        {error && <p className="global-error" role="alert">{error}</p>}

        {activeView === 'convert' && (
          <section className="conversion-layout">
            <div className="upload-panel">
              <div className="panel-heading"><span className="step-number">01</span><div><h2>Source files</h2><p>Analyze spreadsheets before choosing an output</p></div></div>
              <div
                className={`drop-zone${isDragging ? ' dragging' : ''}${selectedFiles.length ? ' has-file' : ''}`}
                onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => { event.preventDefault(); setIsDragging(false); chooseFiles(event.dataTransfer.files) }}
              >
                <input ref={inputRef} type="file" accept=".xlsx,.csv" multiple onChange={(event) => event.target.files && chooseFiles(event.target.files)} />
                {selectedFiles.length ? (
                  <div className="selected-files">
                    <div className="selected-files-summary"><strong>{selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'}</strong><span>{formatBytes(totalSelectedSize)} total</span></div>
                    <div className="selected-files-list">
                      {selectedFiles.map((file, index) => (
                        <div className="selected-file" key={`${file.name}-${file.size}-${index}`}>
                          <div className="file-type">{file.name.split('.').pop()?.toUpperCase()}</div>
                          <div><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div>
                          <button type="button" disabled={Boolean(draftBatch)} onClick={() => setSelectedFiles((current) => current.filter((_item, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}>x</button>
                        </div>
                      ))}
                    </div>
                    {!draftBatch && <button className="add-files" type="button" onClick={() => inputRef.current?.click()}>Add files</button>}
                  </div>
                ) : (
                  <button className="drop-action" type="button" onClick={() => inputRef.current?.click()}>
                    <span className="upload-symbol" aria-hidden="true">+</span><strong>Drop spreadsheets here</strong><span>or choose files</span><small>20 files, 50 MB each, 200 MB total</small>
                  </button>
                )}
              </div>
              {draftBatch && (
                <div className={`analysis-summary ${draftBatch.status}`}>
                  <div><strong>{draftBatch.status === 'analyzing' ? 'Scanning files' : draftBatch.status === 'failed' ? 'Analysis found problems' : 'Analysis complete'}</strong><span>{draftBatch.datasets.length} datasets · {draftBatch.schemaGroups.length} schema groups</span></div>
                  {draftBatch.schemaGroups.map((group) => <p key={group.id}><b>{group.id}</b> {group.headers.join(', ')} · {group.datasetIds.length} dataset{group.datasetIds.length === 1 ? '' : 's'}</p>)}
                  {draftBatch.faults.map((fault, index) => <p className="analysis-fault" key={`${fault.sourceFileName}-${index}`}><b>{fault.sourceFileName}{fault.sheetName ? ` / ${fault.sheetName}` : ''}</b> {fault.message}</p>)}
                </div>
              )}
            </div>

            <aside className="settings-panel">
              <div className="panel-heading"><span className="step-number">02</span><div><h2>Output</h2><p>{analysisReady ? 'Choose a strategy for the analyzed data' : 'Available after analysis'}</p></div></div>
              {analysisReady && <div className="strategy-options" role="radiogroup" aria-label="Output strategy">
                {([['separate', 'Converted ZIP'], ['merge', draftBatch.schemaGroups.length === 1 ? 'Merged table' : 'Grouped tables'], ['sqlite', 'SQLite database']] as const).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={strategy === value} className={strategy === value ? 'strategy-option selected' : 'strategy-option'} onClick={() => setStrategy(value)}>{label}</button>
                ))}
              </div>}
              {analysisReady && strategy !== 'sqlite' && <div className="format-options" role="radiogroup" aria-label="Output format">
                {(['CSV', 'TSV', 'JSON'] as OutputFormat[]).map((option) => (
                  <button key={option} type="button" role="radio" aria-checked={format === option} className={format === option ? 'format-option selected' : 'format-option'} onClick={() => setFormat(option)}>
                    <span className="radio-dot" /><span><strong>{option}</strong><small>{option === 'JSON' ? 'Structured records' : option === 'TSV' ? 'Tab delimited' : 'Universal tables'}</small></span>
                  </button>
                ))}
              </div>}
              {analysisReady && strategy === 'sqlite' && <div className="format-options" role="radiogroup" aria-label="SQLite layout">
                <button type="button" role="radio" aria-checked={sqliteLayout === 'per_source'} className={sqliteLayout === 'per_source' ? 'format-option selected' : 'format-option'} onClick={() => setSqliteLayout('per_source')}><span className="radio-dot" /><span><strong>One table per source</strong><small>Each CSV or sheet stays separate</small></span></button>
                <button type="button" role="radio" aria-checked={sqliteLayout === 'grouped'} className={sqliteLayout === 'grouped' ? 'format-option selected' : 'format-option'} onClick={() => setSqliteLayout('grouped')}><span className="radio-dot" /><span><strong>Group compatible data</strong><small>One table per detected schema</small></span></button>
              </div>}
              <button className="convert-button" type="button" onClick={() => void (analysisReady ? startBatch() : analyzeFiles())} disabled={isSubmitting || selectedFiles.length === 0 || draftBatch?.status === 'analyzing' || draftBatch?.status === 'failed'}>{isSubmitting ? 'Working...' : analysisReady ? 'Create output' : draftBatch?.status === 'analyzing' ? 'Analyzing...' : 'Analyze files'} <span aria-hidden="true">-&gt;</span></button>
              <p className="retention-note">Source and result files expire automatically after 24 hours.</p>
            </aside>
          </section>
        )}

        <section className={activeView === 'history' ? 'jobs-section history-view' : 'jobs-section'}>
          <div className="section-heading">
            <div><h2>{activeView === 'history' ? 'All conversions' : 'Recent activity'}</h2><p>Updates automatically while files are processed</p></div>
            {activeView === 'convert' && <button type="button" onClick={() => setActiveView('history')}>View all</button>}
          </div>
          <div className="jobs-table-wrap">
            <table className="jobs-table">
              <thead><tr><th>File</th><th>Output</th><th>Status</th><th>Created</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={`batch-${batch.id}`}>
                    <td><div className="job-file"><span>B</span><div><strong>{batch.fileName}</strong><small>{batch.fileCount} files · {formatBytes(batch.fileSize)}</small></div></div></td>
                    <td><span className="output-label">{batch.configuration?.strategy === 'sqlite' ? 'SQLite' : batch.configuration?.strategy === 'merge' ? 'Merged' : batch.configuration ? `${batch.configuration.format} / ZIP` : 'Analysis'}</span></td>
                    <td><div><span className={`status status-${batch.status}`}><i />{batch.status.replace('_', ' ')}</span>{batch.faults.map((fault, index) => <small className="job-error" key={index}>{fault.sourceFileName}: {fault.message}</small>)}</div></td>
                    <td><span className="created-time">{relativeTime(batch.createdAt)}</span></td>
                    <td className="job-actions">
                      {batch.status === 'completed' && <button type="button" onClick={() => void downloadBatch(batch)}>Download</button>}
                      {batch.status === 'failed' && <button type="button" onClick={() => void retryBatchJob(batch.id)}>Retry</button>}
                      {(['analyzing', 'queued', 'processing'] as string[]).includes(batch.status) && <span className="working-dots" aria-label="Working">...</span>}
                    </td>
                  </tr>
                ))}
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td><div className="job-file"><span>{job.fileName.endsWith('.xlsx') ? 'X' : 'C'}</span><div><strong>{job.fileName}</strong><small>{formatBytes(job.fileSize)}</small></div></div></td>
                    <td><span className="output-label">{job.splitSheets ? `${job.format} / ZIP` : job.format}</span></td>
                    <td><div><span className={`status status-${job.status}`}><i />{job.status}</span>{job.error && <small className="job-error">{job.error}</small>}</div></td>
                    <td><span className="created-time">{relativeTime(job.createdAt)}</span></td>
                    <td className="job-actions">
                      {job.status === 'completed' && <button type="button" onClick={() => void downloadJob(job)}>Download</button>}
                      {job.status === 'failed' && <button type="button" onClick={() => void retryJob(job.id)}>Retry</button>}
                      {(job.status === 'queued' || job.status === 'processing') && <span className="working-dots" aria-label="Working">...</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <footer><span>DataForge</span><span>Files are private and encrypted in transit.</span></footer>
    </div>
  )
}

export default App