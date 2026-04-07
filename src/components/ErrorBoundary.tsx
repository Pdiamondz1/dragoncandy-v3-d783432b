
import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
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
    console.error('🚨 ErrorBoundary: Caught error:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🚨 ErrorBoundary: Component error details:', {
      error: error.message,
      stack: error.stack,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
          <div className="text-center space-y-4 max-w-md p-6">
            <div className="text-2xl font-bold text-pink-600">DragonCandy</div>
            <div className="text-xl font-medium text-gray-800">Something went wrong</div>
            <div className="text-gray-600">
              Refresh to try again.
            </div>
            {this.state.error && (
              <details className="mt-4 p-4 bg-gray-100 rounded-lg text-left text-sm">
                <summary className="cursor-pointer font-medium">Error Details</summary>
                <div className="mt-2 text-gray-700">
                  <div className="font-medium">Message:</div>
                  <div className="mb-2">{this.state.error.message}</div>
                  {this.state.error.stack && (
                    <>
                      <div className="font-medium">Stack:</div>
                      <pre className="text-xs overflow-auto max-h-32">
                        {this.state.error.stack}
                      </pre>
                    </>
                  )}
                </div>
              </details>
            )}
            {/* TODO: integrate Sentry error reporting */}
            <div className="space-y-2">
              <button
                onClick={() => window.location.reload()}
                className="block w-full px-4 py-2 bg-[#4DD9C0] text-white rounded-full font-bold hover:bg-[#3ec4ac] transition-colors"
              >
                Refresh
              </button>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: undefined });
                  window.location.href = '/landing';
                }}
                className="block w-full px-4 py-2 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-colors"
              >
                Go to Landing Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
