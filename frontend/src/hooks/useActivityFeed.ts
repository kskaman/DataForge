import { useEffect, useState } from 'react'
import {
    checkHealth,
    getBatchDownloadUrl,
    getBatches,
    getDownloadUrl,
    getJobs,
    retryBatch,
    retryConversion,
    type BatchJob,
    type ConversionJob,
} from '../api'

export function useActivityFeed() {
    const [jobs, setJobs] = useState<ConversionJob[]>([])
    const [batches, setBatches] = useState<BatchJob[]>([])
    const [serviceOnline, setServiceOnline] = useState(false)

    useEffect(() => {
        let active = true
        const refresh = async () => {
            try {
                const [nextJobs, nextBatches] = await Promise.all([
                    getJobs(),
                    getBatches(),
                    checkHealth(),
                ])
                if (active) {
                    setJobs(nextJobs)
                    setBatches(nextBatches)
                    setServiceOnline(true)
                }
            } catch {
                if (active) setServiceOnline(false)
            }
        }
        void refresh()
        const interval = window.setInterval(() => void refresh(), 2000)
        return () => {
            active = false
            window.clearInterval(interval)
        }
    }, [])

    const upsertBatch = (batch: BatchJob) => {
        setBatches((current) => [batch, ...current.filter((item) => item.id !== batch.id)])
    }

    const retryJob = async (jobId: string) => {
        const retriedJob = await retryConversion(jobId)
        setJobs((current) => current.map((job) => (job.id === jobId ? retriedJob : job)))
    }

    const retryBatchJob = async (batchId: string) => {
        const retriedBatch = await retryBatch(batchId)
        setBatches((current) =>
            current.map((batch) => (batch.id === batchId ? retriedBatch : batch)),
        )
    }

    const downloadJob = async (jobId: string) => {
        window.location.assign(await getDownloadUrl(jobId))
    }

    const downloadBatch = async (batchId: string) => {
        window.location.assign(await getBatchDownloadUrl(batchId))
    }

    const processingCount =
        jobs.filter((job) => ['queued', 'processing'].includes(job.status)).length +
        batches.filter((batch) => ['analyzing', 'queued', 'processing'].includes(batch.status))
            .length

    return {
        jobs,
        batches,
        serviceOnline,
        processingCount,
        upsertBatch,
        retryJob,
        retryBatchJob,
        downloadJob,
        downloadBatch,
    }
}
