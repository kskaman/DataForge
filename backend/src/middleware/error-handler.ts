import type { ErrorRequestHandler } from 'express'
import multer from 'multer'
import { config } from '../config.js'
import { publicErrorMessage } from '../utils/public-error.js'
import { errorDetails, log } from '../utils/logger.js'

type RequestBodyError = Error & { status?: number; type?: string }

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return response.status(413).json({ error: 'File size must be 50 MB or less.' })
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return response.status(413).json({ error: 'Choose no more than 20 files.' })
        }
        return response.status(400).json({ error: 'Invalid file upload.' })
    }

    const bodyError = error as RequestBodyError
    if (bodyError.type === 'entity.too.large') {
        return response.status(413).json({ error: 'Request body is too large.' })
    }
    if (bodyError.status === 400 && error instanceof SyntaxError) {
        return response.status(400).json({ error: 'Request body contains invalid JSON.' })
    }

    log('error', 'request.failed', {
        requestId: request.requestId,
        method: request.method,
        path: request.originalUrl.split('?', 1)[0],
        ...errorDetails(error),
    })

    return response
        .status(500)
        .json({ error: publicErrorMessage(error, 'Unexpected server error.', config.production) })
}
