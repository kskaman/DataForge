export function publicErrorMessage(error: unknown, fallback: string, production: boolean) {
    if (production) return fallback
    return error instanceof Error ? error.message : fallback
}
