declare global {
    namespace Express {
        interface Request {
            guestOwnerId: string
            requestId: string
        }
    }
}

export {}
