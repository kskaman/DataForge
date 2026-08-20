# DataForge backend

Local Node.js and TypeScript API for the DataForge frontend.

## Run locally

```powershell
npm install
npm run dev
```

The API listens on `http://localhost:4000`. In another terminal, start the frontend from `../frontend` with `npm run dev`. Vite proxies `/api` and `/health` to the backend.

Optional environment variables are listed in `.env.example`. Set them in the shell or deployment environment before starting the process.

## API

- `GET /health` checks service availability.
- `GET /api/jobs` returns conversion history.
- `GET /api/jobs/:id` returns one job.
- `POST /api/jobs` accepts multipart fields `file`, `format`, and `splitSheets`.
- `POST /api/jobs/:id/retry` retries a failed job.
- `GET /api/jobs/:id/download` creates a five-minute signed download link.

Files and JSON job records are stored under `storage/` and removed 24 hours after upload. The local worker runs inside the API process. The AWS phase can replace these adapters with S3, DynamoDB, and SQS/Lambda while preserving the HTTP contract.

## Verify

With the API running:

```powershell
npm run typecheck
npm run test:smoke
```

The smoke test verifies CSV-to-JSON and multi-sheet XLSX-to-ZIP conversions, including signed result downloads.