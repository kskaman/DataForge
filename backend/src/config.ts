const production = process.env.NODE_ENV === 'production'
const guestSessionSecret = process.env.GUEST_SESSION_SECRET ?? 'local-guest-session-secret-change-me'

if (production && !process.env.GUEST_SESSION_SECRET) {
  throw new Error('GUEST_SESSION_SECRET is required in production.')
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  downloadSecret: process.env.DOWNLOAD_SECRET ?? 'local-development-secret-change-me',
  guestSessionSecret,
  guestCookieName: 'dataforge_guest',
  production,
  retentionMilliseconds: 24 * 60 * 60 * 1000,
}