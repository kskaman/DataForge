import { useState } from 'react'
import './App.css'
import { AppHeader } from './components/AppHeader'
import { ActivityTable } from './features/activity/ActivityTable'
import { ConversionWorkspace } from './features/conversion/ConversionWorkspace'
import { useActivityFeed } from './hooks/useActivityFeed'

type View = 'convert' | 'history'

function App() {
    const [activeView, setActiveView] = useState<View>('convert')
    const [error, setError] = useState('')
    const activity = useActivityFeed()

    const runAction = async (action: () => Promise<void>, fallback: string) => {
        try {
            await action()
            setError('')
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : fallback)
        }
    }

    return (
        <div className="app-shell">
            <AppHeader
                activeView={activeView}
                historyCount={activity.jobs.length + activity.batches.length}
                serviceOnline={activity.serviceOnline}
                onViewChange={setActiveView}
            />

            <main>
                <section className="page-heading">
                    <div>
                        <p className="eyebrow">Spreadsheet utility</p>
                        <h1>{activeView === 'convert' ? 'Convert files' : 'Conversion history'}</h1>
                        <p className="heading-copy">
                            {activeView === 'convert'
                                ? 'Transform Excel and CSV data into clean, portable formats.'
                                : 'Track recent files, retrieve results, and retry failed jobs.'}
                        </p>
                    </div>
                    {activity.processingCount >= 0 && (
                        <div className="activity-pill">{activity.processingCount} active</div>
                    )}
                </section>

                {error && (
                    <p className="global-error" role="alert">
                        {error}
                    </p>
                )}

                {activeView === 'convert' && (
                    <ConversionWorkspace
                        batches={activity.batches}
                        onBatchChange={activity.upsertBatch}
                        onError={setError}
                    />
                )}

                <ActivityTable
                    jobs={activity.jobs}
                    batches={activity.batches}
                    historyView={activeView === 'history'}
                    onViewAll={() => setActiveView('history')}
                    onDownloadJob={(id) =>
                        void runAction(() => activity.downloadJob(id), 'Download failed.')
                    }
                    onRetryJob={(id) =>
                        void runAction(() => activity.retryJob(id), 'Retry failed.')
                    }
                    onDownloadBatch={(id) =>
                        void runAction(() => activity.downloadBatch(id), 'Download failed.')
                    }
                    onRetryBatch={(id) =>
                        void runAction(() => activity.retryBatchJob(id), 'Batch retry failed.')
                    }
                />
            </main>

            <footer>
                <span>DataForge</span>
                <span>Anonymous history is private to this browser for 24 hours.</span>
            </footer>
        </div>
    )
}

export default App
