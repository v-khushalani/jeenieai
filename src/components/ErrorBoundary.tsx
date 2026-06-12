import { Component, ReactNode, ErrorInfo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertCircle, RefreshCw, Home, AlertTriangle, Bug } from 'lucide-react';
import { logger } from '@/utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: 'global' | 'feature' | 'component';
  featureName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

const MAX_RETRIES = 3;

/**
 * Enterprise-grade Error Boundary component
 * 
 * Provides layered error handling:
 * - Global: Full-page error display
 * - Feature: Card-based error with retry
 * - Component: Minimal inline error
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { level = 'component', featureName, onError } = this.props;
    
    // Log error with context
    logger.error('ErrorBoundary caught an error:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      level,
      featureName,
    });
    
    this.setState({ errorInfo });
    onError?.(error, errorInfo);

    // Report to error tracking in production
    if (import.meta.env.PROD) {
      this.reportError(error, errorInfo);
    }
  }

  private reportError(error: Error, _errorInfo: ErrorInfo) {
    // Dynamically import Sentry to avoid circular deps. Swallow failures so the
    // boundary never introduces a second error while handling the first one.
    void import('@/lib/sentry')
      .then(({ captureError }) => {
        captureError(error, { boundary: this.props.featureName || this.props.level });
      })
      .catch(() => {
        // Sentry unavailable — silently ignore
      });
  }

  handleReset = () => {
    if (this.state.retryCount < MAX_RETRIES) {
      this.setState(prev => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prev.retryCount + 1,
      }));
    }
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    const { hasError, error, retryCount } = this.state;
    const { children, fallback, level = 'component', featureName } = this.props;

    if (!hasError) {
      return children;
    }

    // Use custom fallback if provided
    if (fallback) {
      return fallback;
    }

    const canRetry = retryCount < MAX_RETRIES;

    // Global level - full page error
    if (level === 'global') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-50 to-gray-100 p-4">
          <Card className="max-w-md w-full shadow-xl">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <CardTitle className="text-xl text-gray-900">Something went wrong</CardTitle>
              <CardDescription>
                We're sorry, but something unexpected happened. Our team has been notified.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {import.meta.env.DEV && error && (
                <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 overflow-auto max-h-32">
                  {error.message}
                </div>
              )}
              <div className="flex flex-col gap-2">
                {canRetry && (
                  <Button onClick={this.handleReset} className="w-full">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Try Again ({MAX_RETRIES - retryCount} attempts left)
                  </Button>
                )}
                <Button variant="outline" onClick={this.handleGoHome} className="w-full">
                  <Home className="w-4 h-4 mr-2" />
                  Go to Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Feature level - contained card error
    if (level === 'feature') {
      return (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <CardTitle className="text-base text-orange-900">
                {featureName || 'Feature'} Unavailable
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-orange-700 mb-4">
              This section encountered an error. You can try again or continue using other features.
            </p>
            {canRetry && (
              <Button onClick={this.handleReset} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            )}
          </CardContent>
        </Card>
      );
    }

    // Component level - default minimal UI
    return (
      <div className="min-h-[200px] flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-gray-600 mb-6">
            {error?.message || 'An unexpected error occurred'}
          </p>
          <div className="space-y-3">
            {canRetry && (
              <Button onClick={this.handleReset} className="w-full">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            )}
            <Button
              variant="outline"
              onClick={this.handleGoHome}
              className="w-full"
            >
              Go to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * Global Error Boundary wrapper
 */
export function GlobalErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary 
      level="global"
      onError={(error) => {
        logger.error('Global error boundary triggered', { error: error.message });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * Feature Error Boundary wrapper
 */
export function FeatureErrorBoundary({ 
  children, 
  featureName 
}: { 
  children: ReactNode; 
  featureName: string;
}) {
  return (
    <ErrorBoundary level="feature" featureName={featureName}>
      {children}
    </ErrorBoundary>
  );
}

/**
 * API Error Boundary - for async/data loading errors
 */
export function APIErrorBoundary({ 
  children,
  fallback,
}: { 
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <ErrorBoundary 
      level="component" 
      fallback={fallback || (
        <div className="text-center p-4">
          <Bug className="w-6 h-6 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Unable to load data</p>
          <Button 
            variant="link" 
            size="sm" 
            onClick={() => window.location.reload()}
          >
            Refresh page
          </Button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
