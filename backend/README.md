# DataForge backend

Local Node.js and TypeScript API for the DataForge frontend.

## Run locally

```powershell
npm install
npm run dev
```

The API listens on `http://localhost:4000`. In another terminal, start the frontend from `../frontend` with `npm run dev`. Vite proxies `/api` and `/health` to the backend.

Optional environment variables are listed in `.env.example`. Set them in the shell or deployment environment before starting the process.

Production should serve the frontend and API from the same site through a reverse proxy. Set `GUEST_SESSION_SECRET` to a long random value; startup fails in production when it is missing. Anonymous history is associated with an `HttpOnly` browser cookie and cannot be recovered after that cookie is cleared.

## API

- `GET /health/live` checks process liveness.
- `GET /health/ready` verifies initialization, local storage access, and the in-process queue.
- `GET /health` aliases the readiness check for infrastructure compatibility.
- `GET /api/activity` returns the current browser's jobs and batches in one response.
- `GET /api/jobs` returns conversion history.
- `GET /api/jobs/:id` returns one job.
- `POST /api/jobs` accepts multipart fields `file`, `format`, and `splitSheets`.
- `POST /api/jobs/:id/retry` retries a failed job.
- `GET /api/jobs/:id/download` creates a five-minute signed download link.
- `GET /api/batches` returns the current browser's batch history.
- `POST /api/batches` uploads up to 20 files for schema analysis.
- `POST /api/batches/:id/configure` creates converted, merged, or SQLite output.
- `GET /api/batches/:id/download` creates a five-minute signed batch download link.

History and downloadable results expire 24 hours after creation; retry and download activity do not extend that deadline. Successful processing removes uploaded source files immediately. Failed and unfinished sources remain available for retry until the same expiry. Every job, batch, retry, configuration, and download operation is restricted to the anonymous guest cookie that created it.

The frontend refreshes `/api/activity` every 2 seconds while work is active and every 30 seconds while idle. It pauses in hidden tabs and backs off after failures. Successful routine activity and health reads are omitted from request-completion logs; failures and all mutation/lifecycle events remain logged.

The local worker runs inside the API process. The AWS phase can replace these adapters with S3, DynamoDB, and SQS/Lambda while preserving the HTTP contract.

## Verify

With the API running:

```powershell
npm run typecheck
npm test
npm run test:smoke
```

The tests cover guest-token handling and public-data redaction. The smoke test verifies isolated guest histories, ownership-protected signed downloads, source cleanup, CSV-to-JSON, multi-sheet XLSX-to-ZIP, merged batches, SQLite output, and invalid batch reporting.

See [`../docs/WORKFLOWS.md`](../docs/WORKFLOWS.md) for architecture and data-flow diagrams covering guest identity, analysis, output processing, downloads, retry, recovery, and cleanup.

See [`../docs/OBSERVABILITY.md`](../docs/OBSERVABILITY.md) for request correlation, structured log events, health probes, and the future CloudWatch metric/alarm plan.
