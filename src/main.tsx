import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { HabitTracker } from './HabitTracker'
import './index.css'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

function reloadCleanly() {
  try {
    if (typeof caches !== 'undefined') {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).finally(() => {
        location.reload()
      })
      return
    }
  } catch {
    // ignore
  }
  location.reload()
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#FAFAF9',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#292524',
          textAlign: 'center'
        }}>
          <div style={{
            background: 'white',
            padding: '32px',
            borderRadius: '16px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.06)',
            maxWidth: '480px',
            width: '100%',
            border: '1px solid #E7E5E4'
          }}>
            <div style={{ fontSize: '42px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>Something went wrong</h2>
            <p style={{ fontSize: '14px', color: '#78716C', marginBottom: '20px', lineHeight: '1.5' }}>
              The application encountered an unexpected issue. Please click below to refresh and load cleanly.
            </p>
            <button
              onClick={() => reloadCleanly()}
              style={{
                background: '#C4704B',
                color: 'white',
                border: 'none',
                padding: '10px 24px',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'background 0.2s'
              }}
            >
              Reload Tracker
            </button>
            {this.state.error && (
              <details style={{ marginTop: '20px', textAlign: 'left', fontSize: '12px', color: '#DC2626' }}>
                <summary style={{ cursor: 'pointer', color: '#78716C' }}>Technical details</summary>
                <pre style={{ marginTop: '8px', padding: '10px', background: '#FEF2F2', borderRadius: '6px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HabitTracker />
    </ErrorBoundary>
  </React.StrictMode>,
)

