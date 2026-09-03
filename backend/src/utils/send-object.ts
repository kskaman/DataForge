import type { Response } from 'express'
import { pipeline } from 'node:stream/promises'
import { objectStorage } from '../dependencies.js'

export async function sendObject(response: Response, key: string, fileName: string) {
    const [stream, size] = await Promise.all([
        objectStorage.openReadStream(key),
        objectStorage.getObjectSize(key),
    ])
    response.attachment(fileName)
    response.setHeader('Content-Length', size)
    await pipeline(stream, response)
}
