import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message?: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown, info: ErrorInfo) {
    // Log to console so a devtools-open user sees the trace; upstream monitoring lands in Phase 20.
    console.error('[ErrorBoundary]', err, info.componentStack);
  }

  private reload = () => {
    try {
      window.location.reload();
    } catch {}
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="ambient min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 text-5xl">🍗</div>
        <h1 className="mb-1 text-2xl font-black text-brand-ink">Something went wrong</h1>
        <p className="mb-6 max-w-sm text-sm font-semibold text-brand-muted">
          {this.state.message || 'The app hit an unexpected error.'}
        </p>
        <button
          onClick={this.reload}
          className="rounded-2xl bg-brand-red px-6 py-3 text-sm font-black text-white shadow-red"
        >
          Reload
        </button>
      </div>
    );
  }
}
