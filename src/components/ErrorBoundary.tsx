
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: 'page' | 'section' | 'widget';
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    console.error('[ErrorBoundary] Caught error:', error);
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Component error details:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const isPage = !this.props.level || this.props.level === 'page';

      return (
        <div className={`flex flex-col items-center justify-center ${
          isPage ? 'min-h-screen bg-gray-50' : 'min-h-[200px]'
        } p-6 text-center`}>
          <div className="max-w-md space-y-4">
            {isPage && (
              <div className="text-2xl font-bold text-pink-600">DragonCandy</div>
            )}
            <div className={isPage ? 'text-xl font-medium text-gray-800' : 'text-lg font-semibold text-gray-900'}>
              {isPage ? 'Something went wrong' : 'This section had an issue'}
            </div>
            <p className="text-sm text-gray-500">
              {isPage
                ? "We hit a bump. Let's try that again."
                : "This part couldn't load properly."}
            </p>
            {this.state.error && (
              <details className="p-4 bg-gray-100 rounded-lg text-left text-sm">
                <summary className="cursor-pointer font-medium">Error Details</summary>
                <div className="mt-2 text-gray-700">
                  <div className="font-medium">Message:</div>
                  <div className="mb-2">{this.state.error.message}</div>
                </div>
              </details>
            )}
            <div className="space-y-2">
              <button
                onClick={this.handleRetry}
                className="block w-full px-6 py-2.5 bg-dc-teal text-white rounded-full font-bold hover:bg-dc-teal-hover transition-colors"
              >
                Try Again
              </button>
              {isPage && (
                <button
                  onClick={() => { window.location.href = '/dashboard'; }}
                  className="block w-full text-sm text-gray-400 hover:text-gray-600 underline"
                >
                  Go to Dashboard
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
