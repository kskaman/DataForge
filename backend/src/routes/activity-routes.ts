import { Router } from 'express'
import { getActivityHandler } from '../controllers/activity-controller.js'

export const activityRouter = Router()

activityRouter.get('/activity', getActivityHandler)
