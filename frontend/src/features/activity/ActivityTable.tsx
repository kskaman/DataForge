import type { BatchJob, ConversionJob } from '../../api'
import { formatBytes, relativeTime } from '../../utils/format'

type ActivityTableProps = {
    jobs: ConversionJob[]
    batches: BatchJob[]
    historyView: boolean
    onViewAll: () => void
    onDownloadJob: (jobId: string) => void
    onRetryJob: (jobId: string) => void
    onDownloadBatch: (batchId: string) => void
    onRetryBatch: (batchId: string) => void
}

export function ActivityTable({
    jobs,
    batches,
    historyView,
    onViewAll,
    onDownloadJob,
    onRetryJob,
    onDownloadBatch,
    onRetryBatch,
}: ActivityTableProps) {
    return (
        <section className={historyView ? 'jobs-section history-view' : 'jobs-section'}>
            <div className="section-heading">
                <div>
                    <h2>{historyView ? 'All conversions' : 'Recent activity'}</h2>
                    <p>Updates automatically while files are processed</p>
                </div>
                {!historyView && (
                    <button type="button" onClick={onViewAll}>
                        View all
                    </button>
                )}
            </div>
            <div className="jobs-table-wrap">
                <table className="jobs-table">
                    <thead>
                        <tr>
                            <th>File</th>
                            <th>Output</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th>
                                <span className="sr-only">Actions</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {batches.map((batch) => (
                            <tr key={`batch-${batch.id}`}>
                                <td>
                                    <div className="job-file">
                                        <span>B</span>
                                        <div>
                                            <strong>{batch.fileName}</strong>
                                            <small>
                                                {batch.fileCount} files ·{' '}
                                                {formatBytes(batch.fileSize)}
                                            </small>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span className="output-label">
                                        {batch.configuration?.strategy === 'sqlite'
                                            ? 'SQLite'
                                            : batch.configuration?.strategy === 'merge'
                                              ? 'Merged'
                                              : batch.configuration
                                                ? `${batch.configuration.format} / ZIP`
                                                : 'Analysis'}
                                    </span>
                                </td>
                                <td>
                                    <div>
                                        <span className={`status status-${batch.status}`}>
                                            <i />
                                            {batch.status.replace('_', ' ')}
                                        </span>
                                        {batch.faults.map((fault, index) => (
                                            <small className="job-error" key={index}>
                                                {fault.sourceFileName}: {fault.message}
                                            </small>
                                        ))}
                                    </div>
                                </td>
                                <td>
                                    <span className="created-time">
                                        {relativeTime(batch.createdAt)}
                                    </span>
                                </td>
                                <td className="job-actions">
                                    {batch.status === 'completed' && (
                                        <button
                                            type="button"
                                            onClick={() => onDownloadBatch(batch.id)}
                                        >
                                            Download
                                        </button>
                                    )}
                                    {batch.status === 'failed' && (
                                        <button
                                            type="button"
                                            onClick={() => onRetryBatch(batch.id)}
                                        >
                                            Retry
                                        </button>
                                    )}
                                    {(['analyzing', 'queued', 'processing'] as string[]).includes(
                                        batch.status,
                                    ) && (
                                        <span className="working-dots" aria-label="Working">
                                            ...
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {jobs.map((job) => (
                            <tr key={job.id}>
                                <td>
                                    <div className="job-file">
                                        <span>{job.fileName.endsWith('.xlsx') ? 'X' : 'C'}</span>
                                        <div>
                                            <strong>{job.fileName}</strong>
                                            <small>{formatBytes(job.fileSize)}</small>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span className="output-label">
                                        {job.splitSheets ? `${job.format} / ZIP` : job.format}
                                    </span>
                                </td>
                                <td>
                                    <div>
                                        <span className={`status status-${job.status}`}>
                                            <i />
                                            {job.status}
                                        </span>
                                        {job.error && (
                                            <small className="job-error">{job.error}</small>
                                        )}
                                    </div>
                                </td>
                                <td>
                                    <span className="created-time">
                                        {relativeTime(job.createdAt)}
                                    </span>
                                </td>
                                <td className="job-actions">
                                    {job.status === 'completed' && (
                                        <button type="button" onClick={() => onDownloadJob(job.id)}>
                                            Download
                                        </button>
                                    )}
                                    {job.status === 'failed' && (
                                        <button type="button" onClick={() => onRetryJob(job.id)}>
                                            Retry
                                        </button>
                                    )}
                                    {(job.status === 'queued' || job.status === 'processing') && (
                                        <span className="working-dots" aria-label="Working">
                                            ...
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}
