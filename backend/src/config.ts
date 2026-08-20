export const config = {
  port: Number(process.env.PORT ?? 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  downloadSecret: process.env.DOWNLOAD_SECRET ?? 'local-development-secret-change-me',
  retentionMilliseconds: 24 * 60 * 60 * 1000,
}