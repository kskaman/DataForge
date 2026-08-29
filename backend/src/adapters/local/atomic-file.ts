import { rename } from 'node:fs/promises'
import { setTimeout as wait } from 'node:timers/promises'

type RenameFile = (sourcePath: string, destinationPath: string) => Promise<void>
type Wait = (milliseconds: number) => Promise<unknown>

const retryableErrorCodes = new Set(['EACCES', 'EBUSY', 'EPERM'])

export async function replaceFile(
    sourcePath: string,
    destinationPath: string,
    renameFile: RenameFile = rename,
    waitForRetry: Wait = wait,
) {
    const attempts = 6

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            await renameFile(sourcePath, destinationPath)
            return
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code
            const finalAttempt = attempt === attempts - 1
            if (!code || !retryableErrorCodes.has(code) || finalAttempt) throw error
            await waitForRetry(10 * 2 ** attempt)
        }
    }
}
