type View = 'convert' | 'history'

type AppHeaderProps = {
  activeView: View
  historyCount: number
  serviceOnline: boolean
  onViewChange: (view: View) => void
}

export function AppHeader({ activeView, historyCount, serviceOnline, onViewChange }: AppHeaderProps) {
  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={() => onViewChange('convert')}>
        <span className="brand-mark" aria-hidden="true">DF</span><span>DataForge</span>
      </button>
      <nav aria-label="Primary navigation">
        <button className={activeView === 'convert' ? 'nav-button active' : 'nav-button'} type="button" onClick={() => onViewChange('convert')}>Convert</button>
        <button className={activeView === 'history' ? 'nav-button active' : 'nav-button'} type="button" onClick={() => onViewChange('history')}>History <span className="nav-count">{historyCount}</span></button>
      </nav>
      <div className={`service-state${serviceOnline ? '' : ' offline'}`}><span /> {serviceOnline ? 'Service operational' : 'Service unavailable'}</div>
    </header>
  )
}