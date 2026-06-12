// Only initialize in production or when DSN is set
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
let sentryModule: typeof import('@sentry/react') | null = null;

const getSentry = async () => {
  if (!sentryModule) {
    sentryModule = await import('@sentry/react');
  }
  return sentryModule;
};

export const initSentry = () => {
  if (!SENTRY_DSN || import.meta.env.DEV) {
    return;
  }

  void (async () => {
    const Sentry = await getSentry();

    Sentry.init({
      dsn: SENTRY_DSN,
      environment: import.meta.env.MODE,
      
      // Performance monitoring
      tracesSampleRate: 0.1, // 10% of transactions
      
      // Session replay
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      
      // Integration options
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          // Privacy: mask all text and block all media by default
          maskAllText: true,
          maskAllInputs: true,
          blockAllMedia: true,
        }),
      ],

      // Do not send default PII (IP, cookies, etc.)
      sendDefaultPii: false,

      // Filter sensitive data
      beforeSend(event) {
        if (event.request?.headers) {
          delete event.request.headers['Authorization'];
          delete event.request.headers['Cookie'];
          delete event.request.headers['apikey'];
        }
        // Strip cookies and query strings that may contain tokens
        if (event.request) {
          delete (event.request as any).cookies;
          if (event.request.url) {
            try {
              const u = new URL(event.request.url);
              ['access_token', 'refresh_token', 'token', 'apikey'].forEach(k => u.searchParams.delete(k));
              event.request.url = u.toString();
            } catch { /* ignore */ }
          }
        }
        // Drop email/phone from user
        if (event.user) {
          delete event.user.email;
          delete (event.user as any).ip_address;
        }
        return event;
      },

      // Ignore common non-actionable errors
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        'Non-Error exception captured',
        'Network Error',
        'AbortError',
      ],
    });
  })();
};

// Helper to set user context (id only — no PII)
export const setSentryUser = (user: { id: string } | null) => {
  if (!sentryModule) return;
  const Sentry = sentryModule;
  Sentry.setUser(user ? { id: user.id } : null);
};

// Helper to capture custom messages
export const captureMessage = (message: string, level: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug' = 'info') => {
  if (!sentryModule) return;
  sentryModule.captureMessage(message, level);
};

// Helper to capture errors with additional context
export const captureError = (error: Error, context?: Record<string, any>) => {
  if (!sentryModule) return;

  const Sentry = sentryModule;
  Sentry.withScope((scope) => {
    if (context) {
      Object.keys(context).forEach((key) => {
        scope.setExtra(key, context[key]);
      });
    }
    Sentry.captureException(error);
  });
};

// Helper to add breadcrumb
export const addBreadcrumb = (
  message: string,
  category: string,
  data?: Record<string, any>
) => {
  if (!sentryModule) return;

  sentryModule.addBreadcrumb({
    message,
    category,
    data,
    timestamp: Date.now() / 1000,
  });
};
