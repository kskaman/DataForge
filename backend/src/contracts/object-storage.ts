import type { Readable } from 'node:stream'

export type ObjectContent = Buffer | string | Readable

export interface ObjectStorage {
    initialize(): Promise<void>
    checkHealth(): Promise<void>
    putObject(key: string, content: ObjectContent): Promise<void>
    readObject(key: string): Promise<Buffer>
    openReadStream(key: string): Promise<Readable>
    getObjectSize(key: string): Promise<number>
    deleteObject(key: string): Promise<void>
}
