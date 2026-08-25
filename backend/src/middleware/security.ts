import type { NextFunction, Request, Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { config } from '../config.js'

export const securityHeaders = helmet(config.production ? {} : { strictTransportSecurity: false })

export function requireTrustedOrigin(request: Request, response: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next()

    const origin = request.get('origin')
    const fetchSite = request.get('sec-fetch-site')
    if (fetchSite === 'cross-site' || (origin && origin !== config.frontendOrigin)) {
        return response.status(403).json({ error: 'Cross-origin request denied.' })
    }

    return next()
}

export function createRateLimiter(
    limit: number,
    message: string,
    keyGenerator?: (request: Request) => string,
) {
    const options = {
        windowMs: config.rateLimitWindowMilliseconds,
        limit,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (_request: Request, response: Response) =>
            response.status(429).json({ error: message }),
    } as const

    return rateLimit(keyGenerator ? { ...options, keyGenerator } : options)
}

export const apiRateLimiter = createRateLimiter(
    config.apiRateLimit,
    'Too many API requests. Try again later.',
    (request) => request.guestOwnerId,
)

export const writeRateLimiter = createRateLimiter(
    config.writeRateLimit,
    'Too many conversion requests. Try again later.',
)
