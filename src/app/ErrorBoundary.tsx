import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Last line of defence: a render crash shows a calm, recoverable panel instead
 * of a blank window. Raw stack traces are only surfaced in dev builds.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[crest] render error', error, info.componentStack)
    }
  }

  private handleReload = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className={styles.wrap} role="alert">
        <div className={styles.card}>
          <h1 className={styles.title}>Crest ran into a problem</h1>
          <p className={styles.body}>
            Something went wrong while rendering this view. Reloading usually clears it — your library and queue are
            untouched.
          </p>
          {import.meta.env.DEV ? <pre className={styles.detail}>{error.message}</pre> : null}
          <button type="button" className={styles.action} onClick={this.handleReload}>
            Reload Crest
          </button>
        </div>
      </div>
    )
  }
}
