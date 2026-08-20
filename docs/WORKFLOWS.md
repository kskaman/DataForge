# DataForge Workflows

This guide explains the application by following objects through modules and functions. Start with the frontend map, then open the diagram for the feature you are changing.

## Frontend Modules

```mermaid
flowchart TD
    App["App.tsx<br/>page composition and errors"]
    Header["components/AppHeader.tsx<br/>navigation and service state"]
    Feed["hooks/useActivityFeed.ts<br/>polling and activity actions"]
    Workspace["features/conversion/ConversionWorkspace.tsx<br/>conversion state and API orchestration"]
    Files["FileSelection.tsx<br/>drop, select, remove"]
    Analysis["AnalysisSummary.tsx<br/>schemas and faults"]
    Output["OutputSettings.tsx<br/>strategy and format controls"]
    Activity["features/activity/ActivityTable.tsx<br/>jobs, batches, actions"]
    API["api.ts<br/>HTTP contracts"]
    Format["utils/format.ts<br/>bytes and relative time"]

    App --> Header
    App --> Feed
    App --> Workspace
    App --> Activity
    Workspace --> Files
    Workspace --> Analysis
    Workspace --> Output
    Workspace --> API
    Feed --> API
    Activity --> Format
    Files --> Format
```

`App.tsx` decides which page is visible and connects feature callbacks. Feature state belongs in the feature module; transport details belong in `api.ts`; display-only transformations belong in `utils`.

## Guest Identity

Every API object belongs to one anonymous browser. The raw guest token is never stored in a job or returned in JSON.

```mermaid
sequenceDiagram
    actor Browser
    participant API as Express /api
    participant Guest as guestSession middleware
    participant Token as guest-session.ts
    participant Handler as job/batch controller
    participant Store as owner-scoped store

    Browser->>API: Request with credentials
    API->>Guest: guestSession(request)
    Guest->>Token: readGuestToken(Cookie)
    alt Missing or invalid token
        Token-->>Guest: no token
        Guest->>Token: createGuestToken()
        Guest-->>Browser: Set-Cookie HttpOnly, SameSite=Lax
    else Valid token
        Token-->>Guest: existing token
    end
    Guest->>Token: ownerIdFromToken(token)
    Token-->>Guest: HMAC ownerId
    Guest->>Handler: request.guestOwnerId
    Handler->>Store: list/get ForOwner(ownerId)
    Store-->>Handler: only owned records
    Handler-->>Browser: redacted public objects
```

Key functions:

- `guestSession()` creates or refreshes the cookie and sets `request.guestOwnerId`.
- `ownerIdFromToken()` derives the persisted owner identifier.
- `listJobsForOwner()`, `getJobForOwner()`, `listBatchesForOwner()`, and `getBatchForOwner()` enforce isolation.
- `toPublicJob()` and `toPublicBatchJob()` remove owner IDs and server paths.

## Batch Analysis

Uploading files does not immediately choose an output. The first stage scans every CSV/workbook and returns schemas or all detected faults.

```mermaid
sequenceDiagram
    actor User
    participant Files as FileSelection
    participant Workspace as ConversionWorkspace
    participant Client as api.createBatch
    participant Route as uploadBatch middleware
    participant Controller as createBatchHandler
    participant Service as batch-service
    participant Dataset as readDatasets
    participant Store as batch-store
    participant Feed as useActivityFeed

    User->>Files: Drop CSV/XLSX files
    Files->>Workspace: onFiles(FileList)
    Workspace->>Workspace: validationError(files)
    User->>Workspace: Analyze files
    Workspace->>Client: createBatch(files)
    Client->>Route: POST /api/batches
    Route->>Route: stream files to batch-sources
    Route->>Controller: createBatchHandler(request)
    Controller->>Service: createBatch(files, ownerId)
    Service->>Store: saveBatch(status=analyzing)
    Service->>Service: queueAnalysis(id)
    Service-->>Workspace: 202 PublicBatchJob

    loop Every source file
        Service->>Dataset: readDatasets(path, name)
        Dataset-->>Service: Dataset[]
        Service->>Service: normalize headers, group schemas, collect faults
    end

    alt Any blocking fault
        Service->>Store: saveBatch(status=failed, faults)
    else Analysis valid
        Service->>Store: saveBatch(status=awaiting_configuration, schemaGroups)
    end

    loop Every 2 seconds
        Feed->>Client: getBatches()
        Client-->>Feed: current guest batches
    end
    Feed-->>Workspace: updated batch prop
```

## Output Configuration and Processing

The scan result determines the labels shown by `OutputSettings`, but the user still explicitly chooses the output strategy.

```mermaid
flowchart TD
    UI["OutputSettings<br/>strategy + format/layout"]
    Create["ConversionWorkspace.createOutput()"]
    API["api.configureBatch()"]
    Controller["configureBatchHandler()"]
    Configure["batch-service.configureBatch()"]
    Queue["queueBatch(id)"]
    Process["processBatch(id)"]
    Load["loadBatchDatasets()"]
    Result{"createBatchResult()<br/>strategy"}
    Separate["separate<br/>datasetContent per dataset<br/>createArchive"]
    Merge["merge<br/>alignDataset by header<br/>one file or grouped ZIP"]
    SQLite["sqlite<br/>createSqliteResult<br/>per-source or grouped tables"]
    Publish["atomic temporary-file rename"]
    Complete["saveBatch(status=completed)"]
    Cleanup["remove uploaded sources"]
    Failed["saveBatch(status=failed, fault)"]

    UI --> Create --> API --> Controller --> Configure --> Queue --> Process --> Load --> Result
    Result -->|separate| Separate --> Publish
    Result -->|merge| Merge --> Publish
    Result -->|sqlite| SQLite --> Publish
    Publish -->|success| Complete --> Cleanup
    Separate -. error .-> Failed
    Merge -. error .-> Failed
    SQLite -. error .-> Failed
```

The final path is assigned only after a temporary result is complete. This prevents a partial archive, merged file, or database from becoming downloadable.

## Activity Polling and History

```mermaid
sequenceDiagram
    participant App
    participant Feed as useActivityFeed
    participant API as api.ts
    participant Jobs as GET /api/jobs
    participant Batches as GET /api/batches
    participant Health as GET /health
    participant Table as ActivityTable

    App->>Feed: useActivityFeed()
    loop Initial load and every 2 seconds
        par Load owned jobs
            Feed->>API: getJobs()
            API->>Jobs: request with guest cookie
            Jobs-->>Feed: ConversionJob[]
        and Load owned batches
            Feed->>API: getBatches()
            API->>Batches: request with guest cookie
            Batches-->>Feed: BatchJob[]
        and Check service
            Feed->>API: checkHealth()
            API->>Health: GET
            Health-->>Feed: status
        end
        Feed->>Feed: setJobs, setBatches, setServiceOnline
    end
    Feed-->>App: activity state and actions
    App->>Table: jobs, batches, callbacks
```

## Download

Downloads require both the owning guest cookie and a short-lived HMAC signature.

```mermaid
sequenceDiagram
    actor User
    participant Table as ActivityTable
    participant Feed as useActivityFeed
    participant API as api.ts
    participant Controller as job/batch controller
    participant Token as download-token.ts
    participant Browser

    User->>Table: Download
    Table->>Feed: downloadJob(id) or downloadBatch(id)
    Feed->>API: getDownloadUrl(id)
    API->>Controller: GET resource/:id/download + guest cookie
    Controller->>Controller: getForOwner(id, ownerId)
    Controller->>Token: signDownload(id, expires)
    Token-->>Controller: signed URL
    Controller-->>Feed: URL valid for 5 minutes
    Feed->>Browser: window.location.assign(URL)
    Browser->>Controller: signed URL + guest cookie
    Controller->>Controller: owner lookup + hasValidSignature()
    Controller-->>Browser: response.download(resultPath)
```

Another guest receives `404` even if they obtain the signed URL.

## Retry and Recovery

```mermaid
stateDiagram-v2
    state "Single job" as Job {
        [*] --> queued
        queued --> processing
        processing --> completed
        processing --> failed
        failed --> queued: retryJob
    }

    state "Batch" as Batch {
        [*] --> analyzing
        analyzing --> awaiting_configuration: schemas valid
        analyzing --> failed: faults found
        awaiting_configuration --> queued: configureBatch
        queued --> processing
        processing --> completed
        processing --> failed
        failed --> analyzing: retryBatch
        analyzing --> queued: saved configuration still valid
    }
```

At server startup, `initializeJobs()` returns queued/processing jobs to `queued`, and `initializeBatches()` resumes analyzing or configured work. Retries keep the original `expiresAt`; they do not create a new 24-hour window.

## Retention and Cleanup

```mermaid
flowchart LR
    Created["Created<br/>expiresAt = now + 24h"]
    Processing["Processing"]
    Success["Completed result persisted"]
    SourceDelete["Source files removed immediately"]
    Failure["Failed or awaiting configuration"]
    KeepSource["Sources kept for retry"]
    Hourly["Hourly cleanupExpiredJobs/Batches"]
    Expired{"expiresAt <= now?"}
    Delete["Remove sources, results, and JSON record"]
    Keep["Keep until next check"]

    Created --> Processing
    Processing -->|success| Success --> SourceDelete
    Processing -->|failure| Failure --> KeepSource
    Hourly --> Expired
    Expired -->|yes| Delete
    Expired -->|no| Keep
```

Downloads and retries do not extend expiry. Clearing the guest cookie makes existing records inaccessible to that browser, but normal cleanup still removes them at their deadline.

## Legacy Single-File API

The current conversion screen uses the batch workflow even for one selected file. The single-job API remains available for compatibility and appears in the shared activity table.

```mermaid
flowchart LR
    Post["POST /api/jobs<br/>createJobHandler"]
    Create["job-service.createJob"]
    Store["saveJob queued"]
    Queue["queueJob"]
    Convert["conversion-service.convertJob"]
    Read["dataset-service.readDatasets"]
    Result["CSV / TSV / JSON / ZIP"]
    Complete["saveJob completed"]
    Cleanup["remove source"]

    Post --> Create --> Store --> Queue --> Convert --> Read --> Result --> Complete --> Cleanup
```

## Keeping This Guide Current

Update this document when any of these change:

- a route is added or removed;
- a job or batch state transition changes;
- ownership, signing, retention, or cleanup behavior changes;
- a frontend responsibility moves between modules;
- a new output strategy is introduced.

Diagrams should name the function that decides behavior, not every helper it calls. That keeps them useful without duplicating source code line by line.