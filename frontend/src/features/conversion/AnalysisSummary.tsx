import type { BatchJob } from '../../api'

export function AnalysisSummary({ batch }: { batch: BatchJob }) {
  const title = batch.status === 'analyzing'
    ? 'Scanning files'
    : batch.status === 'failed'
      ? 'Analysis found problems'
      : 'Analysis complete'

  return (
    <div className={`analysis-summary ${batch.status}`}>
      <div><strong>{title}</strong><span>{batch.datasets.length} datasets · {batch.schemaGroups.length} schema groups</span></div>
      {batch.schemaGroups.map((group) => <p key={group.id}><b>{group.id}</b> {group.headers.join(', ')} · {group.datasetIds.length} dataset{group.datasetIds.length === 1 ? '' : 's'}</p>)}
      {batch.faults.map((fault, index) => <p className="analysis-fault" key={`${fault.sourceFileName}-${index}`}><b>{fault.sourceFileName}{fault.sheetName ? ` / ${fault.sheetName}` : ''}</b> {fault.message}</p>)}
    </div>
  )
}