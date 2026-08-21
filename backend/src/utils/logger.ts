export function log(
    level: 'info' | 'error', 
    event: string, details: Record<string, unknown> = {}) {

    console.log(JSON.stringify({ 
        timestamp: new Date().toISOString(), 
        level, 
        event, 
        ...details 
    }))
}