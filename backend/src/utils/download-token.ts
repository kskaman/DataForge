import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'

export function signDownload(id: string, expires: number) {
  return createHmac('sha256', config.downloadSecret).update(`${id}:${expires}`).digest('hex')
}

export function hasValidSignature(id: string, expires: number, signature: string) {
  if (!Number.isFinite(expires) || expires < Date.now()) return false
  const expected = Buffer.from(signDownload(id, expires))
  const received = Buffer.from(signature)
  return expected.length === received.length && timingSafeEqual(expected, received)
}