# Concerns

This file contains the tasks and questions that are not yet resolved.

- we can also support tsv and json files for input files. (`batch-service.js` and `job-service.js`)
- The functionality `cleanUpExpiredJobs` and `cleanUpExpiredBatches` executes only when the server is started. It should be scheduled to run periodically, e.g., every hour, to clean up expired jobs and batches.
- There is no database but local storage of jobs and batches. The storage is not yet abstracted, so the backend cannot be deployed to AWS without a rewrite. The storage should be abstracted to allow S3, DynamoDB, and SQS/Lambda to replace the local filesystem and in-memory queue.

