import { useRef, useState } from 'react'
import {
    configureBatch,
    createBatch,
    type BatchJob,
    type BatchStrategy,
    type OutputFormat,
} from '../../api'
import { AnalysisSummary } from './AnalysisSummary'
import { FileSelection } from './FileSelection'
import { OutputSettings } from './OutputSettings'

const MAX_FILE_SIZE = 50 * 1024 * 1024
const MAX_BATCH_SIZE = 200 * 1024 * 1024
const MAX_BATCH_FILES = 20

type ConversionWorkspaceProps = {
    batches: BatchJob[]
    onBatchChange: (batch: BatchJob) => void
    onError: (message: string) => void
}

function validationError(files: File[]) {
    const invalid = files.find(
        (file) => !['xlsx', 'csv'].includes(file.name.split('.').pop()?.toLowerCase() ?? ''),
    )
    if (invalid) return 'Choose only .xlsx or .csv files.'
    if (files.some((file) => file.size > MAX_FILE_SIZE)) return 'File size must be 50 MB or less.'
    if (files.length > MAX_BATCH_FILES) return `Choose no more than ${MAX_BATCH_FILES} files.`
    if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_SIZE)
        return 'Batch size must be 200 MB or less.'
    return ''
}

export function ConversionWorkspace({ batches, onBatchChange, onError }: ConversionWorkspaceProps) {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [draftBatchId, setDraftBatchId] = useState<string | null>(null)
    const [format, setFormat] = useState<OutputFormat>('CSV')
    const [strategy, setStrategy] = useState<BatchStrategy>('separate')
    const [sqliteLayout, setSqliteLayout] = useState<'per_source' | 'grouped'>('per_source')
    const [isDragging, setIsDragging] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const draftBatch = batches.find((batch) => batch.id === draftBatchId) ?? null

    const chooseFiles = (incoming: FileList) => {
        const combined = [...selectedFiles, ...Array.from(incoming)]
        const error = validationError(combined)
        if (error) return onError(error)
        setSelectedFiles(combined)
        setDraftBatchId(null)
        onError('')
    }

    const analyzeFiles = async () => {
        if (selectedFiles.length === 0)
            return onError('Select one or more spreadsheets before analysis.')
        setIsSubmitting(true)
        try {
            const batch = await createBatch(selectedFiles)
            onBatchChange(batch)
            setDraftBatchId(batch.id)
            onError('')
        } catch (error) {
            onError(error instanceof Error ? error.message : 'Upload failed.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const createOutput = async () => {
        if (!draftBatch || draftBatch.status !== 'awaiting_configuration') return
        setIsSubmitting(true)
        try {
            const configuration =
                strategy === 'sqlite' ? { strategy, sqliteLayout } : { strategy, format }
            onBatchChange(await configureBatch(draftBatch.id, configuration))
            setDraftBatchId(null)
            setSelectedFiles([])
            onError('')
            if (inputRef.current) inputRef.current.value = ''
        } catch (error) {
            onError(error instanceof Error ? error.message : 'Batch configuration failed.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <section className="conversion-layout">
            <div className="upload-panel">
                <div className="panel-heading">
                    <span className="step-number">01</span>
                    <div>
                        <h2>Source files</h2>
                        <p>Analyze spreadsheets before choosing an output</p>
                    </div>
                </div>
                <FileSelection
                    files={selectedFiles}
                    totalSize={selectedFiles.reduce((sum, file) => sum + file.size, 0)}
                    isDragging={isDragging}
                    locked={Boolean(draftBatch)}
                    inputRef={inputRef}
                    onFiles={chooseFiles}
                    onRemove={(index) =>
                        setSelectedFiles((current) =>
                            current.filter((_file, itemIndex) => itemIndex !== index),
                        )
                    }
                    onDraggingChange={setIsDragging}
                />
                {draftBatch && <AnalysisSummary batch={draftBatch} />}
            </div>
            <OutputSettings
                batch={draftBatch}
                strategy={strategy}
                format={format}
                sqliteLayout={sqliteLayout}
                isSubmitting={isSubmitting}
                hasFiles={selectedFiles.length > 0}
                onStrategyChange={setStrategy}
                onFormatChange={setFormat}
                onSqliteLayoutChange={setSqliteLayout}
                onSubmit={() =>
                    void (draftBatch?.status === 'awaiting_configuration'
                        ? createOutput()
                        : analyzeFiles())
                }
            />
        </section>
    )
}
