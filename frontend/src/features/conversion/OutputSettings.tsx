import type { BatchJob, BatchStrategy, OutputFormat } from '../../api'

type SqliteLayout = 'per_source' | 'grouped'

type OutputSettingsProps = {
  batch: BatchJob | null
  strategy: BatchStrategy
  format: OutputFormat
  sqliteLayout: SqliteLayout
  isSubmitting: boolean
  hasFiles: boolean
  onStrategyChange: (strategy: BatchStrategy) => void
  onFormatChange: (format: OutputFormat) => void
  onSqliteLayoutChange: (layout: SqliteLayout) => void
  onSubmit: () => void
}

export function OutputSettings({
  batch,
  strategy,
  format,
  sqliteLayout,
  isSubmitting,
  hasFiles,
  onStrategyChange,
  onFormatChange,
  onSqliteLayoutChange,
  onSubmit,
}: OutputSettingsProps) {
  const analysisReady = batch?.status === 'awaiting_configuration'

  return (
    <aside className="settings-panel">
      <div className="panel-heading"><span className="step-number">02</span><div><h2>Output</h2><p>{analysisReady ? 'Choose a strategy for the analyzed data' : 'Available after analysis'}</p></div></div>
      {analysisReady && <div className="strategy-options" role="radiogroup" aria-label="Output strategy">
        {([['separate', 'Converted ZIP'], ['merge', batch.schemaGroups.length === 1 ? 'Merged table' : 'Grouped tables'], ['sqlite', 'SQLite database']] as const).map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={strategy === value} className={strategy === value ? 'strategy-option selected' : 'strategy-option'} onClick={() => onStrategyChange(value)}>{label}</button>
        ))}
      </div>}
      {analysisReady && strategy !== 'sqlite' && <div className="format-options" role="radiogroup" aria-label="Output format">
        {(['CSV', 'TSV', 'JSON'] as OutputFormat[]).map((option) => (
          <button key={option} type="button" role="radio" aria-checked={format === option} className={format === option ? 'format-option selected' : 'format-option'} onClick={() => onFormatChange(option)}>
            <span className="radio-dot" /><span><strong>{option}</strong><small>{option === 'JSON' ? 'Structured records' : option === 'TSV' ? 'Tab delimited' : 'Universal tables'}</small></span>
          </button>
        ))}
      </div>}
      {analysisReady && strategy === 'sqlite' && <div className="format-options" role="radiogroup" aria-label="SQLite layout">
        <button type="button" role="radio" aria-checked={sqliteLayout === 'per_source'} className={sqliteLayout === 'per_source' ? 'format-option selected' : 'format-option'} onClick={() => onSqliteLayoutChange('per_source')}><span className="radio-dot" /><span><strong>One table per source</strong><small>Each CSV or sheet stays separate</small></span></button>
        <button type="button" role="radio" aria-checked={sqliteLayout === 'grouped'} className={sqliteLayout === 'grouped' ? 'format-option selected' : 'format-option'} onClick={() => onSqliteLayoutChange('grouped')}><span className="radio-dot" /><span><strong>Group compatible data</strong><small>One table per detected schema</small></span></button>
      </div>}
      <button className="convert-button" type="button" onClick={onSubmit} disabled={isSubmitting || !hasFiles || batch?.status === 'analyzing' || batch?.status === 'failed'}>{isSubmitting ? 'Working...' : analysisReady ? 'Create output' : batch?.status === 'analyzing' ? 'Analyzing...' : 'Analyze files'} <span aria-hidden="true">-&gt;</span></button>
      <p className="retention-note">Sources are removed after processing. Results and this browser's history expire 24 hours after creation.</p>
    </aside>
  )
}