# DataForge Observability

DataForge writes one structured JSON object per line to standard output or standard error. This works locally and is ready for container log collection later without adding an AWS SDK to the application.

## Request Correlation

Every HTTP request receives an `X-Request-ID` response header. A caller-provided `X-Request-ID` is accepted when it contains 1-128 letters, numbers, dots, underscores, colons, or hyphens; otherwise the API generates a UUID.

The request ID is copied into queued job and batch records so asynchronous analysis and conversion events can be connected to the initiating HTTP request. It is private server metadata and is removed from API responses.

Do not log guest cookies, raw guest tokens, download signatures, uploaded contents, request headers, or filesystem paths.

## Events

All events contain `timestamp`, `level`, `service`, `environment`, and `event`.

| Event                                                | Important fields                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `request.completed`                                  | `requestId`, `method`, `path`, `statusCode`, `durationMs`, `inputBytes`, `outputBytes`          |
| `request.aborted`                                    | `requestId`, `method`, `path`, `durationMs`                                                     |
| `request.failed`                                     | `requestId`, `method`, `path`, `errorName`, `errorMessage`                                      |
| `job.queued` / `job.processing`                      | `requestId`, `jobId`, `outputFormat`, `inputBytes`, `queueWaitMs`                               |
| `job.completed` / `job.failed`                       | previous fields plus `outputBytes`, `processingDurationMs`, `successCount`, `failureCount`      |
| `batch.analysis_queued` / `batch.analysis_started`   | `requestId`, `batchId`, `fileCount`, `inputBytes`, `queueWaitMs`                                |
| `batch.analysis_completed` / `batch.analysis_failed` | previous fields plus `analysisDurationMs`, `datasets`, `schemaGroups`, `faults`, outcome counts |
| `batch.queued` / `batch.processing`                  | `requestId`, `batchId`, `strategy`, `outputFormat`, byte and queue fields                       |
| `batch.completed` / `batch.failed`                   | previous fields plus `datasetCount`, `outputBytes`, `processingDurationMs`, outcome counts      |

`successCount` and `failureCount` are numeric `0` or `1` fields. Group completion events by `outputFormat` to calculate success and failure counts per format.

Successful `GET /api/activity` and health requests are intentionally omitted from `request.completed` logs to control log volume. Their `4xx`/`5xx` responses, aborted requests, uploads, configurations, retries, downloads, and all processing lifecycle events remain logged.

## Health Endpoints

- `GET /health/live` is the liveness probe. It proves that the HTTP process and event loop can respond.
- `GET /health/ready` is the readiness probe. It checks startup initialization, read/write access to every local persistence directory, and the current in-process queue provider.
- `GET /health` is an alias for readiness for infrastructure compatibility.

Health responses use `Cache-Control: no-store, max-age=0`. Browsers derive service availability from `/api/activity`; only infrastructure should poll health endpoints.

Liveness should restart an unresponsive container. Readiness should remove an instance from service without restarting it solely for a temporary dependency failure.

## Inspect Locally

Start the backend and send a known correlation ID to a non-routine endpoint:

```powershell
npm --prefix .\backend run dev

Invoke-WebRequest -SkipHttpErrorCheck `
	-Headers @{ 'X-Request-ID' = 'local-check-001' } `
	http://localhost:4000/api/jobs/not-found |
	Select-Object StatusCode, Headers, Content
```

The backend terminal prints a warning-level `request.completed` JSON line with `requestId: local-check-001`. Use the same header on an upload request to find the associated `job.*` or `batch.*` lifecycle events.

## Activity Refresh Policy

The browser requests jobs and batches together through `GET /api/activity`:

- every 2 seconds while a job or batch is analyzing, queued, or processing;
- every 30 seconds while no work is active;
- immediately after an upload/retry and when a tab becomes visible or focused;
- never while the tab is hidden;
- with exponential failure backoff from 2 seconds up to 60 seconds.

This replaces three fixed requests (`jobs`, `batches`, and `health`) every 2 seconds with one adaptive request.

## CloudWatch Plan

No AWS resources are created yet. After deployment, collect container stdout/stderr with CloudWatch Logs and create metric filters from these JSON fields:

| Metric                  | Filter/source                                                   | Suggested alarm                          |
| ----------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| HTTP 5xx count          | `event=request.completed`, `statusCode >= 500`                  | At least 5 in 5 minutes                  |
| Conversion failures     | Sum `failureCount` on `job.failed` and `batch.failed`           | At least 3 in 10 minutes                 |
| Successes by format     | Sum `successCount`, grouped by `outputFormat`                   | Dashboard only                           |
| P95 request latency     | `request.completed.durationMs`                                  | Greater than 2 seconds for 10 minutes    |
| P95 queue wait          | `job.processing.queueWaitMs` and `batch.processing.queueWaitMs` | Greater than 30 seconds for 10 minutes   |
| P95 processing duration | completion `processingDurationMs`                               | Baseline first, then alert on regression |
| Readiness failures      | Load balancer health check on `/health/ready`                   | Any unhealthy task                       |

Use low-cardinality dimensions such as `service`, `environment`, `event`, `outputFormat`, and `strategy`. Do not use `requestId`, `jobId`, `batchId`, filenames, or paths as metric dimensions; keep those only for log searches.

Useful CloudWatch Logs Insights query after deployment:

```text
fields @timestamp, requestId, event, jobId, batchId, outputFormat, durationMs, queueWaitMs, processingDurationMs, errorMessage
| filter requestId = "replace-with-request-id"
| sort @timestamp asc
```
