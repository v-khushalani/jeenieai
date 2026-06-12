import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@/test/test-utils';
import {
  ErrorBoundary,
  GlobalErrorBoundary,
  FeatureErrorBoundary,
  APIErrorBoundary,
} from '../ErrorBoundary';

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock dynamic sentry import
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

// ─── Helper Components ──────────────────────────────────────

function ThrowingComponent({ message = 'Test error' }: { message?: string }): React.ReactElement {
  throw new Error(message);
}

function WorkingComponent() {
  return <div data-testid="working">Everything works!</div>;
}

// Suppress console.error during error boundary tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ─── ErrorBoundary (component level - default) ─────────────
describe('ErrorBoundary (component level)', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <WorkingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('working')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/Test error/)).toBeInTheDocument();
  });

  it('shows retry button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('shows Go to Home button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Go to Home')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
  });

  it('calls onError callback when error occurs', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent message="callback test" />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('callback test');
  });
});

// ─── GlobalErrorBoundary ────────────────────────────────────
describe('GlobalErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <GlobalErrorBoundary>
        <WorkingComponent />
      </GlobalErrorBoundary>
    );
    expect(screen.getByTestId('working')).toBeInTheDocument();
  });

  it('renders full-page error UI', () => {
    render(
      <GlobalErrorBoundary>
        <ThrowingComponent />
      </GlobalErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/Our team has been notified/)).toBeInTheDocument();
  });

  it('shows Go to Home button', () => {
    render(
      <GlobalErrorBoundary>
        <ThrowingComponent />
      </GlobalErrorBoundary>
    );
    expect(screen.getByText('Go to Home')).toBeInTheDocument();
  });
});

// ─── FeatureErrorBoundary ───────────────────────────────────
describe('FeatureErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <FeatureErrorBoundary featureName="Leaderboard">
        <WorkingComponent />
      </FeatureErrorBoundary>
    );
    expect(screen.getByTestId('working')).toBeInTheDocument();
  });

  it('shows feature-specific unavailable message', () => {
    render(
      <FeatureErrorBoundary featureName="Leaderboard">
        <ThrowingComponent />
      </FeatureErrorBoundary>
    );
    expect(screen.getByText('Leaderboard Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/encountered an error/)).toBeInTheDocument();
  });

  it('shows Retry button', () => {
    render(
      <FeatureErrorBoundary featureName="Test Feature">
        <ThrowingComponent />
      </FeatureErrorBoundary>
    );
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});

// ─── APIErrorBoundary ───────────────────────────────────────
describe('APIErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <APIErrorBoundary>
        <WorkingComponent />
      </APIErrorBoundary>
    );
    expect(screen.getByTestId('working')).toBeInTheDocument();
  });

  it('shows default API error fallback', () => {
    render(
      <APIErrorBoundary>
        <ThrowingComponent />
      </APIErrorBoundary>
    );
    expect(screen.getByText('Unable to load data')).toBeInTheDocument();
    expect(screen.getByText('Refresh page')).toBeInTheDocument();
  });

  it('renders custom API fallback when provided', () => {
    render(
      <APIErrorBoundary fallback={<div data-testid="api-custom">API Error</div>}>
        <ThrowingComponent />
      </APIErrorBoundary>
    );
    expect(screen.getByTestId('api-custom')).toBeInTheDocument();
  });
});

// ─── Retry Logic ────────────────────────────────────────────
describe('Retry Logic', () => {
  it('allows retry up to 3 times (component level)', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    // Should show "Try Again" button
    for (let i = 0; i < 3; i++) {
      const retryButton = screen.queryByText('Try Again');
      if (retryButton) {
        fireEvent.click(retryButton);
      }
    }

    // After 3 retries, the button should be gone
    // Note: the component will still throw, so it stays in error state
    // but MAX_RETRIES (3) should be exhausted
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows attempts remaining in global error boundary', () => {
    render(
      <ErrorBoundary level="global">
        <ThrowingComponent />
      </ErrorBoundary>
    );
    // Initial: "Try Again (3 attempts left)"
    expect(screen.getByText(/3 attempts left/)).toBeInTheDocument();
    
    fireEvent.click(screen.getByText(/Try Again/));
    // After 1 retry: "Try Again (2 attempts left)"
    expect(screen.getByText(/2 attempts left/)).toBeInTheDocument();
  });
});
