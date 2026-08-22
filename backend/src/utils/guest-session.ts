import { createHmac, randomBytes } from 'node:crypto'
import { config } from '../config.js'

const tokenPattern = /^[A-Za-z0-9_-]{43}$/

export function createGuestToken() {
    return randomBytes(32).toString('base64url')
}

export function isValidGuestToken(token: string | undefined): token is string {
    return tokenPattern.test(token ?? '')
}

export function ownerIdFromToken(token: string) {
    return createHmac('sha256', config.guestSessionSecret).update(token).digest('hex')
}

export function readGuestToken(cookieHeader: string | undefined) {
    if (!cookieHeader) return undefined

    for (const item of cookieHeader.split(';')) {
        const separator = item.indexOf('=')

        if (separator < 0 || item.slice(0, separator).trim() !== config.guestCookieName) {
            continue
        }

        try {
            const token = decodeURIComponent(item.slice(separator + 1).trim())
            return isValidGuestToken(token) ? token : undefined
        } catch {
            return undefined
        }
    }

    return undefined
}

export function guestCookie(token: string) {
    const attributes = [
        `${config.guestCookieName}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'SameSite=Lax',
        'Path=/',
        `Max-Age=${Math.floor(config.retentionMilliseconds / 1000)}`,
    ]

    if (config.production) attributes.push('Secure')

    return attributes.join('; ')
}
