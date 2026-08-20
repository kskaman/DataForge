import type { NextFunction, Request, Response } from 'express'
import { createGuestToken, guestCookie, ownerIdFromToken, readGuestToken } from '../utils/guest-session.js'

export function guestSession(request: Request, response: Response, next: NextFunction) {
  const existingToken = readGuestToken(request.headers.cookie)
  const token = existingToken ?? createGuestToken()
  request.guestOwnerId = ownerIdFromToken(token)
  response.setHeader('Set-Cookie', guestCookie(token))
  next()
}