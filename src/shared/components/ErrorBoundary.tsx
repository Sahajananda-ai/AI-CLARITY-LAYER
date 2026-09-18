import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * The demo equivalent of a seatbelt: if any screen throws, the judge sees a
 * recoverable message with a working "start over" button instead of a blank
 * white page in front of an audience.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept intentionally quiet for the demo build: one tidy log, no stack spam.
    console.error('[Paytm AI Clarity] screen error:', error.message, info.componentStack);
  }

  private reset = () => {
    try {
      window.localStorage.removeItem('paytm-clarity-state-v1');
    } catch {
      /* storage unavailable — nothing to clear */
    }
    window.location.href = '/';
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-surface-200 bg-white p-8 text-center shadow-card-hover">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning-100">
            <AlertTriangle className="h-6 w-6 text-warning-600" />
          </div>
          <h1 className="mb-2 text-xl font-bold text-surface-900">Something went wrong on this screen</h1>
          <p className="mb-6 text-sm text-surface-600">
            Your application data is safe. Restarting clears the in-progress demo so you can run through it again.
          </p>
          <button
            onClick={this.reset}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-primary-700"
          >
            <RotateCcw className="h-4 w-4" />
            Start over
          </button>
          <p className="mt-4 font-mono text-xs text-surface-400">{this.state.error.message}</p>
        </div>
      </div>
    );
  }
}
