declare global {
  namespace Express {
    interface Request {
      guestOwnerId: string
    }
  }
}

export {}