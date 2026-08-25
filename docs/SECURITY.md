# DataForge Security

DataForge has no accounts. Access to history and results is bound to a random anonymous browser cookie, so deployment controls must preserve that cookie and the API's same-site boundary.

## Implemented Controls

- Helmet sends content security, MIME-sniffing, framing, referrer, and related browser headers. HSTS is enabled when `NODE_ENV=production`.
- Credentialed CORS accepts only the configured `FRONTEND_ORIGIN`.
- Unsafe browser requests are rejected when their `Origin` differs from `FRONTEND_ORIGIN` or Fetch Metadata identifies them as cross-site. Requests without browser origin metadata remain available to trusted CLI and service clients.
- The guest cookie is `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` in production. Only its HMAC-derived owner ID is persisted.
- Job, batch, retry, configuration, token, and download lookups are owner-scoped. Signed download links expire after five minutes and still require the owning guest cookie.
- API traffic is limited per guest. Upload, configuration, and retry operations have an additional per-IP limit.
- JSON, file, file-count, and aggregate batch sizes are bounded before conversion work.
- UUID parameters, download query values, multipart fields, and configuration bodies use strict schemas. Unknown fields are rejected.
- Production requires distinct guest-session and download-signing secrets of at least 32 characters. Defaults and documented placeholders are rejected.
- Unexpected production failures return stable generic messages. Detailed errors remain in structured server logs; secrets, cookies, uploaded contents, and filesystem paths must never be logged.

## Production Checklist

1. Set `NODE_ENV=production`.
2. Generate independent high-entropy values for `GUEST_SESSION_SECRET` and `DOWNLOAD_SECRET`; provide them through the deployment secret manager, not source control.
3. Set `FRONTEND_ORIGIN` to the exact public HTTPS origin. Wildcards are not supported with credentialed cookies.
4. Terminate TLS at the trusted load balancer or reverse proxy.
5. Set `TRUST_PROXY_HOPS` to the exact number of proxies between the client and Express. Leave it at `0` when clients connect directly.
6. Confirm the proxy overwrites forwarded headers rather than appending untrusted client values.
7. Tune `API_RATE_LIMIT` and `WRITE_RATE_LIMIT` from observed production traffic before launch.
8. Restrict runtime filesystem and container permissions to the directories DataForge needs.

## Environment Boundary

The backend loads `backend/.env` for local use and then exposes only the validated object from `src/config.ts`. Existing process variables take precedence over the file. Required production variables are read through `getOrThrow()`, and startup stops before listening when a required or malformed value is detected.

The frontend separately validates optional `VITE_API_URL` in `src/config.ts`. Vite embeds every `VITE_*` variable in public browser JavaScript. Backend signing secrets must only exist in the backend process or deployment secret manager and must never use a `VITE_` prefix.

## AWS Boundary

The current rate-limit counters live in each Node.js process. They are useful for accidental abuse and single-instance deployments but are not a distributed security boundary. When DataForge scales across instances, enforce public request limits at AWS WAF/API Gateway or use a shared rate-limit store.

AWS deployment must also place signing secrets in Secrets Manager or SSM Parameter Store, keep storage private, encrypt data in transit and at rest, and grant the application only the IAM actions required by its storage and queue adapters.

## Reporting

Do not include guest cookies, signed download URLs, uploaded data, or production secrets in issue reports. Use the request ID and redacted structured logs to correlate failures.
