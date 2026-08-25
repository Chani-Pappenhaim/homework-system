import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Catches uncaught render errors so they show a recoverable error screen
// instead of unmounting the whole React tree into a blank page. Meant to be
// remounted per route (key={pathname}) so leaving the broken page recovers.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
          <p className="text-lg font-bold text-foreground">אופס, משהו השתבש בטעינת העמוד</p>
          <p className="text-sm text-muted-foreground">
            נסו לרענן את הדף. אם הבעיה חוזרת, כדאי לדווח עליה.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow"
          >
            רענון הדף
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
