import { useEffect, useRef, useState } from 'react'
import {
    getActivity,
    getBatchDownloadUrl,
    getDownloadUrl,
    retryBatch,
    retryConversion,
    type BatchJob,
    type ConversionJob,
} from '../api'

const ACTIVE_POLL_INTERVAL = 2_000
const IDLE_POLL_INTERVAL = 30_000
const MAX_BACKOFF_INTERVAL = 60_000

function hasActiveWork(jobs: ConversionJob[], batches: BatchJob[]) {
    return (
        jobs.some((job) => ['queued', 'processing'].includes(job.status)) ||
        batches.some((batch) => ['analyzing', 'queued', 'processing'].includes(batch.status))
    )
}

export function useActivityFeed() {
    const [jobs, setJobs] = useState<ConversionJob[]>([])
    const [batches, setBatches] = useState<BatchJob[]>([])
    const [serviceOnline, setServiceOnline] = useState(false)
    const refreshNow = useRef<() => void>(() => undefined)

    useEffect(() => {
        let disposed = false
        let inFlight = false
        let failures = 0
        let timer: number | undefined

        const clearTimer = () => {
            if (timer !== undefined) window.clearTimeout(timer)
            timer = undefined
        }

        const schedule = (delay: number) => {
            clearTimer()
            if (disposed || document.hidden) return
            timer = window.setTimeout(() => void refresh(), delay)
        }

        const refresh = async () => {
            if (disposed || document.hidden || inFlight) return
            inFlight = true
            let nextDelay = IDLE_POLL_INTERVAL

            try {
                const activity = await getActivity()
                if (!disposed) {
                    setJobs(activity.jobs)
                    setBatches(activity.batches)
                    setServiceOnline(true)
                    failures = 0
                    nextDelay = hasActiveWork(activity.jobs, activity.batches)
                        ? ACTIVE_POLL_INTERVAL
                        : IDLE_POLL_INTERVAL
                }
            } catch {
                if (!disposed) {
                    setServiceOnline(false)
                    failures += 1
                    nextDelay = Math.min(
                        ACTIVE_POLL_INTERVAL * 2 ** (failures - 1),
                        MAX_BACKOFF_INTERVAL,
                    )
                }
            } finally {
                inFlight = false
                schedule(nextDelay)
            }
        }

        const resume = () => {
            if (!document.hidden) void refresh()
        }

        const visibilityChanged = () => {
            if (document.hidden) clearTimer()
            else void refresh()
        }

        refreshNow.current = () => void refresh()
        void refresh()
        document.addEventListener('visibilitychange', visibilityChanged)
        window.addEventListener('focus', resume)

        return () => {
            disposed = true
            clearTimer()
            refreshNow.current = () => undefined
            document.removeEventListener('visibilitychange', visibilityChanged)
            window.removeEventListener('focus', resume)
        }
    }, [])

    const upsertBatch = (batch: BatchJob) => {
        setBatches((current) => [batch, ...current.filter((item) => item.id !== batch.id)])
        refreshNow.current()
    }

    const retryJob = async (jobId: string) => {
        const retriedJob = await retryConversion(jobId)
        setJobs((current) => current.map((job) => (job.id === jobId ? retriedJob : job)))
        refreshNow.current()
    }

    const retryBatchJob = async (batchId: string) => {
        const retriedBatch = await retryBatch(batchId)
        setBatches((current) =>
            current.map((batch) => (batch.id === batchId ? retriedBatch : batch)),
        )
        refreshNow.current()
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
