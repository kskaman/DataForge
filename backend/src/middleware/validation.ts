import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { outputFormats } from '../types.js'

const idSchema = z.uuid()

export const idParamsSchema = z.object({ id: idSchema }).strict()

export const downloadQuerySchema = z
    .object({
        expires: z.coerce.number().int().positive(),
        token: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict()

export const jobUploadFieldsSchema = z
    .object({
        format: z.enum(outputFormats),
        splitSheets: z.enum(['true', 'false']),
    })
    .strict()

export const batchConfigurationSchema = z.discriminatedUnion('strategy', [
    z
        .object({
            strategy: z.enum(['separate', 'merge']),
            format: z.enum(outputFormats),
            sqliteLayout: z.never().optional(),
        })
        .strict(),
    z
        .object({
            strategy: z.literal('sqlite'),
            sqliteLayout: z.enum(['per_source', 'grouped']),
            format: z.never().optional(),
        })
        .strict(),
])

type RequestPart = 'body' | 'params' | 'query'

export function validateRequest(schema: z.ZodType, part: RequestPart) {
    return (request: Request, response: Response, next: NextFunction) => {
        const result = schema.safeParse(request[part])
        if (!result.success) {
            return response.status(400).json({
                error: 'Invalid request.',
                details: result.error.issues.map((issue) => ({
                    path: issue.path.join('.') || part,
                    message: issue.message,
                })),
            })
        }

        if (part !== 'query') request[part] = result.data
        return next()
    }
}
