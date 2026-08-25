import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { log } from '../utils/logger.js'

const requestIdPattern = /^[a-zA-Z0-9._:-]{1,128}$/
const routineReadPaths = new Set(['/api/activity', '/health', '/health/live', '/health/ready'])

export function resolveRequestId(value: string | string[] | undefined) {
    const candidate = Array.isArray(value) ? value[0] : value
    return candidate && requestIdPattern.test(candidate) ? candidate : randomUUID()
}

function headerBytes(value: string | number | string[] | undefined) {
    const candidate = Array.isArray(value) ? value[0] : value
    const bytes = Number(candidate)
    return Number.isFinite(bytes) && bytes >= 0 ? bytes : undefined
}

export function shouldLogCompletedRequest(method: string, path: string, statusCode: number) {
    return method !== 'GET' || statusCode >= 400 || !routineReadPaths.has(path)
}

export function requestContext(request: Request, response: Response, next: NextFunction) {
    const startedAt = performance.now()
    const requestId = resolveRequestId(request.headers['x-request-id'])
    const path = request.originalUrl.split('?', 1)[0] ?? request.path
    let finished = false

    request.requestId = requestId
    response.setHeader('X-Request-ID', requestId)

    response.once('finish', () => {
        finished = true
        const statusCode = response.statusCode
        if (!shouldLogCompletedRequest(request.method, path, statusCode)) return
        log(
            statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
            'request.completed',
            {
                requestId,
                method: request.method,
                path,
                statusCode,
                durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
                inputBytes: headerBytes(request.headers['content-length']),
                outputBytes: headerBytes(response.getHeader('content-length')),
            },
        )
    })

    response.once('close', () => {
        if (finished) return
        log('warn', 'request.aborted', {
            requestId,
            method: request.method,
            path,
            durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        })
    })

    next()
}
