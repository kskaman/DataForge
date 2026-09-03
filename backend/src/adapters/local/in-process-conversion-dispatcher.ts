import type {
    ConversionCommand,
    ConversionDispatcher,
} from '../../contracts/conversion-dispatcher.js'
import { errorDetails, log } from '../../utils/logger.js'

type CommandHandler = (command: ConversionCommand) => Promise<void>
type Scheduler = (task: () => void) => void

export class InProcessConversionDispatcher implements ConversionDispatcher {
    readonly provider = 'in-process'

    constructor(
        private readonly handleCommand: CommandHandler,
        private readonly schedule: Scheduler = (task) => setImmediate(task),
    ) {}

    async initialize() {}

    async checkHealth() {}

    async dispatch(command: ConversionCommand) {
        this.schedule(() => {
            void this.handleCommand(command).catch((error) => {
                log('error', 'dispatch.command_failed', {
                    commandType: command.type,
                    ...('jobId' in command
                        ? { jobId: command.jobId }
                        : { batchId: command.batchId }),
                    ...errorDetails(error),
                })
            })
        })
    }
}
