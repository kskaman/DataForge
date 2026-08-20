import type { DragEvent, RefObject } from 'react'
import { formatBytes } from '../../utils/format'

type FileSelectionProps = {
  files: File[]
  totalSize: number
  isDragging: boolean
  locked: boolean
  inputRef: RefObject<HTMLInputElement | null>
  onFiles: (files: FileList) => void
  onRemove: (index: number) => void
  onDraggingChange: (dragging: boolean) => void
}

export function FileSelection({
  files,
  totalSize,
  isDragging,
  locked,
  inputRef,
  onFiles,
  onRemove,
  onDraggingChange,
}: FileSelectionProps) {
  const dropFiles = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    onDraggingChange(false)
    onFiles(event.dataTransfer.files)
  }

  return (
    <div
      className={`drop-zone${isDragging ? ' dragging' : ''}${files.length ? ' has-file' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); onDraggingChange(true) }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => onDraggingChange(false)}
      onDrop={dropFiles}
    >
      <input ref={inputRef} type="file" accept=".xlsx,.csv" multiple onChange={(event) => event.target.files && onFiles(event.target.files)} />
      {files.length ? (
        <div className="selected-files">
          <div className="selected-files-summary"><strong>{files.length} file{files.length === 1 ? '' : 's'}</strong><span>{formatBytes(totalSize)} total</span></div>
          <div className="selected-files-list">
            {files.map((file, index) => (
              <div className="selected-file" key={`${file.name}-${file.size}-${index}`}>
                <div className="file-type">{file.name.split('.').pop()?.toUpperCase()}</div>
                <div><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div>
                <button type="button" disabled={locked} onClick={() => onRemove(index)} aria-label={`Remove ${file.name}`}>x</button>
              </div>
            ))}
          </div>
          {!locked && <button className="add-files" type="button" onClick={() => inputRef.current?.click()}>Add files</button>}
        </div>
      ) : (
        <button className="drop-action" type="button" onClick={() => inputRef.current?.click()}>
          <span className="upload-symbol" aria-hidden="true">+</span><strong>Drop spreadsheets here</strong><span>or choose files</span><small>20 files, 50 MB each, 200 MB total</small>
        </button>
      )}
    </div>
  )
}