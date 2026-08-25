import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Without this, any uncaught render error (e.g. a page choking on an
// unexpected 403/network response) unmounts the whole React tree and leaves
// a blank white screen — which reads to a user as "the site just crashes for
// no reason". This catches it and shows a recoverable Hebrew error screen
// instead. The caller remounts this per-route (key={pathname}) so navigating
// away from the broken page recovers automatically.
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
